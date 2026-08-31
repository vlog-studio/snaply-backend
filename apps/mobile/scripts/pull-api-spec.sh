#!/usr/bin/env bash
# Refresh the committed OpenAPI spec (docs/api/openapi.json) from the backend's
# live Swagger JSON endpoint. The backend origin comes from
# EXPO_PUBLIC_API_BASE_URL in .env — the same variable the app uses at runtime.
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

: "${EXPO_PUBLIC_API_BASE_URL:?EXPO_PUBLIC_API_BASE_URL is not set (fill it in .env)}"

curl -fsS "${EXPO_PUBLIC_API_BASE_URL}/docs/json" -o docs/api/openapi.json
echo "Saved docs/api/openapi.json from ${EXPO_PUBLIC_API_BASE_URL}/docs/json"
echo "Next: npm run api:gen, then commit the spec and schema.d.ts together."
