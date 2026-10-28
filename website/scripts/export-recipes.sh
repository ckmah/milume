#!/usr/bin/env bash
# Build marimo-studio zero-python exports for Zensical recipe pages.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
WEBSITE="${ROOT}/website"
MODE="${1:?usage: export-recipes.sh prepare-for-zensical | export-recipes.sh <site-root> (legacy assets only)}"

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

export MARIMO_EXPORT_REPOSITORY="${MARIMO_EXPORT_REPOSITORY:-${ROOT}/.cache/marimo-export-recipes}"

if [[ "${MODE}" == "prepare-for-zensical" ]]; then
  staging="$(mktemp -d)"
  trap 'rm -rf "${staging}"' EXIT
  for slug in "${RECIPES[@]}"; do
    nb="${ROOT}/demos/recipes/${slug}.py"
    echo "export-recipes: ${slug} -> zensical content"
    rm -rf "${staging}/${slug}"
    uv run --directory "${ROOT}" marimo-studio view export docs \
      --target "${nb}" \
      --output "${staging}/${slug}" \
      --force
    uv run --directory "${ROOT}" python "${WEBSITE}/scripts/prepare_recipe_studio.py" \
      "${slug}" "${staging}/${slug}"
  done
  exit 0
fi

# Legacy: copy only _marimo-studio assets beside an existing Zensical page (no standalone index.html).
OUT="${MODE}"
mkdir -p "${OUT}/docs/recipes"
staging="$(mktemp -d)"
trap 'rm -rf "${staging}"' EXIT
for slug in "${RECIPES[@]}"; do
  nb="${ROOT}/demos/recipes/${slug}.py"
  dest="${OUT}/docs/recipes/${slug}"
  mkdir -p "${dest}"
  echo "export-recipes: ${slug} -> ${dest}/_marimo-studio"
  rm -rf "${staging}/${slug}"
  uv run --directory "${ROOT}" marimo-studio view export docs \
    --target "${nb}" \
    --output "${staging}/${slug}" \
    --force
  rm -rf "${dest}/_marimo-studio"
  cp -a "${staging}/${slug}/_marimo-studio" "${dest}/"
done
