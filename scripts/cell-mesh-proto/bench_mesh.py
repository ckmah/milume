"""Meshing benchmark + hole/split correctness on HF small. Writes results-mesh.json."""
import stub, time, json, sys, os, resource
import numpy as np, shapely
from load_small import load
from milume.cell_mesh import mesh_cell, MeshParams, CellMeshCache, pack_mesh, unpack_mesh

gdf, labels, xy, zs = load()
res = {"cells": int(gdf.cell_id.nunique()), "rows": len(gdf), "xy_um_per_px": xy, "z_step_um": zs}
# JIT warm-up on one cell (numba cache=True: first process compiles, later ones load)
g = gdf[gdf.cell_id == gdf.cell_id.iloc[0]]
t = time.perf_counter(); mesh_cell(zip(g.Z_um, g.geometry), MeshParams(z_step_um=zs)); res["jit_warmup_s"] = time.perf_counter() - t

def section(m, z):
    """Horizontal section of a mesh at z -> polygon area via segment polygonize."""
    P = m.positions.astype(np.float64); T = m.indices.reshape(-1, 3)
    d = P[:, 2] - z
    segs = []
    for tri in T:
        dd = d[tri]
        if (dd > 0).all() or (dd < 0).all():
            continue
        pts = []
        for a, b in ((0, 1), (1, 2), (2, 0)):
            da, db = dd[a], dd[b]
            if (da > 0) != (db > 0):
                t = da / (da - db)
                pts.append(P[tri[a], :2] + t * (P[tri[b], :2] - P[tri[a], :2]))
        if len(pts) == 2:
            segs.append(shapely.LineString(pts))
    if not segs:
        return shapely.Polygon()
    merged = shapely.line_merge(shapely.union_all(segs))
    polys = shapely.get_parts(shapely.polygonize(shapely.get_parts(merged)))
    # even-odd: rings nested in rings are holes
    out = shapely.Polygon()
    for p in polys:
        out = out.symmetric_difference(shapely.Polygon(p.exterior))
    return out

def edges_ok(m):
    T = m.indices.reshape(-1, 3).astype(np.int64)
    P = np.round(m.positions.astype(np.float64), 4)
    _, inv = np.unique(P, axis=0, return_inverse=True)
    T = inv.ravel()[T]
    e = np.sort(np.concatenate([T[:, [0, 1]], T[:, [1, 2]], T[:, [2, 0]]]), axis=1)
    _, c = np.unique(e, axis=0, return_counts=True)
    return float((c == 2).mean())

CONFIGS = {"default_stride2_seg1.0": dict(stride=2, seg_um=1.0), "lean_stride2_seg1.5": dict(stride=2, seg_um=1.5, ring_min=10, ring_max=28),
           "full_stride1_seg1.0": dict(stride=1, seg_um=1.0)}
if os.environ.get("ONLY_DEFAULT"):
    CONFIGS = {k: v for k, v in CONFIGS.items() if k.startswith("default")}
    prev = json.load(open("/workspace/cell-mesh/bench/results-mesh.json"))
