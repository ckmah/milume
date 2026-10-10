#!/usr/bin/env bash
# Compare first-cube-render + inspect pan on colon A2: main (HTTP loopback) vs branch (comm).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
STORE="${COLON_A2_STORE:-$ROOT/frontend/dev/data/colon_a2.sdata.zarr}"
RUNS="${RUNS:-5}"
PORT_MAIN="${PORT_MAIN:-8891}"
PORT_COMM="${PORT_COMM:-8890}"

if [[ ! -d "$STORE" ]]; then
  echo "Missing $STORE — run: uv run --extra demo python frontend/dev/build_colon_a2_store.py --download --overwrite" >&2
  exit 1
fi

export COLON_A2_STORE="$STORE"

bench_one() {
  local label="$1" port="$2" milume_dir="$3"
  echo "=== $label (port $port, milume=$milume_dir) ==="
  tmux -f /exec-daemon/tmux.portal.conf kill-session -t "marimo-bench-$port" 2>/dev/null || true
  tmux -f /exec-daemon/tmux.portal.conf new-session -d -s "marimo-bench-$port" -c "$ROOT" -- \
    env COLON_A2_STORE="$STORE" PYTHONPATH="$milume_dir${PYTHONPATH:+:$PYTHONPATH}" \
    uv run --extra demo marimo run --headless --no-token --port "$port" frontend/dev/colon_a2_kernel_bench.py
  for _ in $(seq 1 60); do
    if curl -sf "http://127.0.0.1:$port/" >/dev/null 2>&1; then break; fi
    sleep 2
  done
  MARIMO_URL="http://127.0.0.1:$port/" RUNS="$RUNS" node "$ROOT/frontend/scripts/colon-a2-kernel-bench.mjs" \
    | tee "/opt/cursor/artifacts/colon-a2-kernel-bench-$label.json"
  tmux -f /exec-daemon/tmux.portal.conf kill-session -t "marimo-bench-$port" 2>/dev/null || true
}

bench_one comm "$PORT_COMM" "$ROOT"
bench_one main-http "$PORT_MAIN" "/tmp/milume-main"
