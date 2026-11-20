#!/usr/bin/env bash
# Restore a stamped recipe export, or produce it, or download the one this SHA's
# recipe-compute workflow just packed. See scripts/recipe_export_cache.py.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT}"

MODE="${MODE:?MODE=produce or MODE=consume}"
CACHE_HIT="${CACHE_HIT:-false}"

if [[ "${CACHE_HIT}" == "true" ]]; then
  python3 scripts/recipe_export_cache.py check
  echo "recipe-compute: cache hit ${CACHE_KEY:?}"
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
