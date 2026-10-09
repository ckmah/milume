#!/usr/bin/env bash
# Run volume-perf-bench.mjs at three commits (pre-#83, #83, PR HEAD). Restarts Vite each time.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
FRONTEND="$ROOT/frontend"
PRE83="90d8fd8"
POST83="a1e0080"
PORT=5173
SESSION="volume-vite-bench"

restart_vite() {
  tmux -f /exec-daemon/tmux.portal.conf kill-session -t "$SESSION" 2>/dev/null || true
  tmux -f /exec-daemon/tmux.portal.conf new-session -d -s "$SESSION" -c "$FRONTEND" -- "${SHELL:-bash}" -lc \
    "npx cross-env DEV_WIDGET=landmarks-volume npx vite --host 127.0.0.1 --port $PORT"
  for _ in $(seq 1 30); do
    curl -sf "http://127.0.0.1:$PORT/" >/dev/null && return 0
    sleep 1
  done
  echo "vite failed to start" >&2
  exit 1
}

run_at_rev() {
  local label="$1" rev="$2"
  echo "=== $label ($rev) ==="
  git -C "$ROOT" checkout --quiet "$rev"
  (cd "$FRONTEND" && npm install --silent 2>/dev/null || true)
  restart_vite
  sleep 2
  (cd "$FRONTEND" && node scripts/volume-perf-bench.mjs) | tee "/opt/cursor/artifacts/bench-${label}.json"
}

BRANCH="$(git -C "$ROOT" rev-parse --abbrev-ref HEAD)"
run_at_rev "pre-83" "$PRE83"
run_at_rev "post-83" "$POST83"
git -C "$ROOT" checkout --quiet "$BRANCH"
run_at_rev "pr" "HEAD"

echo "Done. Restored branch $BRANCH"
