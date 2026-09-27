// =====================================================================
//  Online Bookstore - CI/CD pipeline
//  Checkout -> Build -> Test -> Code Quality -> Security -> Deploy (staging)
//           -> Release (production) -> Monitoring & Alerting
// =====================================================================
pipeline {
  agent any

  parameters {
    booleanParam(name: 'REQUIRE_APPROVAL', defaultValue: false,
                 description: 'Pause for manual approval before releasing to production')
    booleanParam(name: 'SIMULATE_INCIDENT', defaultValue: false,
                 description: 'Inject 5xx errors in production to prove alerting works')
    booleanParam(name: 'PUSH_GIT_TAG', defaultValue: false,
                 description: 'Push the release git tag to GitHub (needs github-token credential)')
  }

  // Local Jenkins cannot receive GitHub webhooks, so poll the repo every ~2 minutes.
  triggers { pollSCM('H/2 * * * *') }

  options {
    timestamps()
    disableConcurrentBuilds()
    buildDiscarder(logRotator(numToKeepStr: '20', artifactNumToKeepStr: '10'))
    timeout(time: 45, unit: 'MINUTES')
  }

  environment {
    APP_NAME        = 'online-bookstore'
    REGISTRY        = 'localhost:5001'
    npm_config_cache = "${JENKINS_HOME}/.cache/npm"
    TRIVY_CACHE_DIR = "${JENKINS_HOME}/.cache/trivy"
    REPORTS         = 'reports'
    CI              = 'true'
  }

  stages {

    // ------------------------------------------------------------------
    stage('Checkout & Version') {
      steps {
        checkout scm
        script {
          env.VERSION   = readFile('VERSION').trim()
          env.GIT_SHA   = sh(script: 'git rev-parse --short HEAD', returnStdout: true).trim()
          env.IMAGE_TAG = "${env.VERSION}-b${env.BUILD_NUMBER}-${env.GIT_SHA}"
          env.IMAGE     = "${env.REGISTRY}/${env.APP_NAME}:${env.IMAGE_TAG}"
          currentBuild.displayName = "#${env.BUILD_NUMBER} v${env.IMAGE_TAG}"
        }
        sh 'mkdir -p ${REPORTS} && node --version && npm --version'
      }
    }

    // ------------------------------------------------------------------
    stage('Build') {
      steps {
        sh '''
          # Exact dependency tree from package-lock.json (reproducible)
          npm ci --no-audit --no-fund
          docker build \
            --build-arg APP_VERSION=${IMAGE_TAG} \
            --build-arg GIT_COMMIT=${GIT_SHA} \
            --build-arg BUILD_DATE=$(date -u +%Y-%m-%dT%H:%M:%SZ) \
            -t ${IMAGE} .
          # Artefact storage: push the versioned image to the private registry
          docker push ${IMAGE}
          docker image inspect ${IMAGE} --format '{{json .Config.Labels}}' > ${REPORTS}/build-info.json
        '''
        archiveArtifacts artifacts: "${REPORTS}/build-info.json", fingerprint: true
      }
    }

    // ------------------------------------------------------------------
    stage('Test') {
      environment {
        JEST_JUNIT_OUTPUT_DIR = 'reports'
      }
      steps {
        sh '''
          # Unit tests: pure business rules (pricing, validation, migrations)
          JEST_JUNIT_OUTPUT_NAME=junit-unit.xml \
            npx jest tests/unit --ci --reporters=default --reporters=jest-junit
          # Integration tests: HTTP -> Express -> SQLite with Supertest.
          # Full run with coverage; jest fails the build under the thresholds in package.json.
          JEST_JUNIT_OUTPUT_NAME=junit-all.xml \
            npx jest --ci --coverage --reporters=default --reporters=jest-junit
        '''
      }
      post {
        always {
          junit testResults: "${REPORTS}/junit-*.xml", allowEmptyResults: false
          recordCoverage(tools: [[parser: 'COBERTURA', pattern: 'coverage/cobertura-coverage.xml']],
                         qualityGates: [[threshold: 80.0, metric: 'LINE', baseline: 'PROJECT', criticality: 'FAILURE']])
          publishHTML(target: [reportDir: 'coverage/lcov-report', reportFiles: 'index.html',
                               reportName: 'Coverage Report', keepAll: true, alwaysLinkToLastBuild: true,
                               allowMissing: true])
        }
      }
    }

    // ------------------------------------------------------------------
    stage('Code Quality') {
      steps {
        // ESLint (style, complexity, bug patterns) -> imported into SonarQube
        sh 'npx eslint . -f json -o ${REPORTS}/eslint.json || true'
        sh 'npx eslint . --max-warnings 10'   // local gate: 0 errors, <= 10 warnings
        withSonarQubeEnv('sonarqube') {
          sh 'sonar-scanner -Dsonar.projectVersion=${IMAGE_TAG}'
        }
        // Block until SonarQube evaluates the custom "Bookstore Gate"
        timeout(time: 5, unit: 'MINUTES') {
          waitForQualityGate abortPipeline: true
        }
      }
      post {
        always {
          recordIssues(enabledForFailure: true, tools: [esLint(pattern: "${REPORTS}/eslint.json")])
        }
      }
    }

    // ------------------------------------------------------------------
    stage('Security') {
      parallel {
        stage('SAST - ESLint security') {
          steps {
            sh '''
              npx eslint -c eslint.security.config.js . -f json -o ${REPORTS}/eslint-security.json || true
              # Gate: any error (e.g. XSS sink, eval, unsafe regex) fails the build
              npx eslint -c eslint.security.config.js .
            '''
          }
        }
        stage('SCA - npm audit') {
          steps {
            sh '''
              npm audit --json > ${REPORTS}/npm-audit.json || true
              # Gate: moderate+ vulnerability in a PRODUCTION dependency fails the build
              npm audit --omit=dev --audit-level=moderate
            '''
          }
        }
        stage('Container - Trivy') {
          steps {
            sh '''
              trivy image --cache-dir ${TRIVY_CACHE_DIR} --format json -o ${REPORTS}/trivy-image.json ${IMAGE}
              trivy image --cache-dir ${TRIVY_CACHE_DIR} --severity HIGH,CRITICAL ${IMAGE}
              # Gate: fixable HIGH/CRITICAL CVEs fail the build (.trivyignore = documented exceptions)
              trivy image --cache-dir ${TRIVY_CACHE_DIR} --severity HIGH,CRITICAL --ignore-unfixed \
                          --ignorefile .trivyignore --exit-code 1 ${IMAGE}
            '''
          }
        }
        stage('Secrets & IaC - Trivy fs') {
          steps {
            sh '''
              trivy fs --cache-dir ${TRIVY_CACHE_DIR} --scanners secret,misconfig \
                       --skip-dirs node_modules --format json -o ${REPORTS}/trivy-fs.json .
              # Gate: any leaked secret fails the build
              trivy fs --cache-dir ${TRIVY_CACHE_DIR} --scanners secret --skip-dirs node_modules --exit-code 1 .
            '''
          }
        }
      }
      post {
        always {
          sh 'python3 scripts/security_summary.py ${REPORTS} || true'
          archiveArtifacts artifacts: "${REPORTS}/*.json, ${REPORTS}/security-summary.md", allowEmptyArchive: true
        }
      }
    }

    // ------------------------------------------------------------------
    stage('Deploy to Staging') {
      steps {
        withCredentials([string(credentialsId: 'staging-session-secret', variable: 'SESSION_SECRET')]) {
          sh 'scripts/deploy.sh staging ${IMAGE}'   // health-gated, auto-rollback on failure
        }
        // End-to-end smoke tests against the REAL staging container
        sh '''
          BASE_URL=http://bookstore-staging:3000 EXPECTED_VERSION=${IMAGE_TAG} \
          JEST_JUNIT_OUTPUT_DIR=${REPORTS} JEST_JUNIT_OUTPUT_NAME=junit-smoke-staging.xml \
            npx jest tests/smoke --ci --reporters=default --reporters=jest-junit
        '''
      }
      post {
        always { junit testResults: "${REPORTS}/junit-smoke-staging.xml", allowEmptyResults: true }
      }
    }

    // ------------------------------------------------------------------
    stage('Release to Production') {
      // Only release from main (works for both Multibranch and single Pipeline jobs)
      when { expression { !env.BRANCH_NAME || env.BRANCH_NAME ==~ /main|master/ } }
      steps {
        script {
          if (params.REQUIRE_APPROVAL) {
            timeout(time: 15, unit: 'MINUTES') {
              input message: "Promote ${env.IMAGE_TAG} to PRODUCTION?", ok: 'Release'
            }
          }
          env.RELEASE_TAG = "v${env.VERSION}-b${env.BUILD_NUMBER}"
        }
        // Promote the SAME tested image (no rebuild) with immutable + moving tags
        sh '''
          docker tag ${IMAGE} ${REGISTRY}/${APP_NAME}:${RELEASE_TAG}
          docker tag ${IMAGE} ${REGISTRY}/${APP_NAME}:production
          docker push ${REGISTRY}/${APP_NAME}:${RELEASE_TAG}
          docker push ${REGISTRY}/${APP_NAME}:production
        '''
        withCredentials([string(credentialsId: 'prod-session-secret', variable: 'SESSION_SECRET')]) {
          sh 'scripts/deploy.sh production ${REGISTRY}/${APP_NAME}:${RELEASE_TAG}'
        }
        sh '''
          # Production smoke test: read-only checks (no fake customers/orders in prod)
          BASE_URL=http://bookstore-production:3000 EXPECTED_VERSION=${RELEASE_TAG} SMOKE_READ_ONLY=true \
          JEST_JUNIT_OUTPUT_DIR=${REPORTS} JEST_JUNIT_OUTPUT_NAME=junit-smoke-prod.xml \
            npx jest tests/smoke --ci --reporters=default --reporters=jest-junit
          # Release notes = commits since the previous release tag
          PREV=$(git describe --tags --abbrev=0 HEAD 2>/dev/null || git rev-list --max-parents=0 HEAD | tail -1)
          git -c user.name=jenkins -c user.email=jenkins@localhost \
              tag -a ${RELEASE_TAG} -m "Release ${RELEASE_TAG} (image ${IMAGE})"
          {
            echo "# Release ${RELEASE_TAG}"
            echo "Image: ${REGISTRY}/${APP_NAME}:${RELEASE_TAG}"
            echo "Date: $(date -u)"
            echo; echo "## Changes"
            git log --pretty='- %h %s (%an)' ${PREV}..HEAD
          } > ${REPORTS}/release-notes.md
          cat ${REPORTS}/release-notes.md
        '''
        script {
          if (params.PUSH_GIT_TAG) {
            withCredentials([usernamePassword(credentialsId: 'github-token',
                                              usernameVariable: 'GH_USER', passwordVariable: 'GH_TOKEN')]) {
              sh '''
                REMOTE=$(git config --get remote.origin.url | sed "s#https://#https://${GH_USER}:${GH_TOKEN}@#")
                git push "$REMOTE" ${RELEASE_TAG}
              '''
            }
          }
        }
        archiveArtifacts artifacts: "${REPORTS}/release-notes.md"
      }
      post {
        always { junit testResults: "${REPORTS}/junit-smoke-prod.xml", allowEmptyResults: true }
      }
    }

    // ------------------------------------------------------------------
    stage('Monitoring & Alerting') {
      when { expression { !env.BRANCH_NAME || env.BRANCH_NAME ==~ /main|master/ } }
      steps {
        script {
          def flag = params.SIMULATE_INCIDENT ? '--simulate-incident' : ''
          def rc = sh(script: "python3 scripts/monitor_check.py ${flag}", returnStatus: true)
          if (rc == 2) {
            unstable('Critical production alert is firing - check Grafana / Alertmanager')
          } else if (rc != 0) {
            error('Monitoring verification failed')
          }
        }
      }
      post {
        always { archiveArtifacts artifacts: "${REPORTS}/monitoring.json", allowEmptyArchive: true }
      }
    }
  }

  post {
    success {
      echo "SUCCESS: ${env.IMAGE_TAG} is live. Shop: http://localhost:8002  Grafana: http://localhost:3000/d/bookstore-overview"
    }
    unstable {
      echo 'UNSTABLE: deployed, but monitoring reports a problem.'
    }
    failure {
      echo 'FAILED - see the red stage. Staging/production were auto-rolled back if a deploy failed.'
    }
  }
}
