#!/usr/bin/env bash
# Assemble GitHub Pages artifact: landing -> site/, Zensical -> site/docs/.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
WEBSITE="${ROOT}/website"
OUT="${ROOT}/site"

rm -rf "${OUT}"
mkdir -p "${OUT}"

cp -a "${WEBSITE}/landing/." "${OUT}/"
touch "${OUT}/.nojekyll"

rm -rf "${WEBSITE}/dist"
(
  cd "${WEBSITE}"
  zensical build --clean
)

mkdir -p "${OUT}/docs"
cp -a "${WEBSITE}/dist/." "${OUT}/docs/"

uv run --directory "${ROOT}" python "${WEBSITE}/scripts/agent-index.py"
uv run --directory "${ROOT}" python "${WEBSITE}/scripts/check-agent-md.py" "${OUT}"

echo "Assembled Pages site at ${OUT}"
