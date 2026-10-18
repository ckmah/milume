"""Multi-label surface nets as GPU-shaped kernels, run on the CPU with numba (prange).

Same output as ``surface_nets.surface_nets`` but structured the way a WebGPU / CUDA
port would be: no sorting, no hash table.

  1. count  (1 thread per dual cube): distinct non-zero labels of the cube's 8 voxels
     if the cube is mixed -> vertex count (0..8).
  2. scan   exclusive prefix sum -> vertex base per cube.
  3. place  (1 thread per cube): vertex k of the cube = k-th distinct label (sorted);
     position = mean of the midpoints of that label's crossing edges in the cube.
  4. qcount (1 thread per voxel row) + scan: crossing edges x non-zero sides.
  5. emit   (1 thread per voxel row): a quad per crossing edge side; the four
     vertex ids are base[cube] + rank(label in cube) -- found by rescanning 8 voxels.
  6. smooth / normals: scatter-adds over quad edges (atomics on a GPU).
"""
from __future__ import annotations
import numpy as np
import numba as nb
from surface_nets import VoxelMesh

OFF = np.array([[0, 0, 0], [0, 0, 1], [0, 1, 0], [0, 1, 1], [1, 0, 0], [1, 0, 1], [1, 1, 0], [1, 1, 1]], dtype=np.int64)
# The 12 cube edges as pairs of corner indices (corner = 4*dz + 2*dy + dx).
EDGES = np.array([[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]], dtype=np.int64)


@nb.njit(cache=True, inline="always")
def _distinct(lab, z, y, x, buf):
    """Sorted distinct non-zero labels of the cube into buf; returns (n, mixed)."""
    n = 0
    first = lab[z, y, x]
    mixed = False
    for k in range(8):
        v = lab[z + OFF[k, 0], y + OFF[k, 1], x + OFF[k, 2]]
        if v != first:
            mixed = True
        if v == 0:
            continue
        j = 0
        while j < n and buf[j] < v:
            j += 1
        if j < n and buf[j] == v:
            continue
        for q in range(n, j, -1):
            buf[q] = buf[q - 1]
        buf[j] = v
        n += 1
    return n, mixed


@nb.njit(cache=True, parallel=True)
def k_count(lab):
    Z, Y, X = lab.shape
    cnt = np.zeros((Z - 1, Y - 1, X - 1), np.uint8)
    for z in nb.prange(Z - 1):
        buf = np.empty(8, np.int32)
        for y in range(Y - 1):
            for x in range(X - 1):
                n, mixed = _distinct(lab, z, y, x, buf)
                if mixed:
                    cnt[z, y, x] = n
    return cnt


@nb.njit(cache=True, parallel=True)
def k_place(lab, base, cnt, nv):
    Z, Y, X = lab.shape
    P = np.zeros((nv, 3), np.float32)
    VL = np.zeros(nv, np.int32)
    for z in nb.prange(Z - 1):
        buf = np.empty(8, np.int32)
        vals = np.empty(8, np.int32)
        for y in range(Y - 1):
            for x in range(X - 1):
                if cnt[z, y, x] == 0:
                    continue
                n, _ = _distinct(lab, z, y, x, buf)
                for k in range(8):
                    vals[k] = lab[z + OFF[k, 0], y + OFF[k, 1], x + OFF[k, 2]]
                b = base[z, y, x]
                for r in range(n):
                    c = buf[r]
                    sz = 0.0; sy = 0.0; sx = 0.0; m = 0
                    for e in range(12):
                        i = EDGES[e, 0]; j = EDGES[e, 1]
                        if vals[i] != vals[j] and (vals[i] == c or vals[j] == c):
                            sz += z + 0.5 * (OFF[i, 0] + OFF[j, 0])
                            sy += y + 0.5 * (OFF[i, 1] + OFF[j, 1])
                            sx += x + 0.5 * (OFF[i, 2] + OFF[j, 2])
                            m += 1
                    P[b + r, 0] = sz / m; P[b + r, 1] = sy / m; P[b + r, 2] = sx / m
                    VL[b + r] = c
    return P, VL


