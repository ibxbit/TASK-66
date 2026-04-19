#!/usr/bin/env bash
set -u

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT_DIR"

UNIT_STATUS=0
API_STATUS=0
BACKEND_STATUS=0
BACKEND_REUSE=0
API_PORT="${TEST_API_PORT:-28080}"
API_BASE_URL="http://localhost:${API_PORT}/api/v1"
# TEST_MONGO_URI can be overridden by the environment; inside the Docker
# backend container the mongo host is the `mongo` compose service DNS name.
TEST_MONGO_URI="${TEST_MONGO_URI:-${MONGO_URI:-mongodb://museum_user:museum_pass@localhost:27017/museum_ops?authSource=admin}}"
BACKEND_LOG=".test-backend.log"
MONGO_CONTAINER_NAME="museum_mongo_test_$$"
MONGO_STARTED_BY_SCRIPT=0

cleanup() {
  if [ -n "${BACKEND_PID:-}" ] && kill -0 "$BACKEND_PID" >/dev/null 2>&1; then
    kill "$BACKEND_PID" >/dev/null 2>&1 || true
    wait "$BACKEND_PID" >/dev/null 2>&1 || true
  fi
  if [ "$MONGO_STARTED_BY_SCRIPT" = "1" ]; then
    echo "==> Tearing down ephemeral MongoDB ($MONGO_CONTAINER_NAME)"
    docker rm -f "$MONGO_CONTAINER_NAME" >/dev/null 2>&1 || true
  fi
}

trap cleanup EXIT

# If a backend is already serving on API_PORT (e.g. the container's own server),
# reuse it and skip port-cleanup so we don't kill the main process.
if curl -fsS "$API_BASE_URL/health" >/dev/null 2>&1; then
  echo "==> Backend already running at $API_BASE_URL — reusing"
  BACKEND_REUSE=1
  BACKEND_STATUS=0
fi

if [ "$BACKEND_REUSE" = "0" ]; then
  # Cleanup any lingering backend processes on API_PORT
  echo "==> Cleaning up port $API_PORT (if needed)"
  if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "win32" ]]; then
    powershell.exe -Command "Get-NetTCPConnection -LocalPort ${API_PORT} -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess | ForEach-Object { Stop-Process -Id \$_ -Force -ErrorAction SilentlyContinue }"
  else
    fuser -k "${API_PORT}/tcp" > /dev/null 2>&1 || true
  fi
fi

# Install backend dependencies if missing (needed in host/CI environments outside Docker)
if [ ! -d "$ROOT_DIR/backend/node_modules" ]; then
  echo "==> Installing backend dependencies (backend/node_modules not found)"
  npm ci --prefix "$ROOT_DIR/backend" --no-audit --no-fund
fi

echo "==> Running unit tests"
if node --test unit_tests/*.test.js; then
  echo "[PASS] unit_tests"
  UNIT_STATUS=0
else
  echo "[FAIL] unit_tests"
  UNIT_STATUS=1
fi

mongo_reachable() {
  node -e "
const net=require('net');
const url=require('url');
const u=new url.URL(process.argv[1]);
const host=u.hostname||'localhost';
const port=parseInt(u.port||'27017',10);
const s=net.createConnection({host,port,timeout:5000});
s.on('connect',()=>{s.destroy();process.exit(0);});
s.on('error',()=>{process.exit(1);});
s.on('timeout',()=>{s.destroy();process.exit(1);});
" "$1" >/dev/null 2>&1
}

echo "==> Checking MongoDB prerequisite at $TEST_MONGO_URI"
if ! mongo_reachable "$TEST_MONGO_URI"; then
  echo "    MongoDB not reachable; attempting to start ephemeral container via Docker."
  if ! command -v docker >/dev/null 2>&1; then
    echo "[FAIL] docker CLI not available and MongoDB is not reachable."
    API_STATUS=1
    BACKEND_STATUS=1
  else
    # Free port 27017 on host if something old is bound there
    docker rm -f "$MONGO_CONTAINER_NAME" >/dev/null 2>&1 || true
    if docker run -d --rm \
        --name "$MONGO_CONTAINER_NAME" \
        -p 27017:27017 \
        -e MONGO_INITDB_ROOT_USERNAME=museum_user \
        -e MONGO_INITDB_ROOT_PASSWORD=museum_pass \
        -e MONGO_INITDB_DATABASE=museum_ops \
        mongo:7 >/dev/null 2>&1; then
      MONGO_STARTED_BY_SCRIPT=1
      echo "    Ephemeral MongoDB container started: $MONGO_CONTAINER_NAME"
      echo "    Waiting for MongoDB to accept connections..."
      READY=0
      for attempt in $(seq 1 60); do
        if mongo_reachable "$TEST_MONGO_URI"; then
          READY=1
          break
        fi
        sleep 2
      done
      if [ "$READY" -ne 1 ]; then
        echo "[FAIL] Ephemeral MongoDB did not become ready within 120s"
        API_STATUS=1
        BACKEND_STATUS=1
      fi
    else
      echo "[FAIL] Could not start ephemeral MongoDB container"
      API_STATUS=1
      BACKEND_STATUS=1
    fi
  fi
fi

if [ "$BACKEND_REUSE" = "0" ]; then
echo "==> Starting local backend for API tests"

if [ "$BACKEND_STATUS" -ne 0 ] || ! mongo_reachable "$TEST_MONGO_URI"; then
  echo "[FAIL] MongoDB prerequisite is unreachable: $TEST_MONGO_URI"
  echo "       Either start MongoDB yourself or ensure the docker CLI is available,"
  echo "       then re-run: bash ./run_tests.sh"
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
