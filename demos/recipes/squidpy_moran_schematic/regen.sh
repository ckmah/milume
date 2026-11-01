#!/bin/sh
# Regenerate the Moran's I method schematic: statechart (pstack statechart skill + Pele + headless Chrome)
# and the panel illustrations (gen_panels.py). Run from anywhere.
set -e
cd "$(dirname "$0")"
export PATH=$HOME/.local/bin:$PATH
SC=${STATECHART:-/home/box/sand-data/plugins/cache/cursor-public/pstack/1ba91fc25c0977741dd0e267849e6234b037ed0a/skills/statechart/scripts/statechart}
PELE=${PELE:-/workspace/pele}
OUT=${1:-out}
rm -rf "$OUT"
$SC MoranContrast.tla --config MoranContrast.cfg --view view.ts --out "$OUT"
size=$(cd "$PELE" && node render.mjs "$OLDPWD/$OUT/chart.mmd" "$OLDPWD/$OUT/chart.svg")
"$PELE/png.sh" "$OUT/chart.svg" "$OUT/chart.png" $size
cp "$OUT/chart.svg" schematic-moran-statechart.svg
cp "$OUT/chart.png" schematic-moran-statechart.png
python3 gen_panels.py
"$PELE/png.sh" schematic-moran-panels.svg schematic-moran-panels.png 1200 400
