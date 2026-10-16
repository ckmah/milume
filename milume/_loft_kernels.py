"""Numba loft kernels vendored from ckmah/polyrender ``polyrender/_mesh_build.py`` (49f6feb).

Copied rather than imported: polyrender pulls in trimesh and its GLB/tile stack,
which milume does not need. Only the ring resampling, ring alignment, Taubin
smoothing and normal kernels are kept, unchanged.
"""

from __future__ import annotations

import numpy as np
from numba import njit


@njit(cache=True, fastmath=True, nogil=True)
def arc_resample_nb(ring, n_points):
    n = ring.shape[0]
    if n > 1:
        dx = ring[n - 1, 0] - ring[0, 0]; dy = ring[n - 1, 1] - ring[0, 1]
        if dx * dx + dy * dy < 1e-20:
            n -= 1
    out = np.empty((n_points, 2), dtype=np.float64)
    cum = np.empty(n + 1, dtype=np.float64)
    cum[0] = 0.0
    for i in range(n):
        j = (i + 1) % n
        dx = ring[j, 0] - ring[i, 0]
        dy = ring[j, 1] - ring[i, 1]
        cum[i + 1] = cum[i] + (dx * dx + dy * dy) ** 0.5
    total = cum[n]
    if total < 1e-15:
        for i in range(n_points):
            out[i, 0] = ring[0, 0]; out[i, 1] = ring[0, 1]
        return out
    step = total / n_points
    seg = 0
    for i in range(n_points):
        t = i * step
        while seg < n - 1 and cum[seg + 1] <= t:
            seg += 1
        span = cum[seg + 1] - cum[seg]
        frac = (t - cum[seg]) / span if span > 1e-15 else 0.0
        k = (seg + 1) % n
        out[i, 0] = ring[seg, 0] + frac * (ring[k, 0] - ring[seg, 0])
        out[i, 1] = ring[seg, 1] + frac * (ring[k, 1] - ring[seg, 1])
    return out


@njit(cache=True, fastmath=True, nogil=True)
def curvature_resample_nb(ring, n_target, base):
    n = ring.shape[0]
    edge_w = np.empty(n, dtype=np.float64)
    for i in range(n):
        prv_i = (i - 1) % n
        nxt_i = (i + 1) % n
        nxt2_i = (i + 2) % n
        vp0 = ring[i, 0] - ring[prv_i, 0]; vp1 = ring[i, 1] - ring[prv_i, 1]
        vn0 = ring[nxt_i, 0] - ring[i, 0]; vn1 = ring[nxt_i, 1] - ring[i, 1]
        lp = (vp0*vp0 + vp1*vp1)**0.5 + 1e-12
        ln = (vn0*vn0 + vn1*vn1)**0.5 + 1e-12
        d = (vp0*vn0 + vp1*vn1) / (lp * ln)
        if d < -1.0: d = -1.0
        if d > 1.0: d = 1.0
        vp3_0 = ring[nxt_i, 0] - ring[i, 0]; vp3_1 = ring[nxt_i, 1] - ring[i, 1]
        vn3_0 = ring[nxt2_i, 0] - ring[nxt_i, 0]; vn3_1 = ring[nxt2_i, 1] - ring[nxt_i, 1]
        lp3 = (vp3_0*vp3_0 + vp3_1*vp3_1)**0.5 + 1e-12
        ln3 = (vn3_0*vn3_0 + vn3_1*vn3_1)**0.5 + 1e-12
        d3 = (vp3_0*vn3_0 + vp3_1*vn3_1) / (lp3 * ln3)
        if d3 < -1.0: d3 = -1.0
        if d3 > 1.0: d3 = 1.0
        ep_d = (1.0 - d) + base * 3.141592653589793
        ep_d2 = (1.0 - d3) + base * 3.141592653589793
        ln2 = ((ring[nxt_i, 0] - ring[i, 0])**2 + (ring[nxt_i, 1] - ring[i, 1])**2)**0.5 + 1e-12
        edge_w[i] = ln2 * 0.5 * (ep_d + ep_d2)
    total = 0.0
    for w in edge_w:
        total += w
    out = np.empty((n_target, 2), dtype=np.float64)
    if total < 1e-12:
        for i in range(n_target):
            out[i, 0] = ring[0, 0]; out[i, 1] = ring[0, 1]
        return out
    cum = np.empty(n + 1, dtype=np.float64)
    cum[0] = 0.0
    for i in range(n):
        cum[i + 1] = cum[i] + edge_w[i]
    step = total / n_target
    seg = 0
    for i in range(n_target):
        t = i * step
        while seg < n - 1 and cum[seg + 1] <= t:
            seg += 1
        span = cum[seg + 1] - cum[seg]
        frac = (t - cum[seg]) / span if span > 1e-15 else 0.0
        k = (seg + 1) % n
        out[i, 0] = ring[seg, 0] + frac * (ring[k, 0] - ring[seg, 0])
        out[i, 1] = ring[seg, 1] + frac * (ring[k, 1] - ring[seg, 1])
    return out


