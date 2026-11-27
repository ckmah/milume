#!/usr/bin/env bash
# Restore a stamped recipe export, or produce it, or download the one this SHA's
# recipe-compute workflow just packed. See scripts/recipe_export_cache.py.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT}"

MODE="${MODE:?MODE=produce or MODE=consume}"
CACHE_HIT_FULL="${CACHE_HIT_FULL:-false}"
CACHE_HIT_COMPUTE="${CACHE_HIT_COMPUTE:-false}"

if [[ "${CACHE_HIT_FULL}" == "true" ]]; then
  python3 scripts/recipe_export_cache.py check
  echo "recipe-compute: cache hit ${CACHE_KEY:?}"
  exit 0
fi

# Frontend-only change: squidpy export is reusable; rebuild the widget ESM/CSS.
if [[ "${CACHE_HIT_COMPUTE}" == "true" ]]; then
  python3 scripts/recipe_export_cache.py repack
  python3 scripts/recipe_export_cache.py check
  echo "recipe-compute: repacked widget onto compute cache ${CACHE_KEY:?}"
  exit 0
fi

if [[ "${MODE}" == "produce" ]]; then
  python3 scripts/recipe_export_cache.py compute
  python3 scripts/recipe_export_cache.py check
  exit 0
fi

if [[ "${MODE}" != "consume" ]]; then
  echo "recipe-compute: unknown MODE=${MODE}" >&2
  exit 2
fi

python3 scripts/recipe_export_cache.py wait
python3 scripts/recipe_export_cache.py check
