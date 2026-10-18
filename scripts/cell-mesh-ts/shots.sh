#!/bin/bash
cd /workspace/milume-mesh/frontend
S=/workspace/cell-mesh/shots/ts; F=/small-leiden-ts.fixture.json; B=http://127.0.0.1:5301
run(){ env BASE_URL=$B FIXTURE=$F SHOTS=$S "$@" timeout 600 node scripts/cell-mesh-shots.mjs 2>&1 | grep -v "404" ; }
run WINDOW=100
run WINDOW=300
run WINDOW=100 CUT=z
run WINDOW=100 CUT=x PRESET=Iso ORBIT_DX=0 ORBIT_DY=0 ORBIT_NAME=iso VIEWS=top,orbit
run WINDOW=100 CUT=y PRESET=Iso ORBIT_DX=0 ORBIT_DY=0 ORBIT_NAME=iso VIEWS=top,orbit
run WINDOW=300 CUT=x PRESET=Iso ORBIT_DX=0 ORBIT_DY=0 ORBIT_NAME=iso VIEWS=orbit
run WINDOW=100 TAG=-recolorFOV RECOLOR=/workspace/milume-mesh/frontend/dev/landmarks-volume/public/small-leiden.recolor-FOV.json VIEWS=top
run WINDOW=100 TAG=-depthprepass VIEWS=top ; echo DONE