@njit(cache=True, fastmath=True, nogil=True)
def best_shift_nb(prev, curr):
    n = prev.shape[0]
    best_cost = 1e200
    best_k = 0
    for k in range(n):
        cost = 0.0
        for i in range(n):
            src = (i + k) % n
            dx = curr[src, 0] - prev[i, 0]
            dy = curr[src, 1] - prev[i, 1]
            cost += dx * dx + dy * dy
        if cost < best_cost:
            best_cost = cost
            best_k = k
    return best_k


@njit(cache=True, fastmath=True, nogil=True)
def taubin_step_nb(verts, faces, safe_cnt, lam):
    nv = verts.shape[0]
    sums = np.zeros((nv, 3), dtype=np.float64)
    for fi in range(faces.shape[0]):
        a = faces[fi, 0]; b = faces[fi, 1]; c = faces[fi, 2]
        for col in range(3):
            sums[a, col] += verts[b, col] + verts[c, col]
            sums[b, col] += verts[a, col] + verts[c, col]
            sums[c, col] += verts[a, col] + verts[b, col]
    for vi in range(nv):
        sc = safe_cnt[vi]
        for col in range(3):
            verts[vi, col] += lam * (sums[vi, col] / sc - verts[vi, col])


@njit(cache=True, fastmath=True, nogil=True)
def post_smooth_nb(side_xy, side_ref):
    """Restore per-slice centroid and mean radius from the pre-smooth rings, in place."""
    eps = 1e-12
    n_slices = side_xy.shape[0]
    n_ring = side_xy.shape[1]
    for s in range(n_slices):
        cx_ref = 0.0; cy_ref = 0.0; cx_cur = 0.0; cy_cur = 0.0
        for i in range(n_ring):
            cx_ref += side_ref[s, i, 0]; cy_ref += side_ref[s, i, 1]
            cx_cur += side_xy[s, i, 0]; cy_cur += side_xy[s, i, 1]
        cx_ref /= n_ring; cy_ref /= n_ring; cx_cur /= n_ring; cy_cur /= n_ring
        r_ref = 0.0; r_cur = 0.0
        for i in range(n_ring):
            dx = side_ref[s, i, 0] - cx_ref; dy = side_ref[s, i, 1] - cy_ref
            r_ref += (dx * dx + dy * dy) ** 0.5
            dx = side_xy[s, i, 0] - cx_cur; dy = side_xy[s, i, 1] - cy_cur
            r_cur += (dx * dx + dy * dy) ** 0.5
        r_ref /= n_ring; r_cur /= n_ring
        scale = r_ref / r_cur if (r_ref > eps and r_cur > eps) else 1.0
        for i in range(n_ring):
            dx = side_xy[s, i, 0] - cx_cur; dy = side_xy[s, i, 1] - cy_cur
            side_xy[s, i, 0] = cx_ref + scale * dx
            side_xy[s, i, 1] = cy_ref + scale * dy


@njit(cache=True, fastmath=True, nogil=True)
def vertex_normals_nb(pos, faces):
    nv = pos.shape[0]
    normals = np.zeros((nv, 3), dtype=np.float64)
    for fi in range(faces.shape[0]):
        a_i = faces[fi, 0]; b_i = faces[fi, 1]; c_i = faces[fi, 2]
        e1x = pos[b_i, 0] - pos[a_i, 0]; e1y = pos[b_i, 1] - pos[a_i, 1]; e1z = pos[b_i, 2] - pos[a_i, 2]
        e2x = pos[c_i, 0] - pos[a_i, 0]; e2y = pos[c_i, 1] - pos[a_i, 1]; e2z = pos[c_i, 2] - pos[a_i, 2]
        nx = e1y * e2z - e1z * e2y
        ny = e1z * e2x - e1x * e2z
        nz = e1x * e2y - e1y * e2x
        for v in (a_i, b_i, c_i):
            normals[v, 0] += nx; normals[v, 1] += ny; normals[v, 2] += nz
    out = np.empty((nv, 3), dtype=np.float32)
    for i in range(nv):
        s = normals[i, 0] ** 2 + normals[i, 1] ** 2 + normals[i, 2] ** 2
        inv = 1.0 / s ** 0.5 if s > 1e-24 else 0.0
        out[i, 0] = normals[i, 0] * inv; out[i, 1] = normals[i, 1] * inv; out[i, 2] = normals[i, 2] * inv
    return out
