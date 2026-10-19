#!/bin/bash
# before (5bc677e on :5302) / after (proto-cell-mesh-ts on :5301), same shot script, DialKit hidden
cd /workspace/milume-mesh/frontend
D=/workspace/cell-mesh/shots/ts-pop; F=/small-leiden-ts.fixture.json
for side in before:5302 after:5301; do
  n=${side%%:*}; port=${side##*:}
  run(){ env BASE_URL=http://127.0.0.1:$port FIXTURE=$F SHOTS=$D/$n HIDE_DIAL=1 "$@" timeout 900 node scripts/cell-mesh-shots.mjs 2>&1 | grep -v "404" ; }
  mkdir -p $D/$n
  run WINDOW=100 VIEWS=orbit
  run WINDOW=300 VIEWS=orbit
  run WINDOW=100 CUT=z VIEWS=orbit
  run WINDOW=100 CUT=x PRESET=Iso ORBIT_DX=0 ORBIT_DY=0 ORBIT_NAME=iso VIEWS=orbit
done
echo DONE
