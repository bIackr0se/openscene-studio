#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
production_port="${OPENSCENE_PRODUCTION_TEST_PORT:-4174}"
production_log="$(mktemp /tmp/openscene-production-e2e.XXXXXX)"
production_pid=""

cleanup() {
  if [[ -n "${production_pid}" ]] && kill -0 "${production_pid}" 2>/dev/null; then
    kill "${production_pid}" 2>/dev/null || true
    wait "${production_pid}" 2>/dev/null || true
  fi
  find "${production_log}" -depth -delete 2>/dev/null || true
}
trap cleanup EXIT

cd "${project_root}"

if lsof -nP -iTCP:"${production_port}" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Production verification port ${production_port} is already in use" >&2
  exit 1
fi

npm test
npm run test:media-verifier
npm run verify:rehearsal-media
npm run verify:release-manifest
npx tsc --noEmit
npm run lint:check
npm run format:check
npm run build
npm run test:e2e

npm run start -- --port "${production_port}" >"${production_log}" 2>&1 &
production_pid=$!

for _ in {1..120}; do
  if curl -fsS "http://localhost:${production_port}/" >/dev/null 2>&1; then
    break
  fi
  if ! kill -0 "${production_pid}" 2>/dev/null; then
    cat "${production_log}" >&2
    echo "Production server exited before becoming ready" >&2
    exit 1
  fi
  sleep 0.25
done

if ! curl -fsS "http://localhost:${production_port}/" >/dev/null 2>&1; then
  cat "${production_log}" >&2
  echo "Production server did not become ready on port ${production_port}" >&2
  exit 1
fi

PLAYWRIGHT_BASE_URL="http://localhost:${production_port}" npm run test:e2e

echo "Private Studio verification passed: deterministic, media, development E2E, and production E2E gates"
