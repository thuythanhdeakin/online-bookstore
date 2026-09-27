#!/usr/bin/env bash
# BUILD artefact (no Docker): a versioned, checksummed release tarball.
#   scripts/package.sh <tag>
# Output: dist/online-bookstore-<tag>.tar.gz (+ .sha256), also copied to the
# artefact store ($ARTIFACT_STORE, default ~/bookstore-artifacts).
set -euo pipefail
TAG="${1:?usage: package.sh <tag>}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STORE="${ARTIFACT_STORE:-$HOME/bookstore-artifacts}"
NAME="online-bookstore-${TAG}"
cd "$ROOT"
mkdir -p dist "$STORE"

# Build metadata baked into the artefact (read by /health via APP_VERSION at deploy time)
cat > dist/build-info.json <<JSON
{"name":"online-bookstore","tag":"${TAG}","commit":"$(git rev-parse --short HEAD 2>/dev/null || echo unknown)","built":"$(date -u +%Y-%m-%dT%H:%M:%SZ)"}
JSON

# Only what production needs: code, static site, lockfile (deps installed with npm ci at deploy)
tar -czf "dist/${NAME}.tar.gz" \
  --transform "s,^,${NAME}/," \
  package.json package-lock.json VERSION src public deploy/env -C dist build-info.json 2>/dev/null \
  || tar -czf "dist/${NAME}.tar.gz" -s ",^,${NAME}/," \
       package.json package-lock.json VERSION src public deploy/env -C dist build-info.json   # macOS bsdtar

( cd dist && shasum -a 256 "${NAME}.tar.gz" > "${NAME}.tar.gz.sha256" )
cp "dist/${NAME}.tar.gz" "dist/${NAME}.tar.gz.sha256" "$STORE/"
echo "Built artefact dist/${NAME}.tar.gz ($(du -h "dist/${NAME}.tar.gz" | cut -f1))"
echo "Stored in $STORE"
cat "dist/${NAME}.tar.gz.sha256"
