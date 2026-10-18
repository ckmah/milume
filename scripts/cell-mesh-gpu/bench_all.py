"""Benchmark + correctness for every candidate. Writes $OUT (default /workspace/cell-mesh/bench/results-gpu.json).

Timings are wall clock on this box (8 vCPU, no GPU). Each window timing is a cold build of
that window's cells (cells whose polygon bbox centre is in the window, as the shipped cache).
Surface-nets timings exclude the zarr read (the browser already holds the label volume;
the read is reported separately).
"""
import json, os, time, resource
import numpy as np
import common
from milume.cell_mesh import CellMeshCache, MeshParams, mesh_cell, pack_mesh
from cpu_vec import VecMesher
from surface_nets import surface_nets, packed_bytes
from surface_nets_nb import surface_nets_nb
from metrics import score

OUT = os.environ.get("OUT", "/workspace/cell-mesh/bench/results-gpu.json")
res = {"box": {"cpus": os.cpu_count(), "gpu": None}}
def save():
    res["max_rss_mb"] = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024
    json.dump(res, open(OUT, "w"), indent=1, default=float)
def log(*a):
    print(*a, flush=True)

gdf, labels, xy, zs = common.load_polygons()
p = MeshParams(z_step_um=zs)
g = gdf[gdf.cell_id == gdf.cell_id.iloc[0]]; mesh_cell(zip(g.Z_um, g.geometry), p)  # numba load
args = (gdf.cell_id.to_numpy(), gdf.Z_um.to_numpy(), gdf.geometry.to_numpy())
ref = CellMeshCache(*args, labels, p)
ALL = list(ref.cells)
WIN = {100: ref.cells_in(*common.window_box(100)), 300: ref.cells_in(*common.window_box(300))}
res["cells"] = {"100": len(WIN[100]), "300": len(WIN[300]), "all": len(ALL)}

# ---- 1. shipped loft (ThreadPool 8) ----
r = {}
for k, cells in [("100", WIN[100]), ("300", WIN[300]), ("all", ALL)]:
    c = CellMeshCache(*args, labels, p)
    t = time.perf_counter(); ms = c.build(cells); dt = time.perf_counter() - t
    b = pack_mesh(ms, [c.label[x] for x in cells], (0, 0, 0))
    r[k] = {"s": dt, "triangles": sum(m.n_triangles for m in ms), "bytes": len(b)}
    del b
    log("loft", k, r[k])
    if k == "all":
        loft_all = {x: m for x, m in zip(cells, ms)}
res["loft_shipped"] = r; save()

# ---- 3. vectorized CPU loft ----
r = {}
vm = VecMesher(*args, p)
for k, cells in [("100", WIN[100]), ("300", WIN[300]), ("all", ALL)]:
    tm = {}; t = time.perf_counter(); ms = vm.build(cells, tm); dt = time.perf_counter() - t
    r[k] = {"s": dt, "phases": tm, "triangles": sum(m.n_triangles for m in ms)}
    if k == "all":
        r[k]["identical_to_shipped"] = int(sum(m.n_triangles == loft_all[x].n_triangles and np.array_equal(m.indices, loft_all[x].indices) for x, m in zip(cells, ms)))
    log("vec", k, r[k])
    del ms
res["loft_vectorized"] = r; save()

# ---- 2. surface nets on the label volume ----
g0 = common.label_array("s0")
T0 = np.array([-1.0053027092508273, -5414.147568225861, 784.2817039489746])
def crop_for(cells, arr, S):
    bb = np.array([ref.bbox[c] for c in cells]); x0, y0 = bb[:, :2].min(0); x1, y1 = bb[:, 2:].max(0)
    ix0 = max(int((x0 - T0[2]) / S[2]) - 1, 0); ix1 = min(int((x1 - T0[2]) / S[2]) + 2, arr.shape[2])
    iy0 = max(int((y0 - T0[1]) / S[1]) - 1, 0); iy1 = min(int((y1 - T0[1]) / S[1]) + 2, arr.shape[1])
    return (iy0, iy1, ix0, ix1)
