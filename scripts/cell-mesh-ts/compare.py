"""TS loft (frontend/src/widgets/volume-cube/cell-loft) vs the Python loft (milume/cell_mesh.py).

1. writes the cell list + windows, 2. runs the Node driver (npx tsx), 3. scores both against
the source polygons with the same metrics as bench_mesh.py, and compares them directly.
Cells: the 8 hole + 8 split cells of bench_mesh, 150 random cells (seed 0, as the GPU study).
Writes $OUT (default /workspace/cell-mesh/bench/results-ts.json).
"""
import json, os, subprocess, sys, time
from pathlib import Path
import numpy as np
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "cell-mesh-gpu"))
import common
from metrics import score
from milume.cell_mesh import CellMeshCache, MeshParams, pack_mesh

OUT = os.environ.get("OUT", "/workspace/cell-mesh/bench/results-ts.json")
FRONT = common.REPO / "frontend"
PQ = str(common.HF / "segmentation_geometries_v1.parquet")
gdf, labels, xy, zs = common.load_polygons()
p = MeshParams(z_step_um=zs)
ref = CellMeshCache(gdf.cell_id.to_numpy(), gdf.Z_um.to_numpy(), gdf.geometry.to_numpy(), labels, p)
ALL = list(ref.cells)
prev = json.load(open("/workspace/cell-mesh/bench/results-mesh.json"))
picked = [("hole", c["cell"]) for c in prev["hole_cells"]] + [("split", c["cell"]) for c in prev["split_cells"]]
rng = np.random.default_rng(0)
rand = [("random", c) for c in rng.choice(np.array(ALL, dtype=object), 150, replace=False)]
cells = picked + rand
cfg = {"xy": xy, "z": zs, "cells": [c for _, c in cells],
       "windows": {"100": list(common.window_box(100)), "300": list(common.window_box(300)), "all": [0, 0, 0, 0]}}
tmp = Path("/workspace/cell-mesh/ts-tmp"); tmp.mkdir(exist_ok=True)
(tmp / "cells.json").write_text(json.dumps(cfg))
t = time.perf_counter()
r = subprocess.run(["npx", "tsx", "scripts/cell-loft-node.mjs", PQ, str(tmp / "cells.json"), str(tmp / "ts.bin")], cwd=FRONT, capture_output=True, text=True)
print(r.stderr[-3000:], flush=True)
r.check_returncode()
node = json.load(open(tmp / "ts.bin.json")); buf = open(tmp / "ts.bin", "rb").read()
res = {"node": node, "node_wall_s": time.perf_counter() - t}
# Python windows, for size comparison
for name in ("100", "300"):
    cs = ref.cells_in(*cfg["windows"][name]); ms = ref.build(cs)
    res.setdefault("python_windows", {})[name] = {"cells": len(cs), "triangles": sum(m.n_triangles for m in ms), "bytes": len(pack_mesh(ms, [ref.label[c] for c in cs], (0, 0, 0)))}
rows_by = {c: grp.sort_values("Z_um") for c, grp in gdf.groupby("cell_id")}
KEYS = {"pieces": "pieces", "chains": "chains", "slabs": "slabs", "seams": "seams", "abrupt": "abrupt", "hole_tubes": "holeTubes", "holes_dropped": "holesDropped"}
out = []
for (kind, c), m in zip(cells, node["cells"]):
    assert m["cell"] == c
    o = m["off"]; nv, ni = m["nv"], m["ni"]
    P = np.frombuffer(buf, np.float32, nv * 3, o).reshape(-1, 3)
    I = np.frombuffer(buf, np.uint32, ni, o + nv * 24)
    py = ref.mesh(c)
    rows = rows_by[c]; zz = rows.Z_um.to_numpy(); gg = rows.geometry.to_numpy()
    e = {"kind": kind, "cell": c, "ts": score(P, I, zz, gg), "py": score(py.positions, py.indices, zz, gg),
         "same_triangles": int(ni // 3) == py.n_triangles, "same_vertices": nv == len(py.positions),
         "stats_ts": {k: m["stats"][v] for k, v in KEYS.items()}, "stats_py": {k: getattr(py.stats, k) for k in KEYS},
         "exact_pairs": m["stats"]["exactPairs"], "pairs": m["stats"]["pairs"]}
    e["same_stats"] = e["stats_ts"] == e["stats_py"]
    if e["same_vertices"]:
        e["max_pos_diff_um"] = float(np.abs(P - py.positions).max()) if nv else 0.0
        e["same_indices"] = bool(np.array_equal(I, py.indices))
    out.append(e)
res["cells"] = out
def mean(kinds, who, key):
    v = [e[who][key] for e in out if e["kind"] in kinds and e[who][key] is not None]
    return round(float(np.mean(v)), 4) if v else None
summ = {}
for label, kinds, key in [("section_iou_mean_random150", {"random"}, "section_iou_mean"), ("section_iou_p10_random150", {"random"}, "section_iou_p10"),
                          ("section_iou_mean_hole_split16", {"hole", "split"}, "section_iou_mean"), ("big_hole_open_frac_hole8", {"hole"}, "big_hole_open_frac"),
                          ("split_piece_covered_frac_split8", {"split"}, "split_piece_covered_frac"), ("closed_edge_frac_all", {"hole", "split", "random"}, "closed_edge_frac")]:
    summ[label] = {"ts": mean(kinds, "ts", key), "python": mean(kinds, "py", key)}
summ["identical_triangle_count"] = f"{sum(e['same_triangles'] for e in out)}/{len(out)}"
summ["identical_stats"] = f"{sum(e['same_stats'] for e in out)}/{len(out)}"
summ["identical_indices"] = f"{sum(e.get('same_indices', False) for e in out)}/{len(out)}"
d = [e["max_pos_diff_um"] for e in out if "max_pos_diff_um" in e]
summ["max_pos_diff_um_p50_p99_max"] = [float(np.percentile(d, 50)), float(np.percentile(d, 99)), float(np.max(d))] if d else None
summ["exact_pair_share"] = sum(e["exact_pairs"] for e in out) / max(1, sum(e["pairs"] for e in out))
res["summary"] = summ
print(json.dumps(summ, indent=1))
print(json.dumps({k: v for k, v in node["windows"].items()}, indent=1))
json.dump(res, open(OUT, "w"), indent=1, default=float)
print("DONE")
