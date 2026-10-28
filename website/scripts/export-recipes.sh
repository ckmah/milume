#!/usr/bin/env bash
# Build marimo-studio zero-python exports into the Pages site tree.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
OUT="${1:?usage: export-recipes.sh <site-root>}"
export MARIMO_EXPORT_REPOSITORY="${MARIMO_EXPORT_REPOSITORY:-${ROOT}/.cache/marimo-export-recipes}"

RECIPES=(
  squidpy_color
)

(
  cd "${ROOT}/frontend"
  if [[ "${MILUME_DEPS_READY_FRONTEND:-}" == "1" ]]; then
    echo "export-recipes: frontend/node_modules cached, skipping npm ci"
  elif [[ -f package-lock.json ]]; then
    npm ci --silent
  else
    npm install --silent
  fi
  npm run -s build
)

mkdir -p "${OUT}/docs/recipes"

for slug in "${RECIPES[@]}"; do
  nb="${ROOT}/demos/recipes/${slug}.py"
  dest="${OUT}/docs/recipes/${slug}"
  rm -rf "${dest}"
  echo "export-recipes: ${slug} -> ${dest}"
  uv run --directory "${ROOT}" marimo-studio view export docs \
    --target "${nb}" \
    --output "${dest}" \
    --force
done
