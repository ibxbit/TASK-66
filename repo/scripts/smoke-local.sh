#!/usr/bin/env bash
set -euo pipefail

API_BASE_URL="${API_BASE_URL:-http://localhost:8080/api/v1}"
LOGIN_USER="${SMOKE_USER:-admin.dev}"
LOGIN_PASS="${SMOKE_PASS:?Set SMOKE_PASS env var with the seeded admin password}"

echo "[smoke] API base: ${API_BASE_URL}"

health_json="$(curl -fsS --max-time 5 "${API_BASE_URL}/health")" || {
  echo "[smoke] FAIL: health endpoint not reachable at ${API_BASE_URL}/health"
  echo "[smoke] Hint: start backend and ensure PORT/API_BASE_URL are correct"
  exit 1
}

db_ready="$(printf '%s' "$health_json" | node -e "let raw='';process.stdin.on('data',d=>raw+=d);process.stdin.on('end',()=>{const parsed=JSON.parse(raw);process.stdout.write(String(Boolean(parsed?.data?.db?.ready)));});")"

if [ "$db_ready" != "true" ]; then
  echo "[smoke] FAIL: backend health is reachable but database is not ready"
  echo "[smoke] Hint: verify MongoDB is running and MONGO_URI points to it"
  exit 1
fi

login_json="$(curl -fsS --max-time 8 -H "Content-Type: application/json" -d "{\"username\":\"${LOGIN_USER}\",\"password\":\"${LOGIN_PASS}\"}" "${API_BASE_URL}/auth/login")" || {
  echo "[smoke] FAIL: login request failed"
  echo "[smoke] Hint: run backend/src/scripts/seed-dev-users.js with ENABLE_DEV_SEED=true"
  exit 1
}

csrf_token="$(printf '%s' "$login_json" | node -e "let raw='';process.stdin.on('data',d=>raw+=d);process.stdin.on('end',()=>{const parsed=JSON.parse(raw);const token=parsed?.data?.csrfToken||'';process.stdout.write(token);});")"

if [ -z "$csrf_token" ]; then
  echo "[smoke] FAIL: login succeeded but csrfToken was missing"
  exit 1
fi

curl -fsS --max-time 8 "${API_BASE_URL}/catalog/search?q=air&page=1&pageSize=5" >/dev/null || {
  echo "[smoke] FAIL: catalog search endpoint not responding"
  exit 1
}

echo "[smoke] PASS: health ok, db ready, auth login ok, catalog search ok"
