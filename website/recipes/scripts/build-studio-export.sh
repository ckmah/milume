#!/usr/bin/env bash
# Build the squidpy niche marimo-studio export (zero-python) for docs Pages.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
NB="${ROOT}/website/recipes/squidpy_color_niche.py"
VIEW=docs
OUT="${ROOT}/website/recipes/dist-spike/docs"

cd "${ROOT}/frontend"
if [[ "${MILUME_DEPS_READY_WEBSITE:-}" != "1" ]]; then
  npm ci --silent
fi
npm run -s build

cd "${ROOT}"
uv run marimo-studio view export "${VIEW}" --target "${NB}" --output "${OUT}" --force "$@"
