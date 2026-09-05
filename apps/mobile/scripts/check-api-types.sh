#!/usr/bin/env bash
# Fails when src/shared/api/schema.d.ts is out of sync with the backend's committed
# OpenAPI snapshot (apps/api/openapi.json — regenerated there by `npm run openapi:write`).
#
# Regenerates the schema from the snapshot into a scratch file and compares it
# against the committed artifact, so the check never touches the working tree and
# is not confused by unrelated uncommitted changes.
set -euo pipefail
cd "$(dirname "$0")/.."

spec="../api/openapi.json"
out="node_modules/.cache/api-check/schema.d.ts"
mkdir -p "$(dirname "$out")"
npx openapi-typescript "$spec" -o "$out" >/dev/null

if ! diff -q "$out" src/shared/api/schema.d.ts >/dev/null; then
  echo "api:check failed: src/shared/api/schema.d.ts is out of sync with apps/api/openapi.json." >&2
  echo "Run 'npm run api:gen' and commit the regenerated file together with the spec." >&2
  exit 1
fi
