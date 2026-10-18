"""Correctness metrics, copied from /workspace/cell-mesh/bench/bench_mesh.py (same definitions).

section_iou: mesh cut at each source slice z vs the cleaned source polygon.
big_hole_open_frac: share of real holes (>= 2 µm²) left open by the section.
split_piece_covered_frac: share of minor split pieces (>= 5 µm²) covered by the section.
closed_edge_frac: share of edges shared by exactly two triangles (after welding).
"""
import numpy as np, shapely


def section(positions, indices, z):
    P = positions.astype(np.float64); T = indices.reshape(-1, 3).astype(np.int64)
    d = P[:, 2] - z
    dd = d[T]
    cross = ~((dd > 0).all(1) | (dd < 0).all(1))
    segs = []
    for tri, dv in zip(T[cross], dd[cross]):
        pts = []
        for a, b in ((0, 1), (1, 2), (2, 0)):
            da, db = dv[a], dv[b]
            if (da > 0) != (db > 0):
                t = da / (da - db)
                pts.append(P[tri[a], :2] + t * (P[tri[b], :2] - P[tri[a], :2]))
        if len(pts) == 2:
            segs.append(shapely.LineString(pts))
    if not segs:
        return shapely.Polygon()
    merged = shapely.line_merge(shapely.union_all(segs))
    polys = shapely.get_parts(shapely.polygonize(shapely.get_parts(merged)))
    out = shapely.Polygon()
    for p in polys:
        out = out.symmetric_difference(shapely.Polygon(p.exterior))
    return out


def closed_edge_frac(positions, indices):
    T = indices.reshape(-1, 3).astype(np.int64)
    P = np.round(positions.astype(np.float64), 4)
    _, inv = np.unique(P, axis=0, return_inverse=True)
    T = inv.ravel()[T]
    e = np.sort(np.concatenate([T[:, [0, 1]], T[:, [1, 2]], T[:, [2, 0]]]), axis=1)
    _, c = np.unique(e, axis=0, return_counts=True)
    return float((c == 2).mean())


def clean(g):
    parts = [q for q in shapely.get_parts(shapely.make_valid(g)) if isinstance(q, shapely.Polygon) and q.area >= 0.5]
    parts = [shapely.Polygon(q.exterior, [r for r in q.interiors if shapely.Polygon(r).area >= 0.5]) for q in parts]
    return shapely.union_all(parts) if parts else shapely.Polygon()


def score(positions, indices, zs, geoms):
    ious, hole_open, hole_tot, minor_cov, minor_tot = [], 0.0, 0.0, 0.0, 0.0
    for z, g in zip(zs, geoms):
        s = shapely.make_valid(section(positions, indices, z + 0.01))
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
            "closed_edge_frac": closed_edge_frac(positions, indices), "triangles": int(indices.size // 3)}
