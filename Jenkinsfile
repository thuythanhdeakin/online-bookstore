// =====================================================================
//  Online Bookstore - CI/CD pipeline (runs on a Jenkins installed on the
//  Mac via Homebrew - NO Docker needed; see Jenkinsfile.docker for the
//  containerised variant)
//
//  Checkout -> Build -> Test -> Code Quality -> Security -> Deploy (staging)
//           -> Release (production) -> Monitoring & Alerting
// =====================================================================
// Report publishers (Coverage / Warnings / HTML Publisher plugins) are optional:
// if a plugin is not installed the step is skipped instead of failing the build.
def optionalPlugin(String what, Closure body) {
  try {
    body()
  } catch (NoSuchMethodError e) {
    echo "[skipped] ${what}: Jenkins plugin not installed"
  }
}

pipeline {
  agent any

  parameters {
    booleanParam(name: 'REQUIRE_APPROVAL', defaultValue: false,
                 description: 'Pause for manual approval before releasing to production')
    booleanParam(name: 'SIMULATE_INCIDENT', defaultValue: false,
                 description: 'Inject 5xx errors in production to prove alerting works')
    booleanParam(name: 'USE_SONARQUBE', defaultValue: false,
                 description: 'Also analyse with SonarQube (needs a SonarQube server configured as "sonarqube")')
    booleanParam(name: 'PUSH_GIT_TAG', defaultValue: false,
                 description: 'Push the release git tag to GitHub (uses the github-token credential)')
  }

  // Local Jenkins cannot receive GitHub webhooks, so poll the repo every ~2 minutes.
  triggers { pollSCM('H/2 * * * *') }

  options {
    timestamps()
    disableConcurrentBuilds()
    buildDiscarder(logRotator(numToKeepStr: '20', artifactNumToKeepStr: '10'))
    timeout(time: 30, unit: 'MINUTES')
  }

  environment {
    // Homebrew locations (Apple Silicon + Intel) - Jenkins started by brew has a minimal PATH
    PATH = "/opt/homebrew/bin:/usr/local/bin:${env.PATH}"
    APP_NAME       = 'online-bookstore'
    REPORTS        = 'reports'
    ARTIFACT_STORE = "${env.HOME}/bookstore-artifacts"
    DEPLOY_ROOT    = "${env.HOME}/bookstore-deploy"
    // Keep pm2 (and the apps it runs) alive after the build finishes
    JENKINS_NODE_COOKIE = 'dontKillMe'
    CI = 'true'
  }

  stages {

    // ------------------------------------------------------------------
    stage('Checkout & Version') {
      steps {
        checkout scm
        script {
          env.VERSION   = readFile('VERSION').trim()
          env.GIT_SHA   = sh(script: 'git rev-parse --short HEAD', returnStdout: true).trim()
          env.BUILD_TAG_NAME = "${env.VERSION}-b${env.BUILD_NUMBER}-${env.GIT_SHA}"
          env.ARTEFACT  = "dist/${env.APP_NAME}-${env.BUILD_TAG_NAME}.tar.gz"
          currentBuild.displayName = "#${env.BUILD_NUMBER} ${env.BUILD_TAG_NAME}"
        }
        sh '''
          mkdir -p ${REPORTS}
          echo "node $(node --version) | npm $(npm --version) | pm2 $(pm2 --version 2>/dev/null || echo MISSING)"
        '''
      }
    }

    // ------------------------------------------------------------------
    stage('Build') {
      steps {
        sh '''
          npm ci --no-audit --no-fund
          # Versioned + checksummed release artefact, copied to the artefact store
          scripts/package.sh ${BUILD_TAG_NAME}
        '''
        archiveArtifacts artifacts: 'dist/*.tar.gz, dist/*.sha256, dist/build-info.json', fingerprint: true
      }
    }

    // ------------------------------------------------------------------
    stage('Test') {
      environment { JEST_JUNIT_OUTPUT_DIR = 'reports' }
      steps {
        sh '''
          # Unit tests: pure business rules (pricing, validation, migrations)
          JEST_JUNIT_OUTPUT_NAME=junit-unit.xml npx jest tests/unit --ci --reporters=default --reporters=jest-junit
          # Unit + integration (Supertest) with coverage; fails under the thresholds in package.json
          JEST_JUNIT_OUTPUT_NAME=junit-all.xml npx jest --ci --coverage --reporters=default --reporters=jest-junit
        '''
      }
      post {
        always {
          junit testResults: "${REPORTS}/junit-*.xml", allowEmptyResults: false
          script {
            optionalPlugin('Coverage trend') {
              recordCoverage(tools: [[parser: 'COBERTURA', pattern: 'coverage/cobertura-coverage.xml']],
                             qualityGates: [[threshold: 80.0, metric: 'LINE', baseline: 'PROJECT', criticality: 'FAILURE']])
            }
            optionalPlugin('Coverage HTML report') {
              publishHTML(target: [reportDir: 'coverage/lcov-report', reportFiles: 'index.html',
                                   reportName: 'Coverage Report', keepAll: true, alwaysLinkToLastBuild: true, allowMissing: true])
            }
          }
        }
      }
    }

    // ------------------------------------------------------------------
    stage('Code Quality') {
      steps {
        sh '''
          # ESLint: bug patterns, complexity <= 10, nesting <= 3, function length <= 60
          npx eslint . -f json -o ${REPORTS}/eslint.json || true
          npx eslint . --max-warnings 10
          # jscpd: copy-paste detection, gate = max 3% duplicated lines (.jscpd.json)
          npx jscpd src public
        '''
        script {
          if (params.USE_SONARQUBE) {
            withSonarQubeEnv('sonarqube') {
              sh 'npx --yes sonarqube-scanner -Dsonar.projectVersion=${BUILD_TAG_NAME}'
            }
            timeout(time: 5, unit: 'MINUTES') { waitForQualityGate abortPipeline: true }
          }
        }
      }
      post {
        always {
          script {
            optionalPlugin('ESLint issue trend') {
              recordIssues(enabledForFailure: true, tools: [esLint(pattern: "${REPORTS}/eslint.json")])
            }
            optionalPlugin('Duplication HTML report') {
              publishHTML(target: [reportDir: "${REPORTS}/jscpd", reportFiles: 'jscpd-report.html',
                                   reportName: 'Duplication Report', keepAll: true, allowMissing: true])
            }
          }
        }
      }
    }

    // ------------------------------------------------------------------
    stage('Security') {
      parallel {
        stage('SAST') {
          steps {
            sh '''
              # eslint-plugin-security (Node risks) + no-unsanitized (DOM XSS sinks)
              npx eslint -c eslint.security.config.js . -f json -o ${REPORTS}/eslint-security.json || true
              npx eslint -c eslint.security.config.js .
            '''
          }
        }
        stage('Dependencies (SCA)') {
          steps {
            sh '''
              npm audit --json > ${REPORTS}/npm-audit.json || true
              # Gate: moderate+ vulnerability in a production dependency
              npm audit --omit=dev --audit-level=moderate
            '''
          }
        }
        stage('Secrets') {
          steps {
            sh '''
              # Gate: no API keys / tokens / private keys committed
              npx secretlint "**/*" --format json --output ${REPORTS}/secretlint.json || true
              npx secretlint "**/*"
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
          // pm2 + health check + automatic rollback to the previous release
          sh 'scripts/deploy-local.sh staging ${ARTEFACT} ${BUILD_TAG_NAME}'
        }
        sh '''
          # End-to-end smoke tests against the REAL staging instance
          BASE_URL=http://localhost:8001 EXPECTED_VERSION=${BUILD_TAG_NAME} \
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
      when { expression { !env.BRANCH_NAME || env.BRANCH_NAME ==~ /main|master/ } }
      steps {
        script {
          if (params.REQUIRE_APPROVAL) {
            timeout(time: 15, unit: 'MINUTES') {
              input message: "Promote ${env.BUILD_TAG_NAME} to PRODUCTION?", ok: 'Release'
            }
          }
          env.RELEASE_TAG = "v${env.VERSION}-b${env.BUILD_NUMBER}"
        }
        sh '''
          # Promote the SAME tested artefact (checksum verified - no rebuild)
          ( cd dist && shasum -a 256 -c ${APP_NAME}-${BUILD_TAG_NAME}.tar.gz.sha256 )
          cp ${ARTEFACT} ${ARTIFACT_STORE}/${APP_NAME}-${RELEASE_TAG}.tar.gz
        '''
        withCredentials([string(credentialsId: 'prod-session-secret', variable: 'SESSION_SECRET')]) {
          sh 'scripts/deploy-local.sh production ${ARTEFACT} ${RELEASE_TAG}'
        }
        sh '''
          # Production smoke test: read-only (no fake customers/orders in prod)
          BASE_URL=http://localhost:8002 EXPECTED_VERSION=${RELEASE_TAG} SMOKE_READ_ONLY=true \
          JEST_JUNIT_OUTPUT_DIR=${REPORTS} JEST_JUNIT_OUTPUT_NAME=junit-smoke-prod.xml \
            npx jest tests/smoke --ci --reporters=default --reporters=jest-junit

          # Tag + release notes (commits since the previous release)
          PREV=$(git describe --tags --abbrev=0 HEAD 2>/dev/null || git rev-list --max-parents=0 HEAD | tail -1)
          git -c user.name=jenkins -c user.email=jenkins@localhost tag -a ${RELEASE_TAG} -m "Release ${RELEASE_TAG}"
          {
            echo "# Release ${RELEASE_TAG}"
            echo "Artefact: ${APP_NAME}-${RELEASE_TAG}.tar.gz ($(cut -d' ' -f1 dist/*.sha256))"
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
        // Start Prometheus + Alertmanager (+ Grafana) if they are not running yet
        sh 'curl -fsS http://localhost:9090/-/ready >/dev/null 2>&1 || scripts/monitoring-local.sh up'
        script {
          def flag = params.SIMULATE_INCIDENT ? '--simulate-incident' : ''
          def rc = sh(returnStatus: true, script: """
            python3 scripts/monitor_check.py --prom http://localhost:9090 \
              --alertmanager http://localhost:9093 --app http://localhost:8002 ${flag}
          """)
          if (rc == 2) {
            unstable('Critical production alert is firing - check Prometheus / Alertmanager')
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
      echo "SUCCESS: ${env.RELEASE_TAG ?: env.BUILD_TAG_NAME} is live -> http://localhost:8002  (staging http://localhost:8001)"
    }
    unstable { echo 'UNSTABLE: released, but monitoring reports a problem.' }
    failure  { echo 'FAILED - see the red stage. A failed deploy is rolled back automatically.' }
  }
}
