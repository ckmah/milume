#!/usr/bin/env bash
# Builds the wheel and fails if the widget bundle is missing (#109, #151).
# Run `npm run build` in frontend/ first.
set -euo pipefail
cd "$(dirname "$0")/.."
out="$(mktemp -d)"
uv build --wheel --out-dir "$out" >&2
wheel="$(ls "$out"/*.whl)"
if ! unzip -l "$wheel" | grep -q 'milume/static/bundled/landmarks.mjs'; then
  echo "check-wheel-bundle: $(basename "$wheel") has no milume/static/bundled/landmarks.mjs. Run npm run build in frontend/ before uv build." >&2
  exit 1
fi
echo "check-wheel-bundle: ok ($(basename "$wheel") ships milume/static/bundled/landmarks.mjs)"
