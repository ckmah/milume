#!/usr/bin/env bash
# Git bisect helper: fresh issue395-3d Vite + Oblique DAPI-only GL oracle (tissue >= 4000).
set -euo pipefail
ROOT="/workspace"
FRONTEND="$ROOT/frontend"
SHA=$(git -C "$ROOT" rev-parse HEAD)
SHORT=${SHA:0:7}
PORT="${BISECT_VITE_PORT:-5181}"
LOG="/opt/cursor/artifacts/issue395/bisect-vite-${SHORT}.log"
PNG="/opt/cursor/artifacts/issue395/bisect-${SHORT}-oblique-inset.png"
mkdir -p /opt/cursor/artifacts/issue395

# Stop anything bound to the bisect port.
if command -v fuser >/dev/null 2>&1; then
  fuser -k "${PORT}/tcp" 2>/dev/null || true
else
  pid=$(ss -ltnp "sport = :${PORT}" 2>/dev/null | grep -oP 'pid=\K[0-9]+' | head -1 || true)
  if [[ -n "${pid:-}" ]]; then kill "$pid" 2>/dev/null || true; fi
fi
sleep 1

rm -rf "$FRONTEND/node_modules/.vite/landmarks-volume-issue395-3d"

cd "$FRONTEND"
DEV_WIDGET=landmarks-volume MILUME_VOLUME_PROFILE=issue395-3d npx vite --host 127.0.0.1 --port "$PORT" --strictPort >"$LOG" 2>&1 &
VITE_PID=$!
cleanup() { kill "$VITE_PID" 2>/dev/null || true; wait "$VITE_PID" 2>/dev/null || true; }
trap cleanup EXIT

for i in $(seq 1 40); do
  code=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:${PORT}/" || echo 0)
  if [[ "$code" == "200" ]]; then break; fi
  sleep 2
done
code=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:${PORT}/" || echo 0)
if [[ "$code" != "200" ]]; then
  echo "vite failed on :${PORT} for ${SHORT}; log tail:"
  tail -30 "$LOG"
  exit 125
fi

cd "$FRONTEND"
set +e
ISSUE395_BASE_URL="http://127.0.0.1:${PORT}" npx tsx bisect-oracle.mts "$PNG"
rc=$?
set -e
exit $rc
