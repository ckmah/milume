"""Write label-volume crops (+ meta) for the browser bench: $DATA/{s1,s0}_{100,300}.bin/json."""
import json, os, numpy as np, common
from milume.cell_mesh import CellMeshCache, MeshParams
DATA = os.environ.get("DATA", "/workspace/cell-mesh/gpu-data"); os.makedirs(DATA, exist_ok=True)
gdf, labels, xy, zs = common.load_polygons()
ref = CellMeshCache(gdf.cell_id.to_numpy(), gdf.Z_um.to_numpy(), gdf.geometry.to_numpy(), labels, MeshParams(z_step_um=zs))
g0 = common.label_array("s0"); T0 = np.array([-1.0053027092508273, -5414.147568225861, 784.2817039489746])
for lvl in ("s1", "s0"):
    arr = common.label_array(lvl)
    S = np.array([0.5, 0.45993900299072266, 0.45993900299072266]) * np.array(g0.shape) / np.array(arr.shape)
    for win in (100, 300):
        cells = ref.cells_in(*common.window_box(win))
        bb = np.array([ref.bbox[c] for c in cells]); x0, y0 = bb[:, :2].min(0); x1, y1 = bb[:, 2:].max(0)
        ix0 = max(int((x0 - T0[2]) / S[2]) - 1, 0); ix1 = int((x1 - T0[2]) / S[2]) + 2
        iy0 = max(int((y0 - T0[1]) / S[1]) - 1, 0); iy1 = int((y1 - T0[1]) / S[1]) + 2
        vol = np.ascontiguousarray(arr[:, iy0:iy1, ix0:ix1]).astype(np.uint32)
        keep = sorted(int(ref.label[c]) for c in cells)
        name = f"{lvl}_{win}"
        vol.tofile(f"{DATA}/{name}.bin")
        json.dump({"shape": list(vol.shape), "scale": S.tolist(), "trans": (T0 + S * np.array([0, iy0, ix0])).tolist(), "keep": keep, "lut_len": int(max(keep)) + 1, "cells": len(cells)}, open(f"{DATA}/{name}.json", "w"))
        print(name, vol.shape, vol.nbytes / 1e6, "MB")
