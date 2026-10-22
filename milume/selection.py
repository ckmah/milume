"""Selection geometry helpers shared by landmark widgets."""

from __future__ import annotations

import math
from typing import Any


def selection_display_vertices(selection: dict) -> list[tuple[float, float]]:
    """Closed ring of selection vertices in data coordinates."""
    kind = selection.get("type")
    if kind in ("polygon", "lasso"):
        verts = selection.get("vertices") or []
        if len(verts) < 3:
            return []
        return [(float(v[0]), float(v[1])) for v in verts]

    if kind == "rectangle":
        cx = float(selection["cx"])
        cy = float(selection["cy"])
        w = float(selection["width"])
        h = float(selection["height"])
        angle = float(selection.get("angle") or 0.0)
        corners = [
            (cx - w / 2, cy - h / 2),
            (cx + w / 2, cy - h / 2),
            (cx + w / 2, cy + h / 2),
            (cx - w / 2, cy + h / 2),
        ]
        if abs(angle) < 1e-12:
            return corners
        cos_a, sin_a = math.cos(angle), math.sin(angle)
        out = []
        for x, y in corners:
            dx, dy = x - cx, y - cy
            out.append((cx + dx * cos_a - dy * sin_a, cy + dx * sin_a + dy * cos_a))
        return out

    if kind == "ellipse":
        cx = float(selection["cx"])
        cy = float(selection["cy"])
        rx = float(selection["rx"])
        ry = float(selection["ry"])
        angle = float(selection.get("angle") or 0.0)
        cos_a, sin_a = math.cos(angle), math.sin(angle)
        n = 64
        out = []
        for i in range(n):
            t = 2 * math.pi * i / n
            x = rx * math.cos(t)
            y = ry * math.sin(t)
            out.append((cx + x * cos_a - y * sin_a, cy + x * sin_a + y * cos_a))
        return out

    return []


def selection_by_id(selections: list[dict], selection_id: str) -> dict | None:
    for sel in selections:
        if str(sel.get("id")) == str(selection_id):
            return sel
    return None


def selection_mask(
    selections: list[dict],
    x_arr: Any,
    y_arr: Any,
    selection_id: str | None = "all",
    *,
    x_scale: str = "linear",
    y_scale: str = "linear",
) -> Any:
    """Boolean mask for points inside ``selection_id`` (all-True for ``\"all\"``/None).

    When a selection carries ``point_indices``, those indices define membership
    exactly (used by neighborhood→selection promote). Otherwise falls back to
    polygon / rectangle / ellipse point-in-path.
    """
    import numpy as np

    x_arr = np.asarray(x_arr, dtype=float)
    y_arr = np.asarray(y_arr, dtype=float)
    n = len(x_arr)
    if selection_id is None or selection_id == "all":
        return np.ones(n, dtype=bool)

    sel = selection_by_id(selections, selection_id)
    if sel is None:
        return np.zeros(n, dtype=bool)

    raw_idx = sel.get("point_indices")
    if raw_idx is not None:
        out = np.zeros(n, dtype=bool)
        idx = np.asarray(raw_idx, dtype=np.int64).ravel()
        if idx.size:
            idx = idx[(idx >= 0) & (idx < n)]
            out[idx] = True
        return out

    verts = selection_display_vertices(sel)
    if len(verts) < 3:
        return np.zeros(n, dtype=bool)

    x_d = np.log10(x_arr) if x_scale == "log" else x_arr
    y_d = np.log10(y_arr) if y_scale == "log" else y_arr
    return points_in_polygon(verts, x_d, y_d)


def points_in_polygon(verts: Any, x: Any, y: Any) -> Any:
    """Boolean mask of points inside the closed polygon ``verts`` (even-odd rule).

    Ports the crossings test matplotlib's ``Path.contains_points`` runs
    (Eric Haines' "crossings multiply", Agg ``point_in_path_impl``) with the
    same float comparisons, so masks match it bit for bit, including points on
    an edge or vertex and self-intersecting lassos. Non-finite points are outside.
    """
    import numpy as np

    v = np.asarray(verts, dtype=float).reshape(-1, 2)
    x = np.asarray(x, dtype=float).ravel()
    y = np.asarray(y, dtype=float).ravel()
    out = np.zeros(x.shape[0], dtype=bool)
    v = v[np.isfinite(v).all(axis=1)]
    if v.shape[0] < 3:
        return out
    vy = v[:, 1]
    # An edge can only flip a point whose y lies in (min(y0, y1), max(y0, y1)]:
    # elsewhere both ``vy >= y`` flags agree. Sort candidates by y once and
    # visit each edge's band only; the comparisons stay exact.
    cand = np.isfinite(x) & np.isfinite(y) & (y <= vy.max()) & (y > vy.min())
    idx = np.flatnonzero(cand)
    if idx.size == 0:
        return out
    idx = idx[np.argsort(y[idx], kind="stable")]
    tx = x[idx]
    ty = y[idx]
    inside = np.zeros(idx.size, dtype=bool)
    x0, y0 = v[-1]
    for x1, y1 in v:
        # Edge (x0, y0) -> (x1, y1); the last vertex closes onto the first.
        if y0 != y1:
            lo, hi = np.searchsorted(ty, [min(y0, y1), max(y0, y1)], side="right")
            if hi > lo:
                bx = tx[lo:hi]
                by = ty[lo:hi]
                yflag1 = y1 >= by
                inside[lo:hi] ^= ((y1 - by) * (x0 - x1) >= (x1 - bx) * (y0 - y1)) == yflag1
        x0, y0 = x1, y1
    out[idx] = inside
    return out
