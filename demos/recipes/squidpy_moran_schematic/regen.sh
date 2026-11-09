#!/bin/sh
# Regenerate the Moran's I method schematic: statechart (pstack statechart skill + Pele + headless Chrome)
# and the panel illustrations (gen_panels.py). Run from anywhere.
set -e
HERE=$(CDPATH= cd "$(dirname "$0")" && pwd)
ROOT=$(CDPATH= cd "$HERE/../../.." && pwd)
cd "$HERE"
export PATH=$HOME/.local/bin:$PATH
SC=${STATECHART:-"$ROOT/.agents/skills/statechart/scripts/statechart.mjs"}
if [ -z "${PELE:-}" ]; then
  echo "Set PELE to a pele checkout that contains render.mjs and png.sh." >&2
  exit 1
fi
OUT=${1:-out}
rm -rf "$OUT"
node "$SC" MoranContrast.tla --config MoranContrast.cfg --view view.ts --out "$OUT"
size=$(cd "$PELE" && node render.mjs "$OLDPWD/$OUT/chart.mmd" "$OLDPWD/$OUT/chart.svg")
"$PELE/png.sh" "$OUT/chart.svg" "$OUT/chart.png" $size
cp "$OUT/chart.svg" schematic-moran-statechart.svg
cp "$OUT/chart.png" schematic-moran-statechart.png
python3 gen_panels.py
"$PELE/png.sh" schematic-moran-panels.svg schematic-moran-panels.png 1200 400
