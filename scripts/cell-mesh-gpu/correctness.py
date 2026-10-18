"""Correctness of surface nets vs the loft against the source polygons, with the label volume
raw (stored sdata transform) and calibrated (mean label-vs-polygon centroid offset from calib.py
removed). Same cells as bench_all: 8 hole + 8 split cells from bench_mesh, 150 random (seed 0).
Writes /workspace/cell-mesh/bench/results-gpu-correctness.json."""
import json, numpy as np, common
from milume.cell_mesh import CellMeshCache, MeshParams
from surface_nets_nb import surface_nets_nb
from metrics import score
gdf, labels, xy, zs = common.load_polygons()
p = MeshParams(z_step_um=zs)
ref = CellMeshCache(gdf.cell_id.to_numpy(), gdf.Z_um.to_numpy(), gdf.geometry.to_numpy(), labels, p)
ALL = list(ref.cells)
off = np.array(json.load(open("/workspace/cell-mesh/bench/label-calib.json"))["mean_offset_zyx_um"])
prev = json.load(open("/workspace/cell-mesh/bench/results-mesh.json"))
picked = [("hole", c["cell"]) for c in prev["hole_cells"]] + [("split", c["cell"]) for c in prev["split_cells"]]
rng = np.random.default_rng(0)
rand = [("random", c) for c in rng.choice(np.array(ALL, dtype=object), 150, replace=False)]
g0 = common.label_array("s0"); T0 = np.array([-1.0053027092508273, -5414.147568225861, 784.2817039489746])
arrs = {lvl: common.label_array(lvl) for lvl in ("s0", "s1")}
rows_by = {c: grp.sort_values("Z_um") for c, grp in gdf.groupby("cell_id")}
corr = []
for kind, c in picked + rand:
    rows = rows_by[c]; zz = rows.Z_um.to_numpy(); gg = rows.geometry.to_numpy()
    m = ref.mesh(c)
    e = {"kind": kind, "cell": c, "loft": score(m.positions, m.indices, zz, gg)}
    for lvl, arr in arrs.items():
        S = np.array([0.5, 0.45993900299072266, 0.45993900299072266]) * np.array(g0.shape) / np.array(arr.shape)
        x0, y0, x1, y1 = ref.bbox[c]
        ix0 = max(int((x0 - T0[2]) / S[2]) - 2, 0); ix1 = int((x1 - T0[2]) / S[2]) + 3
        iy0 = max(int((y0 - T0[1]) / S[1]) - 2, 0); iy1 = int((y1 - T0[1]) / S[1]) + 3
        vol = arr[:, iy0:iy1, ix0:ix1]
        for tag, o in (("raw", 0.0), ("cal", off)):
            for it in ((2, 0) if lvl == "s0" and tag == "cal" else (2,)):
                sm = surface_nets_nb(vol, S, T0 + S * np.array([0, iy0, ix0]) - o, [ref.label[c]], smooth_iters=it)
                e[f"sn_{lvl}_{tag}" + ("" if it == 2 else "_nosmooth")] = score(sm.positions, sm.indices, zz, gg)
    corr.append(e)
    if len(corr) % 25 == 0:
        print("corr", len(corr), flush=True)
meths = [k for k in corr[0] if k not in ("kind", "cell")]
def summ(kinds, key):
    out = {}
    for meth in meths:
        v = [e[meth][key] for e in corr if e["kind"] in kinds and e[meth][key] is not None]
        out[meth] = round(float(np.mean(v)), 4) if v else None
    return out
summary = {
    "section_iou_mean_random150": summ({"random"}, "section_iou_mean"),
    "section_iou_p10_random150": summ({"random"}, "section_iou_p10"),
    "section_iou_mean_hole_split16": summ({"hole", "split"}, "section_iou_mean"),
    "big_hole_open_frac_hole8": summ({"hole"}, "big_hole_open_frac"),
    "split_piece_covered_frac_split8": summ({"split"}, "split_piece_covered_frac"),
    "closed_edge_frac_all": summ({"hole", "split", "random"}, "closed_edge_frac"),
    "triangles_per_cell_random150": summ({"random"}, "triangles"),
}
print(json.dumps(summary, indent=1))
json.dump({"offset_zyx_um": off.tolist(), "summary": summary, "cells": corr}, open("/workspace/cell-mesh/bench/results-gpu-correctness.json", "w"), indent=1, default=float)
print("DONE")