@nb.njit(cache=True, inline="always")
def _vid(lab, base, z, y, x, c, buf):
    n, _ = _distinct(lab, z, y, x, buf)
    r = 0
    while buf[r] != c:
        r += 1
    return base[z, y, x] + r


@nb.njit(cache=True, parallel=True)
def k_qcount(lab):
    Z, Y, X = lab.shape
    qc = np.zeros(Z, np.int64)
    for z in nb.prange(Z):
        s = 0
        for y in range(Y):
            for x in range(X):
                a = lab[z, y, x]
                for ax in range(3):
                    if ax == 0 and z + 1 >= Z: continue
                    if ax == 1 and y + 1 >= Y: continue
                    if ax == 2 and x + 1 >= X: continue
                    b = lab[z + 1, y, x] if ax == 0 else (lab[z, y + 1, x] if ax == 1 else lab[z, y, x + 1])
                    if a != b:
                        s += (a > 0) + (b > 0)
        qc[z] = s
    return qc


@nb.njit(cache=True, parallel=True)
def k_emit(lab, base, qoff, nq):
    Z, Y, X = lab.shape
    Q = np.empty((nq, 4), np.int32)
    D = np.empty(nq, np.int8)  # 2*axis + (0: normal +axis, 1: -axis)
    for z in nb.prange(Z):
        buf = np.empty(8, np.int32)
        o = qoff[z]
        for y in range(Y):
            for x in range(X):
                a = lab[z, y, x]
                for ax in range(3):
                    if ax == 0 and z + 1 >= Z: continue
                    if ax == 1 and y + 1 >= Y: continue
                    if ax == 2 and x + 1 >= X: continue
                    b = lab[z + 1, y, x] if ax == 0 else (lab[z, y + 1, x] if ax == 1 else lab[z, y, x + 1])
                    if a == b:
                        continue
                    for side in range(2):
                        c = a if side == 0 else b
                        if c == 0:
                            continue
                        for k in range(4):
                            d1 = np.int64(k >= 2)
                            d2 = np.int64(k == 1 or k == 2)
                            cz = np.int64(z); cy = np.int64(y); cx = np.int64(x)
                            if ax == 0:
                                cy -= d1; cx -= d2
                            elif ax == 1:
                                cz -= d1; cx -= d2
                            else:
                                cz -= d1; cy -= d2
                            Q[o, k] = _vid(lab, base, cz, cy, cx, c, buf)
                        D[o] = 2 * ax + side
                        o += 1
    return Q, D


@nb.njit(cache=True)
def k_smooth(P, Q, iters, lam, mu):
    nv = P.shape[0]
    deg = np.zeros(nv, np.float32)
    for q in range(Q.shape[0]):
        for k in range(4):
            deg[Q[q, k]] += 2.0
    acc = np.zeros((nv, 3), np.float32)
    for _ in range(iters):
        for f in (lam, mu):
            acc[:] = 0.0
            for q in range(Q.shape[0]):
                for k in range(4):
                    i = Q[q, k]; j = Q[q, (k + 1) % 4]
                    for d in range(3):
                        acc[i, d] += P[j, d]; acc[j, d] += P[i, d]
            for i in range(nv):
                if deg[i] > 0:
                    for d in range(3):
                        P[i, d] += f * (acc[i, d] / deg[i] - P[i, d])
    return P


