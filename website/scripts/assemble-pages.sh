#!/usr/bin/env bash
# Assemble GitHub Pages artifact: landing -> site/, Zensical -> site/docs/.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
WEBSITE="${ROOT}/website"
OUT="${ROOT}/site"

free_preview_port() {
  local port="$1"
  if command -v fuser >/dev/null 2>&1; then
    fuser -k "${port}/tcp" 2>/dev/null || true
  fi
  sleep 0.3
}

(
  cd "${WEBSITE}"
  if [[ "${MILUME_DEPS_READY_WEBSITE:-}" == "1" ]]; then
    echo "assemble-pages: website/node_modules already installed (CI cache), skipping npm ci"
  elif [[ -f package-lock.json ]]; then
    npm ci
  else
    npm install
  fi
  npm run build:hero
)

CF_BEACON_TOKEN="${CF_BEACON_TOKEN:-}"
uv run --directory "${ROOT}" python "${WEBSITE}/scripts/cf_beacon.py" --zensical-partial

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
    "${LOGO_SRC}/wordmark-light.svg" \
    "${LOGO_SRC}/wordmark-dark.svg" \
    "${dest}/"
done

cp -a "${WEBSITE}/landing/." "${OUT}/"
uv run --directory "${ROOT}" python "${WEBSITE}/scripts/cf_beacon.py" --landing "${OUT}/index.html"
touch "${OUT}/.nojekyll"

uv run --directory "${ROOT}" python -m pytest \
  "${WEBSITE}/scripts/test_agent_md_format.py" \
  "${WEBSITE}/scripts/test_api_reference_codegen.py" \
  "${WEBSITE}/scripts/test_cf_beacon.py" \
  "${WEBSITE}/scripts/test_docs_redirects.py" \
  "${WEBSITE}/scripts/test_prepare_recipe_studio.py" \
  -q
uv run --directory "${ROOT}" python "${WEBSITE}/scripts/sync-api-docs.py"

chmod +x "${WEBSITE}/scripts/export-recipes.sh"
uv run --directory "${ROOT}" bash "${WEBSITE}/scripts/export-recipes.sh" prepare-for-zensical

rm -rf "${WEBSITE}/dist"
(
  cd "${WEBSITE}"
  zensical build --clean
)

loaded_urls="$(mktemp)"
preview_pid=""
cleanup_preview() {
  if [[ -n "${preview_pid}" ]] && kill -0 "${preview_pid}" 2>/dev/null; then
    kill "${preview_pid}" 2>/dev/null || true
  fi
  rm -f "${loaded_urls}"
}
trap cleanup_preview EXIT
free_preview_port 8766
python3 -m http.server 8766 --bind 127.0.0.1 --directory "${WEBSITE}/dist" >/dev/null 2>&1 &
preview_pid=$!
sleep 1
node "${ROOT}/frontend/scripts/record-recipe-network.mjs" \
  "http://127.0.0.1:8766/how-to/recipes/squidpy_color/index.html" \
  "${loaded_urls}"
uv run --directory "${ROOT}" python "${WEBSITE}/scripts/prepare_recipe_studio.py" \
  --prune-shared-only --loaded-urls "${loaded_urls}"

rm -rf "${WEBSITE}/dist"
(
  cd "${WEBSITE}"
  zensical build --clean
)

mkdir -p "${OUT}/docs"
cp -a "${WEBSITE}/dist/." "${OUT}/docs/"

uv run --directory "${ROOT}" bash "${WEBSITE}/scripts/export-recipes.sh" "${OUT}"

payload_pid=""
cleanup_payload() {
  cleanup_preview
  if [[ -n "${payload_pid}" ]] && kill -0 "${payload_pid}" 2>/dev/null; then
    kill "${payload_pid}" 2>/dev/null || true
  fi
}
trap cleanup_payload EXIT
free_preview_port 8765
python3 -m http.server 8765 --bind 127.0.0.1 --directory "${OUT}" >/dev/null 2>&1 &
payload_pid=$!
sleep 1
uv run --directory "${ROOT}" python "${WEBSITE}/scripts/check_recipe_payload.py"

uv run --directory "${ROOT}" python "${WEBSITE}/scripts/docs_redirects.py" "${OUT}"

uv run --directory "${ROOT}" python "${WEBSITE}/scripts/agent-index.py"
uv run --directory "${ROOT}" python "${WEBSITE}/scripts/check_molab_links.py" "${OUT}"
uv run --directory "${ROOT}" python "${WEBSITE}/scripts/check-agent-md.py" "${OUT}"

echo "Assembled Pages site at ${OUT}"
