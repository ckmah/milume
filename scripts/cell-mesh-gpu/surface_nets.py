"""Multi-label surface nets on the cell label volume, fully data-parallel.

Array-API style: every step is an elementwise op, a compaction (nonzero), a sort/unique
or a scatter-add (bincount). ``xp`` is numpy here; the same code runs on CuPy
(``xp=cupy``) unchanged apart from the module, and each step maps 1:1 to a GPU
compute pass (classify edges -> compact -> key/sort -> segmented mean -> smooth).

Grid: voxel (z, y, x) centre at ((i + 0.5) * scale + translation) µm (spatialdata
pixel convention). The volume is padded with background so every surface closes.
For every voxel edge whose two labels differ, each non-zero side label ``c`` gets
one quad joining the four dual cubes around that edge (normal pointing out of ``c``).
A dual vertex is keyed by (cube, c); its position is the mean of the midpoints of
the crossing edges of ``c`` in that cube (classic naive surface nets, per label).
Optional Taubin smoothing runs on all cells at once (vertex keys never cross labels).
"""
from __future__ import annotations
from dataclasses import dataclass
import numpy as np


@dataclass
class VoxelMesh:
    positions: np.ndarray   # (n, 3) float32 µm, xyz
    normals: np.ndarray     # (n, 3) float32
    indices: np.ndarray     # (m,) uint32, global
    vert_label: np.ndarray  # (n,) int32 compact label index (1..)
    labels: np.ndarray      # (k+1,) original label id per compact index (0 = background)

    @property
    def n_triangles(self) -> int:
        return int(self.indices.size // 3)


def _bincount3(idx, w, n, xp):
    return xp.stack([xp.bincount(idx, weights=w[:, k], minlength=n) for k in range(3)], axis=1)


def surface_nets(vol, scale_zyx, trans_zyx, keep_labels=None, smooth_iters: int = 2, lam: float = 0.5, mu: float = -0.53, xp=np) -> VoxelMesh:
    vol = xp.asarray(vol)
    # Compact labels (only the wanted ones; others become background).
    if keep_labels is None:
        uniq, inv = xp.unique(vol, return_inverse=True)
        lab = inv.reshape(vol.shape).astype(xp.int32)
        if int(uniq[0]) != 0:
            uniq = xp.concatenate([xp.zeros(1, uniq.dtype), uniq]); lab += 1
    else:
        keep = xp.asarray(np.sort(np.asarray(keep_labels, dtype=np.int64)))
        uniq = xp.concatenate([xp.zeros(1, keep.dtype), keep])
        pos = xp.searchsorted(keep, vol.astype(xp.int64))
        pos_c = xp.minimum(pos, len(keep) - 1)
        lab = xp.where(keep[pos_c] == vol, pos_c + 1, 0).astype(xp.int32)
    lab = xp.pad(lab, 1)
    Z, Y, X = lab.shape
    nl = int(uniq.size)
    CZ, CY, CX = Z - 1, Y - 1, X - 1  # dual cubes, by lower-corner voxel

    keys, quads_c, dirs, mids = [], [], [], []
    for ax in range(3):
        sl_a = [slice(None)] * 3; sl_b = [slice(None)] * 3
        sl_a[ax] = slice(0, -1); sl_b[ax] = slice(1, None)
        a = lab[tuple(sl_a)]; b = lab[tuple(sl_b)]
        hit = xp.nonzero(a != b)
        if hit[0].size == 0:
            continue
        la = a[hit]; lb = b[hit]
        z, y, x = (h.astype(xp.int64) for h in hit)  # edge from voxel (z,y,x) to +1 on ax
        mid = xp.stack([z, y, x], axis=1).astype(xp.float32); mid[:, ax] += 0.5
        # The four cubes around the edge: offsets 0/-1 on the two other axes.
        o1, o2 = [k for k in range(3) if k != ax]
        cubes = []
        for d1, d2 in ((0, 0), (0, 1), (1, 1), (1, 0)):  # cyclic order around the edge
            c = [z, y, x]; c[o1] = c[o1] - d1; c[o2] = c[o2] - d2
            cubes.append((c[0] * CY + c[1]) * CX + c[2])
        cubes = xp.stack(cubes, axis=1)  # (e, 4)
        for side, sign in ((la, 1.0), (lb, -1.0)):
            m = side > 0
            if not bool(m.any()):
                continue
            cc = side[m].astype(xp.int64)
            keys.append(cubes[m] * nl + cc[:, None])
            quads_c.append(cc)
            d = xp.zeros((int(m.sum()), 3), xp.float32); d[:, ax] = sign
            dirs.append(d); mids.append(mid[m])
    keys = xp.concatenate(keys); quads_c = xp.concatenate(quads_c); dirs = xp.concatenate(dirs); mids = xp.concatenate(mids)
    # Unique dual vertices; position = mean of incident crossing-edge midpoints.
    uk, vid = xp.unique(keys.ravel(), return_inverse=True)
    vid = vid.reshape(-1, 4)
    nv = int(uk.size)
    cnt = xp.bincount(vid.ravel(), minlength=nv).astype(xp.float32)
    acc = _bincount3(vid.ravel(), xp.repeat(mids, 4, axis=0), nv, xp)
    P = (acc / cnt[:, None]).astype(xp.float32)  # voxel units (padded grid), zyx
    vlab = (uk % nl).astype(xp.int32)
    # Triangles, oriented so the normal points out of the cell (along +dir).
    t = xp.concatenate([vid[:, [0, 1, 2]], vid[:, [0, 2, 3]]])
    tdir = xp.concatenate([dirs, dirs])
    sz = xp.asarray(scale_zyx, dtype=xp.float32)
    def face_n(Pm):
        return xp.cross(Pm[t[:, 1]] - Pm[t[:, 0]], Pm[t[:, 2]] - Pm[t[:, 0]])
    fn = face_n(P * sz)
    flip = (fn * tdir).sum(1) < 0
    t[flip] = t[flip][:, [0, 2, 1]]
    # Taubin smoothing over the quad graph (all cells at once).
    if smooth_iters:
        e = xp.concatenate([vid[:, [0, 1]], vid[:, [1, 2]], vid[:, [2, 3]], vid[:, [3, 0]]])
        e = xp.concatenate([e, e[:, ::-1]])
        deg = xp.bincount(e[:, 0], minlength=nv).astype(xp.float32)
        deg = xp.maximum(deg, 1)
        for _ in range(smooth_iters):
            for f in (lam, mu):
                nb = _bincount3(e[:, 0], P[e[:, 1]], nv, xp) / deg[:, None]
                P = (P + f * (nb - P)).astype(xp.float32)
    # µm, xyz. Padded index i -> voxel i - 1 -> centre (i - 1 + 0.5) * s + t.
    Pum = (P - 0.5) * sz + xp.asarray(trans_zyx, dtype=xp.float32)
    Pxyz = Pum[:, ::-1].copy()
    # Area-weighted vertex normals (in xyz).
    fn = xp.cross(Pxyz[t[:, 1]] - Pxyz[t[:, 0]], Pxyz[t[:, 2]] - Pxyz[t[:, 0]])
    N = _bincount3(t.ravel(), xp.repeat(fn, 3, axis=0), nv, xp)
    N = (N / xp.maximum(xp.linalg.norm(N, axis=1, keepdims=True), 1e-12)).astype(xp.float32)
    # Keep triangles grouped by cell (sort by label) for per-cell slicing / packing.
    order = xp.argsort(vlab[t[:, 0]], kind="stable")
    t = t[order]
    return VoxelMesh(Pxyz.astype(xp.float32), N, t.ravel().astype(xp.uint32), vlab, uniq)


def per_cell(m: VoxelMesh):
    """Split into {label_id: (positions, normals, local indices)}."""
    t = m.indices.reshape(-1, 3).astype(np.int64)
    tl = m.vert_label[t[:, 0]]
    out = {}
    bounds = np.searchsorted(tl, np.arange(1, len(m.labels) + 1))
    for c in range(1, len(m.labels)):
        tt = t[bounds[c - 1]:bounds[c]]
        if not len(tt):
            continue
        u, inv = np.unique(tt.ravel(), return_inverse=True)
        out[int(m.labels[c])] = (m.positions[u], m.normals[u], inv.astype(np.uint32))
    return out


def packed_bytes(m: VoxelMesh) -> int:
    """Bytes in the MLMESH01 layout (pos f32x3 + nrm i8x3 + cell u16 per vertex, u32 indices)."""
    nv = len(m.positions)
    return nv * 12 + nv * 3 + nv * 2 + m.indices.size * 4 + (len(m.labels) - 1) * 4
