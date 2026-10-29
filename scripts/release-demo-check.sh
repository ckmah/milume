#!/usr/bin/env bash
# Release prep: prove the in-repo demo notebook runs end to end against the
# release build (not an editable checkout, not milume from PyPI).
#
# Run from a checkout of the release branch:
#   scripts/release-demo-check.sh [notebook]    # default: demos/landmarks.py
#
# Env: MILUME_DEMO_VENV (default /tmp/milume-release-demo), SKIP_FRONTEND_BUILD=1
# to reuse milume/static/bundled. The demo fetches Stellaromics/demo small/ from
# Hugging Face (~215 MB, cached in ~/.cache/huggingface); set HF_HUB_OFFLINE=1 to
# use the cache only.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
NB="$(realpath "${1:-demos/landmarks.py}")"
VENV="${MILUME_DEMO_VENV:-/tmp/milume-release-demo}"
OUT="$VENV/demo-export.html"
echo "== $(git rev-parse --abbrev-ref HEAD) @ $(git rev-parse --short HEAD), notebook $NB"

# git+https installs carry no widget bundle (milume/static/bundled is gitignored),
# so build the wheel the same way publish.yml does.
if [ "${SKIP_FRONTEND_BUILD:-0}" != 1 ]; then (cd frontend && npm ci --silent && npm run -s build); fi
rm -rf dist && uv build --wheel -q
WHL=$(ls dist/milume-*.whl)

rm -rf "$VENV" && uv venv -q -p 3.12 "$VENV"
REQ="$VENV/demo-requirements.txt"
TMPNB="$(mktemp "${TMPDIR:-/tmp}/milume-demo-XXXX.py")"
trap 'rm -f "$TMPNB"' EXIT
# milume is not on PyPI until the release ships; resolve the notebook's other deps only.
sed '/^[[:space:]]*#.*"milume/d' "$NB" > "$TMPNB"
uv export -q --script "$TMPNB" --no-hashes | grep -v -E '^milume([=@ ]|$)' > "$REQ"
VIRTUAL_ENV="$VENV" uv pip install -q "$WHL"
VIRTUAL_ENV="$VENV" uv pip install -q -r "$REQ"
# Run outside the checkout so `import milume` cannot pick up the source tree.
cd "$VENV"
"$VENV/bin/python" -c "import milume; print('milume', milume.__version__, 'from', milume.__file__); assert '/site-packages/' in milume.__file__"
# marimo exits 1 when a cell raises but still writes the export; check it either way.
EXPORT_RC=0; "$VENV/bin/marimo" export html "$NB" -o "$OUT" || EXPORT_RC=$?
echo "marimo export exit code: $EXPORT_RC"

"$VENV/bin/python" - "$OUT" "$EXPORT_RC" <<'PY'
import json, sys
s = open(sys.argv[1]).read()
dec = json.JSONDecoder()
sess, _ = dec.raw_decode(s[s.index("{", s.index('"session":')):])
models, _ = dec.raw_decode(s[s.index("[", s.index("modelNotifications:")):])
errors = []
for c in sess["cells"]:
    for o in c.get("outputs", []):
        blob = json.dumps(o)
        if o.get("type") == "error" or "MarimoExceptionRaisedError" in blob or "marimo-error" in blob:
            errors.append(c["id"])
    for o in c.get("console", []):
        if "Traceback" in str(o.get("text", "")):
            errors.append(c["id"])
widgets = [m for m in models
           if m["message"].get("state", {}).get("_anywidget_id") == "milume.landmarks.LandmarksWidget"]
ok = sys.argv[2] == "0" and not errors and widgets and widgets[0]["message"].get("esm_spec")
print(f"cells: {len(sess['cells'])}  errors: {len(errors)} {sorted(set(errors))}  "
      f"LandmarksWidget models: {len(widgets)}")
if widgets:
    st = widgets[0]["message"]["state"]
    print(f"widget state: {len(st)} traits, color={st.get('color')!r}, "
          f"categories={len(st.get('legend_labels') or [])}")
print("PASS" if ok else "FAIL")
sys.exit(0 if ok else 1)
PY