@nb.njit(cache=True)
def k_tris_normals(P, Q, D):
    """Quads -> oriented triangles (normal along the quad's out direction) + vertex normals. P is xyz µm."""
    nq = Q.shape[0]
    T = np.empty((2 * nq, 3), np.int32)
    N = np.zeros_like(P)
    for q in range(nq):
        ax = D[q] >> 1
        sgn = 1.0 if (D[q] & 1) == 0 else -1.0
        axx = 2 - ax  # zyx axis -> xyz component
        for h in range(2):
            i0 = Q[q, 0]; i1 = Q[q, 1 + h]; i2 = Q[q, 2 + h]
            ux = P[i1, 0] - P[i0, 0]; uy = P[i1, 1] - P[i0, 1]; uz = P[i1, 2] - P[i0, 2]
            vx = P[i2, 0] - P[i0, 0]; vy = P[i2, 1] - P[i0, 1]; vz = P[i2, 2] - P[i0, 2]
            nx = uy * vz - uz * vy; ny = uz * vx - ux * vz; nz = ux * vy - uy * vx
            comp = nx if axx == 0 else (ny if axx == 1 else nz)
            if comp * sgn < 0:
                i1, i2 = i2, i1; nx = -nx; ny = -ny; nz = -nz
            T[2 * q + h, 0] = i0; T[2 * q + h, 1] = i1; T[2 * q + h, 2] = i2
            for i in (i0, i1, i2):
                N[i, 0] += nx; N[i, 1] += ny; N[i, 2] += nz
    for i in range(P.shape[0]):
        l = np.sqrt(N[i, 0] ** 2 + N[i, 1] ** 2 + N[i, 2] ** 2)
        if l > 0:
            N[i] /= l
    return T, N


@nb.njit(cache=True, parallel=True)
def k_compact(vol, lut):
    Z, Y, X = vol.shape
    out = np.zeros((Z + 2, Y + 2, X + 2), np.int32)
    n = lut.size
    for z in nb.prange(Z):
        for y in range(Y):
            for x in range(X):
                v = vol[z, y, x]
                out[z + 1, y + 1, x + 1] = lut[v] if v < n else 0
    return out


def compact(vol, keep_labels):
    """Wanted labels -> 1..k (others background), padded by one voxel. A LUT gather (1 thread per voxel on a GPU)."""
    keep = np.sort(np.asarray(keep_labels, dtype=np.int64))
    lut = np.zeros(int(keep.max()) + 1, np.int32)
    lut[keep] = np.arange(1, len(keep) + 1, dtype=np.int32)
    return k_compact(np.ascontiguousarray(vol), lut), np.concatenate([[0], keep])


def surface_nets_nb(vol, scale_zyx, trans_zyx, keep_labels, smooth_iters=2, lam=0.5, mu=-0.53, timings=None) -> VoxelMesh:
    import time
    tm = timings if timings is not None else {}
    t = time.perf_counter(); lab, uniq = compact(vol, keep_labels); tm["compact"] = time.perf_counter() - t
    t = time.perf_counter()
    cnt = k_count(lab)
    base = np.zeros(cnt.size, np.int32); np.cumsum(cnt.ravel()[:-1], out=base[1:]); nv = int(base[-1] + cnt.ravel()[-1])
    base = base.reshape(cnt.shape)
    P, VL = k_place(lab, base, cnt, nv)
    qc = k_qcount(lab); qoff = np.concatenate([[0], np.cumsum(qc)[:-1]]); nq = int(qc.sum())
    Q, D = k_emit(lab, base, qoff, nq)
    tm["extract"] = time.perf_counter() - t
    t = time.perf_counter()
    if smooth_iters:
        P = k_smooth(P, Q, smooth_iters, lam, mu)
    s = np.asarray(scale_zyx, np.float32)
    Pxyz = np.ascontiguousarray(((P - 0.5) * s + np.asarray(trans_zyx, np.float32))[:, ::-1])
    T, N = k_tris_normals(Pxyz, Q, D)
    order = np.argsort(VL[T[:, 0]], kind="stable")
    tm["smooth_normals"] = time.perf_counter() - t
    return VoxelMesh(Pxyz, N, T[order].ravel().astype(np.uint32), VL, uniq)
