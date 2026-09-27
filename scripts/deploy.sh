#!/usr/bin/env bash
# Deploy an image to an environment with health-gated automatic ROLLBACK.
#
#   scripts/deploy.sh <staging|production> <image>
#
# Requires SESSION_SECRET in the environment (Jenkins injects it from credentials).
set -euo pipefail

ENV_NAME="${1:?usage: deploy.sh <staging|production> <image>}"
NEW_IMAGE="${2:?usage: deploy.sh <staging|production> <image>}"
: "${SESSION_SECRET:?SESSION_SECRET must be set}"

case "$ENV_NAME" in
  staging)    HOST_PORT=8001 ;;
  production) HOST_PORT=8002 ;;
  *) echo "Unknown environment: $ENV_NAME" >&2; exit 2 ;;
esac

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
COMPOSE_FILE="$ROOT_DIR/deploy/docker-compose.app.yml"
STATE_DIR="${DEPLOY_STATE_DIR:-${JENKINS_HOME:-$ROOT_DIR}/deploy-state}"
CONTAINER="bookstore-${ENV_NAME}"
HEALTH_TIMEOUT="${HEALTH_TIMEOUT:-90}"
mkdir -p "$STATE_DIR"

CURRENT_FILE="$STATE_DIR/${ENV_NAME}.current"
PREVIOUS_FILE="$STATE_DIR/${ENV_NAME}.previous"
PREVIOUS_IMAGE="$(cat "$CURRENT_FILE" 2>/dev/null || true)"

compose_up() {
  local image="$1"
  DEPLOY_ENV="$ENV_NAME" IMAGE="$image" HOST_PORT="$HOST_PORT" \
  APP_VERSION="$(echo "$image" | sed 's/.*://')" SESSION_SECRET="$SESSION_SECRET" \
    docker compose -f "$COMPOSE_FILE" up -d --pull missing --remove-orphans
}

wait_healthy() {
  local waited=0 status
  while (( waited < HEALTH_TIMEOUT )); do
    status="$(docker inspect --format '{{.State.Health.Status}}' "$CONTAINER" 2>/dev/null || echo missing)"
    echo "  [$waited s] $CONTAINER health = $status"
    [[ "$status" == "healthy" ]] && return 0
    [[ "$status" == "unhealthy" ]] && return 1
    sleep 5; waited=$((waited + 5))
  done
  return 1
}

echo "==> Deploying $NEW_IMAGE to $ENV_NAME (port $HOST_PORT)"
echo "    previous image: ${PREVIOUS_IMAGE:-<none>}"
compose_up "$NEW_IMAGE"

if wait_healthy; then
  [[ -n "$PREVIOUS_IMAGE" && "$PREVIOUS_IMAGE" != "$NEW_IMAGE" ]] && echo "$PREVIOUS_IMAGE" > "$PREVIOUS_FILE"
  echo "$NEW_IMAGE" > "$CURRENT_FILE"
  echo "==> $ENV_NAME is healthy on $NEW_IMAGE"
  exit 0
fi

echo "!!! $ENV_NAME failed health checks - last container logs:" >&2
docker logs --tail 50 "$CONTAINER" >&2 || true

if [[ -n "$PREVIOUS_IMAGE" && "$PREVIOUS_IMAGE" != "$NEW_IMAGE" ]]; then
  echo "<== ROLLING BACK $ENV_NAME to $PREVIOUS_IMAGE" >&2
  compose_up "$PREVIOUS_IMAGE"
  if wait_healthy; then
    echo "<== Rollback succeeded, $ENV_NAME is back on $PREVIOUS_IMAGE" >&2
  else
    echo "!!! Rollback ALSO failed - manual intervention required" >&2
  fi
else
  echo "!!! No previous image recorded - cannot roll back" >&2
fi
exit 1
