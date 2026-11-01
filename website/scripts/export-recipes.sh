#!/usr/bin/env bash
# Build marimo-studio zero-python exports for Zensical recipe pages.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
WEBSITE="${ROOT}/website"
CONTENT_RECIPES="${WEBSITE}/content/how-to/recipes"
MODE="${1:?usage: export-recipes.sh prepare-for-zensical | export-recipes.sh <site-root>}"

RECIPES=(
  squidpy_color
  squidpy_moran
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

export_one() {
  local slug="$1"
  local out="$2"
  local nb="${ROOT}/demos/recipes/${slug}.py"
  rm -rf "${out}"
  if [[ "${slug}" == "squidpy_moran" ]]; then
    export MILUME_RECIPE_EXPORT_STRIP=1
  else
    unset MILUME_RECIPE_EXPORT_STRIP
  fi
  uv run --directory "${ROOT}" marimo-studio view export docs \
    --target "${nb}" \
    --output "${out}" \
    --prepare-timeout 600 \
    --force
}

prepare_slug() {
  local slug="$1"
  local staging="$2"
  local loaded="${3:-}"
  local args=(
    "${slug}"
    "${staging}/${slug}"
    --content-root
    "${CONTENT_RECIPES}"
  )
  if [[ -n "${loaded}" ]]; then
    args+=(--loaded-urls "${loaded}")
  fi
  uv run --directory "${ROOT}" python "${WEBSITE}/scripts/prepare_recipe_studio.py" "${args[@]}"
}

copy_to_site() {
  local out="$1"
  mkdir -p "${out}/docs/assets/marimo-studio-zero-python"
  mkdir -p "${out}/docs/assets/recipes"
  rm -rf "${out}/docs/assets/marimo-studio-zero-python"
  cp -a "${WEBSITE}/content/assets/marimo-studio-zero-python" "${out}/docs/assets/"
  if [[ -d "${WEBSITE}/content/assets/recipe-widgets" ]]; then
    rm -rf "${out}/docs/assets/recipe-widgets"
    cp -a "${WEBSITE}/content/assets/recipe-widgets" "${out}/docs/assets/"
  fi
  for slug in "${RECIPES[@]}"; do
    local dest="${out}/docs/how-to/recipes/${slug}/_marimo-studio"
    mkdir -p "$(dirname "${dest}")"
    rm -rf "${dest}"
    cp -a "${CONTENT_RECIPES}/${slug}/_marimo-studio" "${dest}"
  done
}

if [[ "${MODE}" == "prepare-for-zensical" ]]; then
  staging="$(mktemp -d)"
  trap 'rm -rf "${staging}"' EXIT
  for slug in "${RECIPES[@]}"; do
    echo "export-recipes: ${slug} -> zensical content"
    export_one "${slug}" "${staging}/${slug}"
    prepare_slug "${slug}" "${staging}"
  done
  exit 0
fi

OUT="${MODE}"
copy_to_site "${OUT}"
