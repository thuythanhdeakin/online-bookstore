# Custom Jenkins controller with every CLI tool the pipeline needs baked in.
# Tools are pinned (and Trivy is checksum-verified) so the CI toolchain itself
# is reproducible and protected against supply-chain tampering.
FROM jenkins/jenkins:lts-jdk21

USER root

ARG TRIVY_VERSION=0.69.3
ARG SONAR_SCANNER_VERSION=6.2.1.4610

# Base tools: python3 for the monitoring/report scripts, jq/curl for API calls, unzip
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 python3-venv python3-pip jq curl unzip ca-certificates gnupg lsb-release \
    && rm -rf /var/lib/apt/lists/*

# Docker CLI + compose plugin (talks to the HOST daemon via the mounted socket)
RUN install -m 0755 -d /etc/apt/keyrings \
    && curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian $(lsb_release -cs) stable" \
       > /etc/apt/sources.list.d/docker.list \
    && apt-get update && apt-get install -y --no-install-recommends docker-ce-cli docker-compose-plugin \
    && rm -rf /var/lib/apt/lists/*

# Node.js 22 (same major as the app image) copied from the official image
COPY --from=node:22-bookworm-slim /usr/local/bin/node /usr/local/bin/node
COPY --from=node:22-bookworm-slim /usr/local/lib/node_modules /usr/local/lib/node_modules
RUN ln -sf ../lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm \
    && ln -sf ../lib/node_modules/npm/bin/npx-cli.js /usr/local/bin/npx \
    && node --version && npm --version

# Trivy (security scanner). v0.69.4-0.69.6 were COMPROMISED in March 2026
# (GHSA-69fq-xp46-6x23) - we pin a known-good version and verify its SHA256.
RUN set -eux; \
    case "$(dpkg --print-architecture)" in \
      amd64) T_ARCH=Linux-64bit ;; \
      arm64) T_ARCH=Linux-ARM64 ;; \
      *) echo "unsupported arch"; exit 1 ;; \
    esac; \
    BASE=https://github.com/aquasecurity/trivy/releases/download/v${TRIVY_VERSION}; \
    FILE=trivy_${TRIVY_VERSION}_${T_ARCH}.tar.gz; \
    curl -fsSLO ${BASE}/${FILE}; \
    curl -fsSL ${BASE}/trivy_${TRIVY_VERSION}_checksums.txt | grep " ${FILE}$" | sha256sum -c -; \
    tar -xzf ${FILE} -C /usr/local/bin trivy; rm ${FILE}; trivy --version

# SonarScanner CLI (no bundled JRE -> uses the JDK 21 already in this image, works on amd64 + arm64)
RUN curl -fsSL -o /tmp/ss.zip \
      https://binaries.sonarsource.com/Distribution/sonar-scanner-cli/sonar-scanner-cli-${SONAR_SCANNER_VERSION}.zip \
    && unzip -q /tmp/ss.zip -d /opt && rm /tmp/ss.zip \
    && ln -s /opt/sonar-scanner-*/bin/sonar-scanner /usr/local/bin/sonar-scanner \
    && sonar-scanner --version

# Plugins + Configuration-as-Code (Jenkins itself is configured from code)
COPY plugins.txt /usr/share/jenkins/ref/plugins.txt
RUN jenkins-plugin-cli --plugin-file /usr/share/jenkins/ref/plugins.txt
COPY casc.yaml /opt/casc/casc.yaml
ENV CASC_JENKINS_CONFIG=/opt/casc/casc.yaml \
    JAVA_OPTS="-Djenkins.install.runSetupWizard=false"

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s \
  CMD curl -fsS http://localhost:8080/login >/dev/null || exit 1

# NOTE: the container stays root ONLY for this local demo so Jenkins can use the
# host Docker socket without GID juggling. Do not do this on a shared server.
