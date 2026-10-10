#!/usr/bin/env bash
# Assemble GitHub Pages artifact: landing -> site/, Zensical -> site/docs/.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
WEBSITE="${ROOT}/website"
OUT="${ROOT}/site"

(
  cd "${WEBSITE}"
  if [[ -f package-lock.json ]]; then
    npm ci
  else
    npm install
  fi
  npm run build:hero
)

HERO_ASSETS=(
  hero-renderer.js
  hero-points.bin
  hero-poster.png
  hero-poster-800.png
)
mkdir -p "${WEBSITE}/content/assets"
for f in "${HERO_ASSETS[@]}"; do
  cp -f "${WEBSITE}/landing/assets/${f}" "${WEBSITE}/content/assets/${f}"
done

rm -rf "${OUT}"
mkdir -p "${OUT}"

LOGO_SRC="${ROOT}/assets/logo"
for dest in "${WEBSITE}/content/assets/logo" "${WEBSITE}/landing/assets/logo"; do
  mkdir -p "${dest}"
  cp -a \
    "${LOGO_SRC}/milume-mark.svg" \
    "${LOGO_SRC}/favicon.svg" \
    "${LOGO_SRC}/favicon.ico" \
    "${LOGO_SRC}/milume-icon-light.svg" \
    "${LOGO_SRC}/milume-icon-dark.svg" \
    "${dest}/"
done

cp -a "${WEBSITE}/landing/." "${OUT}/"
touch "${OUT}/.nojekyll"

uv run --directory "${ROOT}" python -m pytest "${WEBSITE}/scripts/test_agent_md_format.py" -q
uv run --directory "${ROOT}" python "${WEBSITE}/scripts/sync-api-docs.py"

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