for name, kw in CONFIGS.items():
    p = MeshParams(z_step_um=zs, **kw)
    cache = CellMeshCache(gdf.cell_id.to_numpy(), gdf.Z_um.to_numpy(), gdf.geometry.to_numpy(), labels, p)
    t = time.perf_counter(); meshes = cache.build(cache.cells); dt = time.perf_counter() - t
    tris = sum(m.n_triangles for m in meshes); verts = sum(len(m.positions) for m in meshes)
    st = {k: sum(getattr(m.stats, k) for m in meshes) for k in vars(meshes[0].stats)}
    r = {"params": kw, "mesh_all_s_8threads": dt, "triangles": tris, "vertices": verts, "stats": st}
    full = pack_mesh(meshes, [cache.label[c] for c in cache.cells], (0, 0, 0)); r["payload_all_bytes"] = len(full); del full
    for win in (100, 300):
        cx, cy = 1443.0, -5190.0
        box = (cx - win / 2, cy - win / 2, cx + win / 2, cy + win / 2)
        cells = cache.cells_in(*box)
        cache._windows.clear()
        t = time.perf_counter(); b = cache.window_bytes(*box); warm = time.perf_counter() - t
        t = time.perf_counter(); cache.window_bytes(*box); hit = time.perf_counter() - t
        c2 = CellMeshCache(gdf.cell_id.to_numpy(), gdf.Z_um.to_numpy(), gdf.geometry.to_numpy(), labels, p)
        t = time.perf_counter(); c2.window_bytes(*box); cold = time.perf_counter() - t
        u = unpack_mesh(b)
        r[f"window_{win}um"] = {"box": box, "cells": len(cells), "triangles": int(u["indices"].size // 3), "vertices": int(u["header"]["vertices"]), "bytes": len(b), "cold_s": cold, "pack_from_cell_cache_s": warm, "cached_s": hit}
    res[name] = r
    print(name, json.dumps(r, default=float), flush=True)
    if name.startswith("default"):
        keep = cache
    del cache, meshes

# Correctness on hand-picked cells: real holes (>= 2 µm² on >= 3 slices) and real splits
# (>= 2 pieces of >= 5 µm² on >= 3 slices); ours vs polyrender's rule, same loft.
pr = CellMeshCache(gdf.cell_id.to_numpy(), gdf.Z_um.to_numpy(), gdf.geometry.to_numpy(), labels, MeshParams(z_step_um=zs, stride=2, polyrender_rule=True))
def big_holes(g, amin=2.0):
    return sum(1 for q in shapely.get_parts(g) for r in q.interiors if shapely.Polygon(r).area >= amin)
def big_pieces(g, amin=5.0):
    return sum(1 for q in shapely.get_parts(g) if q.area >= amin)
gdf = gdf.assign(bh=[big_holes(g) for g in gdf.geometry.values], bp=[big_pieces(g) for g in gdf.geometry.values])
by = gdf.groupby("cell_id").agg(hole_slices=("bh", lambda s: int((s > 0).sum())), split_slices=("bp", lambda s: int((s > 1).sum())))
res["population"] = {"cells_with_real_holes": int((by.hole_slices >= 3).sum()), "cells_with_real_splits": int((by.split_slices >= 3).sum())}
hole_cells = by[by.hole_slices >= 3].sort_values("hole_slices", ascending=False).index[:8].tolist()
split_cells = by[by.split_slices >= 3].sort_values("split_slices", ascending=False).index[:8].tolist()

def clean(g):
    parts = [q for q in shapely.get_parts(shapely.make_valid(g)) if isinstance(q, shapely.Polygon) and q.area >= 0.5]
    parts = [shapely.Polygon(q.exterior, [r for r in q.interiors if shapely.Polygon(r).area >= 0.5]) for q in parts]
    return shapely.union_all(parts) if parts else shapely.Polygon()

def score(m, rows):
    ious, hole_open, hole_tot, minor_cov, minor_tot = [], 0.0, 0.0, 0.0, 0.0
    for z, g in zip(rows.Z_um.to_numpy(), rows.geometry.to_numpy()):
        s = shapely.make_valid(section(m, z + 0.01))
        t = clean(g)
        u = t.union(s).area
        ious.append(t.intersection(s).area / u if u else 1.0)
        parts = sorted([q for q in shapely.get_parts(t) if isinstance(q, shapely.Polygon)], key=lambda q: -q.area)
        holes = [shapely.Polygon(r) for q in parts for r in q.interiors if shapely.Polygon(r).area >= 2.0]
        for h in holes:
            hole_tot += h.area; hole_open += h.difference(s).area
        for q in parts[1:]:
            if q.area >= 5.0:
                minor_tot += q.area; minor_cov += q.intersection(s).area
    return {"section_iou_mean": float(np.mean(ious)), "section_iou_p10": float(np.percentile(ious, 10)),
            "big_hole_open_frac": hole_open / hole_tot if hole_tot else None,
            "split_piece_covered_frac": minor_cov / minor_tot if minor_tot else None,
            "closed_edge_frac": edges_ok(m), "triangles": m.n_triangles}

def check(c):
    rows = gdf[gdf.cell_id == c].sort_values("Z_um")
    m = keep.mesh(c)
    return {"cell": c, "label": keep.label[c], "stats": vars(m.stats), "bbox": m.bbox, "ours": score(m, rows), "polyrender_rule": score(pr.mesh(c), rows)}

res["hole_cells"] = [check(c) for c in hole_cells]
res["split_cells"] = [check(c) for c in split_cells]
if os.environ.get("ONLY_DEFAULT"):
    res = {**prev, **{k: v for k, v in res.items() if k in ("hole_cells", "split_cells", "population")}}
res["max_rss_mb"] = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024
json.dump(res, open("/workspace/cell-mesh/bench/results-mesh.json", "w"), indent=1, default=float)
print("DONE")
