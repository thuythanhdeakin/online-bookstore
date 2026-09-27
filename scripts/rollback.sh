#!/usr/bin/env bash
# Manual rollback: redeploy the previously released image of an environment.
#   SESSION_SECRET=... scripts/rollback.sh production
set -euo pipefail
ENV_NAME="${1:?usage: rollback.sh <staging|production>}"
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
STATE_DIR="${DEPLOY_STATE_DIR:-${JENKINS_HOME:-$ROOT_DIR}/deploy-state}"
PREVIOUS_IMAGE="$(cat "$STATE_DIR/${ENV_NAME}.previous" 2>/dev/null || true)"
[[ -z "$PREVIOUS_IMAGE" ]] && { echo "No previous image for $ENV_NAME" >&2; exit 1; }
echo "Rolling $ENV_NAME back to $PREVIOUS_IMAGE"
exec "$ROOT_DIR/scripts/deploy.sh" "$ENV_NAME" "$PREVIOUS_IMAGE"
