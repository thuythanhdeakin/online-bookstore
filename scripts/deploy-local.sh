#!/usr/bin/env bash
# DEPLOY without Docker: install a release tarball into an environment folder,
# run it with pm2, health-check it and ROLL BACK automatically if unhealthy.
#
#   SESSION_SECRET=... scripts/deploy-local.sh <staging|production> <artefact.tar.gz> <version>
#   SESSION_SECRET=... scripts/deploy-local.sh <staging|production> --rollback      (manual rollback)
#
# Layout (per environment):
#   $DEPLOY_ROOT/<env>/releases/<version>/   extracted + npm ci --omit=dev
#   $DEPLOY_ROOT/<env>/current -> releases/<version>   (symlink = what is live)
#   $DEPLOY_ROOT/<env>/data/bookstore.db     (survives releases)
set -euo pipefail

ENV_NAME="${1:?usage: deploy-local.sh <staging|production> <artefact> <version>}"
ARTEFACT="${2:?artefact path or --rollback required}"
VERSION="${3:-}"
: "${SESSION_SECRET:?SESSION_SECRET must be set (Jenkins credential)}"

case "$ENV_NAME" in
  staging)    PORT=8001 ;;
  production) PORT=8002 ;;
  *) echo "Unknown environment $ENV_NAME" >&2; exit 2 ;;
esac

command -v pm2 >/dev/null || { echo "pm2 not found - run: npm install -g pm2" >&2; exit 2; }

DEPLOY_ROOT="${DEPLOY_ROOT:-$HOME/bookstore-deploy}"
ENV_DIR="$DEPLOY_ROOT/$ENV_NAME"
APP="bookstore-$ENV_NAME"
HEALTH_URL="http://127.0.0.1:$PORT/health"
mkdir -p "$ENV_DIR/releases" "$ENV_DIR/data" "$ENV_DIR/logs"

PREVIOUS="$(readlink "$ENV_DIR/current" 2>/dev/null || true)"

if [[ "$ARTEFACT" == "--rollback" ]]; then
  VERSION="$(cat "$ENV_DIR/PREVIOUS_VERSION" 2>/dev/null || true)"
  [[ -z "$VERSION" || ! -d "$ENV_DIR/releases/$VERSION" ]] && { echo "No previous release to roll back to" >&2; exit 1; }
  RELEASE_DIR="$ENV_DIR/releases/$VERSION"
  echo "==> Manual rollback of $ENV_NAME to $VERSION"
else
  : "${VERSION:?version required}"
  RELEASE_DIR="$ENV_DIR/releases/$VERSION"
  echo "==> Deploying $VERSION to $ENV_NAME (port $PORT); previous: ${PREVIOUS:-<none>}"
  # 1. Unpack + install production dependencies exactly from the lockfile
  rm -rf "$RELEASE_DIR" && mkdir -p "$RELEASE_DIR"
  tar -xzf "$ARTEFACT" -C "$RELEASE_DIR" --strip-components=1
  ( cd "$RELEASE_DIR" && npm ci --omit=dev --no-audit --no-fund --loglevel=error )
fi

start_release() {
  local dir="$1" version="$2"
  ln -sfn "$dir" "$ENV_DIR/current"
  pm2 delete "$APP" >/dev/null 2>&1 || true
  # Environment = non-secret config file + per-env overrides + secret from Jenkins
  (
    set -a
    # shellcheck disable=SC1090
    . "$dir/deploy/env/$ENV_NAME.env"
    set +a
    export PORT="$PORT" APP_VERSION="$version" SESSION_SECRET="$SESSION_SECRET" \
           DB_PATH="$ENV_DIR/data/bookstore.db" NODE_ENV=production
    pm2 start "$ENV_DIR/current/src/server.js" --name "$APP" --cwd "$ENV_DIR/current" \
      --output "$ENV_DIR/logs/out.log" --error "$ENV_DIR/logs/error.log" --time \
      --max-memory-restart 256M --update-env >/dev/null
  )
  pm2 save >/dev/null 2>&1 || true
}

wait_healthy() {
  local expected="$1"
  for i in $(seq 1 20); do
    body="$(curl -fsS --max-time 2 "$HEALTH_URL" 2>/dev/null || true)"
    if [[ "$body" == *"\"version\":\"$expected\""* ]]; then
      echo "  [$i] healthy: $body"; return 0
    fi
    echo "  [$i] waiting for $HEALTH_URL ..."; sleep 2
  done
  return 1
}

start_release "$RELEASE_DIR" "$VERSION"
if wait_healthy "$VERSION"; then
  echo "$VERSION" > "$ENV_DIR/CURRENT_VERSION"
  [[ -n "$PREVIOUS" && "$PREVIOUS" != "$RELEASE_DIR" ]] && basename "$PREVIOUS" > "$ENV_DIR/PREVIOUS_VERSION"
  # keep the 5 newest releases
  ls -1dt "$ENV_DIR"/releases/* | tail -n +6 | xargs rm -rf 2>/dev/null || true
  echo "==> $ENV_NAME is live on $VERSION  ->  http://localhost:$PORT"
  exit 0
fi

echo "!!! $ENV_NAME failed health check - last log lines:" >&2
tail -n 30 "$ENV_DIR/logs/error.log" >&2 || true
if [[ -n "$PREVIOUS" && -d "$PREVIOUS" && "$PREVIOUS" != "$RELEASE_DIR" ]]; then
  PREV_VERSION="$(basename "$PREVIOUS")"
  echo "<== ROLLING BACK $ENV_NAME to $PREV_VERSION" >&2
  start_release "$PREVIOUS" "$PREV_VERSION"
  wait_healthy "$PREV_VERSION" && echo "<== rollback OK" >&2 || echo "!!! rollback failed" >&2
else
  echo "!!! no previous release to roll back to" >&2
fi
exit 1
