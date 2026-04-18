#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

violations=()

check_path() {
  local path="$1"
  if [ -e "$ROOT_DIR/$path" ]; then
    violations+=("$path")
  fi
}

check_path "backend/node_modules"
check_path "frontend/node_modules"
check_path "frontend/dist"

if [ "${#violations[@]}" -gt 0 ]; then
  echo "[clean-delivery] FAIL: generated/vendor artifacts detected:"
  for item in "${violations[@]}"; do
    echo "- $item"
  done
  echo "[clean-delivery] Remove these before packaging source snapshot."
  exit 1
fi

echo "[clean-delivery] PASS: delivery snapshot is clean."
