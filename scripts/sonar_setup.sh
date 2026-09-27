#!/usr/bin/env bash
# One-time (idempotent) SonarQube setup: project, custom Quality Gate, Jenkins webhook.
#   SONAR_ADMIN_PASSWORD=yourpass scripts/sonar_setup.sh
set -euo pipefail
SONAR_URL="${SONAR_URL:-http://localhost:9000}"
AUTH="admin:${SONAR_ADMIN_PASSWORD:?set SONAR_ADMIN_PASSWORD}"
PROJECT=online-bookstore
GATE="Bookstore Gate"
JENKINS_WEBHOOK="${JENKINS_WEBHOOK:-http://jenkins:8080/sonarqube-webhook/}"

api() { curl -sS -u "$AUTH" -X POST "$SONAR_URL/api/$1" "${@:2}"; echo; }

echo "--> project"
api projects/create --data-urlencode "project=$PROJECT" --data-urlencode "name=Online Bookstore" || true

echo "--> quality gate"
api qualitygates/create --data-urlencode "name=$GATE" || true
cond() { api qualitygates/create_condition --data-urlencode "gateName=$GATE" \
           --data-urlencode "metric=$1" --data-urlencode "op=$2" --data-urlencode "error=$3" || true; }
# --- overall code ---
cond coverage                         LT 80   # line+branch coverage >= 80%
cond duplicated_lines_density         GT 3    # <= 3% duplicated lines
cond sqale_rating                     GT 1    # maintainability rating must be A
cond reliability_rating               GT 1    # no bugs above A
cond code_smells                      GT 15   # hard ceiling on smells
# --- new code (what this change introduces) ---
cond new_coverage                     LT 85
cond new_duplicated_lines_density     GT 3
cond new_maintainability_rating       GT 1
cond new_security_hotspots_reviewed   LT 100
api qualitygates/select --data-urlencode "gateName=$GATE" --data-urlencode "projectKey=$PROJECT"

echo "--> webhook to Jenkins (needed by waitForQualityGate)"
api webhooks/create --data-urlencode "name=jenkins" --data-urlencode "url=$JENKINS_WEBHOOK" || true

echo "Done. Gate '$GATE' attached to $PROJECT."
