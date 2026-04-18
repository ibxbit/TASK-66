#!/usr/bin/env bash
set -u

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT_DIR"

UNIT_STATUS=0
API_STATUS=0
BACKEND_STATUS=0
API_PORT="${TEST_API_PORT:-28080}"
API_BASE_URL="http://localhost:${API_PORT}/api/v1"
# TEST_MONGO_URI can be overridden by the environment; inside the Docker
# backend container the mongo host is the `mongo` compose service DNS name.
TEST_MONGO_URI="${TEST_MONGO_URI:-mongodb://museum_user:museum_pass@localhost:27017/museum_ops?authSource=admin}"
BACKEND_LOG=".test-backend.log"

cleanup() {
  if [ -n "${BACKEND_PID:-}" ] && kill -0 "$BACKEND_PID" >/dev/null 2>&1; then
    kill "$BACKEND_PID" >/dev/null 2>&1 || true
    wait "$BACKEND_PID" >/dev/null 2>&1 || true
  fi
}

trap cleanup EXIT

# Cleanup any lingering backend processes
echo "==> Cleaning up port 28080 (if needed)"
if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "win32" ]]; then
  powershell.exe -Command "Get-NetTCPConnection -LocalPort 28080 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess | ForEach-Object { Stop-Process -Id \$_ -Force -ErrorAction SilentlyContinue }"
else
  fuser -k 28080/tcp > /dev/null 2>&1 || true
fi

echo "==> Installing backend test dependencies (if needed)"
cd backend && npm install --no-audit --no-fund >/dev/null 2>&1 && cd .. || {
  echo "[FAIL] Could not install backend dependencies"
  exit 1
}

echo "==> Running unit tests"
if node --test unit_tests/*.test.js; then
  echo "[PASS] unit_tests"
  UNIT_STATUS=0
else
  echo "[FAIL] unit_tests"
  UNIT_STATUS=1
fi

echo "==> Starting local backend for API tests"

if ! node -e "const mongoose=require('./backend/node_modules/mongoose');mongoose.connect(process.argv[1],{serverSelectionTimeoutMS:5000}).then(()=>{process.exit(0)}).catch(()=>{process.exit(1)})" "$TEST_MONGO_URI"; then
  echo "[FAIL] MongoDB prerequisite is unreachable: $TEST_MONGO_URI"
  echo "       Start MongoDB, then re-run: bash ./run_tests.sh"
  echo "       Quick check command:"
  echo "       node -e \"const mongoose=require('./backend/node_modules/mongoose');mongoose.connect('$TEST_MONGO_URI',{serverSelectionTimeoutMS:5000}).then(()=>{console.log('mongo-ok');process.exit(0)}).catch(e=>{console.error('mongo-fail',e.message);process.exit(1)})\""
  API_STATUS=1
  BACKEND_STATUS=1
else
NODE_ENV=development PORT="$API_PORT" SESSION_COOKIE_SECURE=false FRONTEND_ORIGIN="http://localhost:5173" MONGO_URI="$TEST_MONGO_URI" node backend/src/server.js >"$BACKEND_LOG" 2>&1 &
BACKEND_PID=$!

for attempt in $(seq 1 40); do
  if curl -fsS "$API_BASE_URL/health" >/dev/null 2>&1; then
    BACKEND_STATUS=0
    break
  fi
  sleep 1
  BACKEND_STATUS=1
done

fi

if [ "$BACKEND_STATUS" -ne 0 ]; then
  echo "[FAIL] Local backend failed to start"
  echo "       Last backend logs:"
  tail -n 40 "$BACKEND_LOG" || true
  API_STATUS=1
else
  echo "==> Seeding test users"
  if ! NODE_ENV=development ENABLE_DEV_SEED=true MONGO_URI="$TEST_MONGO_URI" node backend/src/scripts/seed-dev-users.js >/dev/null 2>&1; then
    echo "[FAIL] Could not seed dev users for API tests"
    API_STATUS=1
  else
    echo "==> Running API tests"
    if API_BASE_URL="$API_BASE_URL" TEST_MONGO_URI="$TEST_MONGO_URI" node --test API_tests/*.test.js; then
      echo "[PASS] API_tests"
      API_STATUS=0
    else
      echo "[FAIL] API_tests"
      API_STATUS=1
      echo "       Last backend logs:"
      tail -n 40 "$BACKEND_LOG" || true
    fi
  fi
fi

echo ""
echo "========== Test Summary =========="
if [ "$UNIT_STATUS" -eq 0 ]; then
  echo "unit_tests : PASS"
else
  echo "unit_tests : FAIL"
fi

if [ "$API_STATUS" -eq 0 ]; then
  echo "API_tests  : PASS"
else
  echo "API_tests  : FAIL"
fi

if [ "$UNIT_STATUS" -eq 0 ] && [ "$API_STATUS" -eq 0 ]; then
  echo "Overall    : PASS"
  exit 0
fi

echo "Overall    : FAIL"
exit 1