for lvl in ("s1", "s0"):
    arr = common.label_array(lvl)
    S = np.array([0.5, 0.45993900299072266, 0.45993900299072266]) * np.array(g0.shape) / np.array(arr.shape)
    full = None
    r = {"voxel_um": S.tolist()}
    for k, cells in [("100", WIN[100]), ("300", WIN[300])]:
        iy0, iy1, ix0, ix1 = crop_for(cells, arr, S)
        t = time.perf_counter(); vol = arr[:, iy0:iy1, ix0:ix1]; tio = time.perf_counter() - t
        keep = [ref.label[c] for c in cells]
        surface_nets_nb(vol[:, :8, :8], S, T0, keep[:1] or [1])  # JIT load
        tm = {}; t = time.perf_counter(); m = surface_nets_nb(vol, S, T0 + S * np.array([0, iy0, ix0]), keep, timings=tm); dt = time.perf_counter() - t
        r[k] = {"s": dt, "phases": tm, "zarr_read_s": tio, "crop": list(vol.shape), "triangles": m.n_triangles, "bytes": packed_bytes(m)}
        if lvl == "s1" or k == "100":
            t = time.perf_counter(); m2 = surface_nets(vol, S, T0 + S * np.array([0, iy0, ix0]), keep_labels=keep); r[k]["numpy_xp_s"] = time.perf_counter() - t
            r[k]["numpy_matches_numba"] = bool(m2.n_triangles == m.n_triangles); del m2
        log("sn", lvl, k, r[k]); del m, vol
    # all cells: 100 µm tiles by cell centre (each cell meshed once, whole)
    ctr = {c: ((ref.bbox[c][0] + ref.bbox[c][2]) / 2, (ref.bbox[c][1] + ref.bbox[c][3]) / 2) for c in ALL}
    xs = np.array([v[0] for v in ctr.values()]); ys = np.array([v[1] for v in ctr.values()])
    tx = np.floor((xs - xs.min()) / 100).astype(int); ty = np.floor((ys - ys.min()) / 100).astype(int)
    tiles = {}
    for c, a, b in zip(ALL, tx, ty):
        tiles.setdefault((a, b), []).append(c)
    t_mesh = t_io = 0.0; tri = byt = 0
    for cells in tiles.values():
        iy0, iy1, ix0, ix1 = crop_for(cells, arr, S)
        t = time.perf_counter(); vol = arr[:, iy0:iy1, ix0:ix1]; t_io += time.perf_counter() - t
        t = time.perf_counter(); m = surface_nets_nb(vol, S, T0 + S * np.array([0, iy0, ix0]), [ref.label[c] for c in cells]); t_mesh += time.perf_counter() - t
        tri += m.n_triangles; byt += packed_bytes(m); del m, vol
    r["all"] = {"s": t_mesh, "zarr_read_s": t_io, "tiles": len(tiles), "triangles": tri, "bytes": byt}
    log("sn", lvl, "all", r["all"])
    res[f"surface_nets_{lvl}"] = r; save()

# ---- correctness: hand-picked hole / split cells (same as bench_mesh) + 150 random cells ----
prev = json.load(open("/workspace/cell-mesh/bench/results-mesh.json"))
picked = [("hole", c["cell"]) for c in prev["hole_cells"]] + [("split", c["cell"]) for c in prev["split_cells"]]
rng = np.random.default_rng(0)
rand = [("random", c) for c in rng.choice(np.array(ALL, dtype=object), 150, replace=False)]
arrs = {lvl: common.label_array(lvl) for lvl in ("s0", "s1")}
rows_by = {c: grp.sort_values("Z_um") for c, grp in gdf.groupby("cell_id")}
corr = []
for kind, c in picked + rand:
    rows = rows_by[c]; zz = rows.Z_um.to_numpy(); gg = rows.geometry.to_numpy()
    e = {"kind": kind, "cell": c}
    m = loft_all[c]; e["loft"] = score(m.positions, m.indices, zz, gg)
    for lvl, arr in arrs.items():
        S = np.array([0.5, 0.45993900299072266, 0.45993900299072266]) * np.array(g0.shape) / np.array(arr.shape)
        iy0, iy1, ix0, ix1 = crop_for([c], arr, S)
        sm = surface_nets_nb(arr[:, iy0:iy1, ix0:ix1], S, T0 + S * np.array([0, iy0, ix0]), [ref.label[c]])
        e[f"sn_{lvl}"] = score(sm.positions, sm.indices, zz, gg)
    corr.append(e)
    if len(corr) % 20 == 0:
        log("corr", len(corr))
res["correctness"] = corr
def summ(kinds, key):
    out = {}
    for meth in ("loft", "sn_s1", "sn_s0"):
        es = [e[meth] for e in corr if e["kind"] in kinds]
        v = [x[key] for x in es if x[key] is not None]
        out[meth] = float(np.mean(v)) if v else None
    return out
res["correctness_summary"] = {
    "section_iou_mean_random150": summ({"random"}, "section_iou_mean"),
    "section_iou_p10_random150": summ({"random"}, "section_iou_p10"),
    "section_iou_mean_hole_split16": summ({"hole", "split"}, "section_iou_mean"),
    "big_hole_open_frac_hole8": summ({"hole"}, "big_hole_open_frac"),
    "split_piece_covered_frac_split8": summ({"split"}, "split_piece_covered_frac"),
    "closed_edge_frac_all": summ({"hole", "split", "random"}, "closed_edge_frac"),
}
log(json.dumps(res["correctness_summary"], indent=1))
save(); log("DONE")
