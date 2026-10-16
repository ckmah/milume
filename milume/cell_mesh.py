"""Lit cell meshes for the Inspect cube (prototype, branch ``proto-cell-mesh``).

Lofts each cell's stacked 2D segmentation polygons into a triangle surface,
following ckmah/polyrender's loft (curvature resample -> ring alignment ->
quad strips -> Taubin smoothing -> normals; kernels in ``_loft_kernels``), and
adds what polyrender skips:

* **Split cells.** Every polygon piece is kept. Pieces are matched across
  neighbouring slices by overlap; one-to-one pairs loft into a tube ("chain"),
  and where the piece count changes (a split or merge seam) each piece is
  capped and no side wall is drawn. A one-to-one pair whose shapes barely
  overlap (IoU below ``min_iou``) is also a seam (stand-in for the brief's
  marching-cubes fallback). A piece on one slice only becomes a slab one
  slice step thick.
* **Holes.** Interior rings are matched across a chain's slices the same way
  and lofted as inward-facing tubes. A hole reaching a chain end opens the
  cap (earcut with holes); a hole that starts or stops inside a chain gets a
  flat disc. A hole on a single slice is sealed inside the solid and dropped.

``window_mesh_bytes`` packs the cells under one Inspect window into one binary
buffer for the volume comm (format in ``pack_mesh``).
"""

from __future__ import annotations

import json
import struct
from collections.abc import Iterable
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field

import mapbox_earcut as earcut
import numpy as np
import shapely

from . import _loft_kernels as K

MAGIC = b"MLMESH01"


@dataclass
class MeshParams:
    z_step_um: float = 0.5
    #: Keep every ``stride``-th z slice (plus the last); 1 keeps all.
    stride: int = 2
    #: Target ring edge length (µm); ring vertex count is perimeter / this, clipped.
    seg_um: float = 1.0
    ring_min: int = 12
    ring_max: int = 40
    hole_ring_min: int = 8
    hole_ring_max: int = 24
    smooth_iters: int = 1
    smooth_factor: float = 0.5
    curvature_base: float = 0.28
    #: Pieces and holes smaller than this (µm²) are dropped (segmentation specks).
    min_area_um2: float = 0.5
    #: Two pieces on neighbouring slices match when they overlap by this share of the smaller.
    overlap_frac: float = 0.1
    #: A one-to-one match below this IoU is treated as a seam (abrupt change).
    min_iou: float = 0.2
    #: Extend each chain half a (strided) slice step past its end slices, so a
    #: chain covers its slices' full thickness and split seams meet without a gap.
    extend_ends: bool = True
    #: polyrender's original rule, for comparison: largest piece only, no holes, no end extension.
    polyrender_rule: bool = False


@dataclass
class CellStats:
    pieces: int = 0
    chains: int = 0
    slabs: int = 0
    seams: int = 0
    abrupt: int = 0
    hole_tubes: int = 0
    holes_dropped: int = 0


@dataclass
class CellMesh:
    positions: np.ndarray  # (n, 3) float32, µm
    normals: np.ndarray  # (n, 3) float32
    indices: np.ndarray  # (m,) uint32, local
    stats: CellStats = field(default_factory=CellStats)
    bbox: tuple[float, float, float, float] = (0.0, 0.0, 0.0, 0.0)  # x0, y0, x1, y1

    @property
    def n_triangles(self) -> int:
        return int(self.indices.size // 3)


def _ring_xy(coords: np.ndarray, ccw: bool) -> np.ndarray:
    pts = np.asarray(coords, dtype=np.float64)[:, :2]
    if len(pts) > 1 and np.allclose(pts[0], pts[-1]):
        pts = pts[:-1]
    a2 = float(np.dot(pts[:, 0], np.roll(pts[:, 1], -1)) - np.dot(np.roll(pts[:, 0], -1), pts[:, 1]))
    if (a2 > 0) != ccw:
        pts = pts[::-1]
    return np.ascontiguousarray(pts)


def _resample(ring: np.ndarray, n: int, base: float) -> np.ndarray:
    if len(ring) >= n and len(ring) >= 4:
        return K.curvature_resample_nb(ring, n, base)
    return K.arc_resample_nb(ring, n)


def _ring_count(perimeter: float, p: MeshParams, lo: int, hi: int) -> int:
    return int(np.clip(round(perimeter / p.seg_um), lo, hi))


def _match(a: list, b: list, p: MeshParams) -> tuple[list[tuple[int, int, float]], np.ndarray, np.ndarray]:
    """Overlap edges between polygon lists ``a`` and ``b`` as (i, j, iou), plus degrees."""
    out_deg = np.zeros(len(a), dtype=np.int64)
    in_deg = np.zeros(len(b), dtype=np.int64)
    edges: list[tuple[int, int, float]] = []
    if not a or not b:
        return edges, out_deg, in_deg
    A = np.asarray(a, dtype=object)
    B = np.asarray(b, dtype=object)
    ia, ib = np.meshgrid(np.arange(len(a)), np.arange(len(b)), indexing="ij")
    ia = ia.ravel(); ib = ib.ravel()
    hit = shapely.intersects(A[ia], B[ib])
    ia = ia[hit]; ib = ib[hit]
    if ia.size == 0:
        return edges, out_deg, in_deg
    inter = shapely.area(shapely.intersection(A[ia], B[ib]))
    aa = shapely.area(A[ia]); ab = shapely.area(B[ib])
    keep = inter > p.overlap_frac * np.minimum(aa, ab)
    for i, j, x, s, t in zip(ia[keep], ib[keep], inter[keep], aa[keep], ab[keep]):
        edges.append((int(i), int(j), float(x / (s + t - x))))
        out_deg[i] += 1
        in_deg[j] += 1
    return edges, out_deg, in_deg


def _chains(slices: list[list], p: MeshParams, stats: CellStats) -> list[list[tuple[int, int]]]:
    """Link (slice, piece) nodes by one-to-one overlap matches; return the chains."""
    nxt: dict[tuple[int, int], tuple[int, int]] = {}
    has_prev: set[tuple[int, int]] = set()
    for s in range(len(slices) - 1):
        edges, od, idg = _match(slices[s], slices[s + 1], p)
        if len(slices[s]) != len(slices[s + 1]) or any(od > 1) or any(idg > 1):
            stats.seams += 1
        for i, j, iou in edges:
            if od[i] == 1 and idg[j] == 1:
                if iou < p.min_iou:
                    stats.abrupt += 1
                    continue
                nxt[(s, i)] = (s + 1, j)
                has_prev.add((s + 1, j))
    chains = []
    for s, pieces in enumerate(slices):
        for i in range(len(pieces)):
            node = (s, i)
            if node in has_prev:
                continue
            chain = [node]
            while chain[-1] in nxt:
                chain.append(nxt[chain[-1]])
            chains.append(chain)
    return chains


class _Builder:
    def __init__(self) -> None:
        self.pos: list[np.ndarray] = []
        self.nrm: list[np.ndarray] = []
        self.idx: list[np.ndarray] = []
        self.n = 0

    def add(self, pos: np.ndarray, tris: np.ndarray, nrm: np.ndarray | None = None) -> None:
        pos = np.asarray(pos, dtype=np.float32)
        if nrm is None:
            nrm = K.vertex_normals_nb(pos, tris.reshape(-1, 3).astype(np.int64))
        self.pos.append(pos)
        self.nrm.append(np.asarray(nrm, dtype=np.float32))
        self.idx.append(tris.reshape(-1).astype(np.int64) + self.n)
        self.n += len(pos)

    def cap(self, rings: list[np.ndarray], z: float, up: bool) -> None:
        """Flat cap: first ring the outline (CCW), the rest holes; normal +z when ``up``."""
        verts = np.concatenate(rings).astype(np.float64)
        ends = np.cumsum([len(r) for r in rings]).astype(np.uint32)
        tris = np.asarray(earcut.triangulate_float64(verts, ends), dtype=np.int64).reshape(-1, 3)
        if tris.size == 0:
            return
        v0, v1, v2 = verts[tris[:, 0]], verts[tris[:, 1]], verts[tris[:, 2]]
        cz = (v1[:, 0] - v0[:, 0]) * (v2[:, 1] - v0[:, 1]) - (v1[:, 1] - v0[:, 1]) * (v2[:, 0] - v0[:, 0])
        flip = cz < 0 if up else cz > 0
        tris[flip] = tris[flip][:, [0, 2, 1]]
        pos = np.column_stack([verts, np.full(len(verts), z)])
        nrm = np.zeros((len(verts), 3), dtype=np.float32)
        nrm[:, 2] = 1.0 if up else -1.0
        self.add(pos, tris, nrm)

    def tube(self, stack: np.ndarray, zs: np.ndarray, p: MeshParams) -> np.ndarray:
        """Side wall through ``stack`` (S, n, 2); CCW rings face out, CW rings face in.

        Returns the (possibly smoothed) stack so caps share its end rings.
        """
        s_total, n = stack.shape[:2]
        qi = np.arange(n)
        qj = (qi + 1) % n
        quad = np.stack([qi, qj, n + qj, qi, n + qj, n + qi], axis=1).reshape(1, -1)
        tris = (quad + (np.arange(s_total - 1) * n)[:, None]).reshape(-1, 3)
        pos = np.empty((s_total * n, 3), dtype=np.float64)
        pos[:, :2] = stack.reshape(-1, 2)
        pos[:, 2] = np.repeat(zs, n)
        if p.smooth_iters > 0 and s_total >= 3:
            lam = float(np.clip(0.2 + 0.45 * p.smooth_factor, 0.2, 0.65))
            mu = 1.0 / (0.1 - 1.0 / lam)
            cnt = np.maximum(np.bincount(tris.ravel(), minlength=len(pos)).astype(np.float64) * 2, 1.0)
            for _ in range(p.smooth_iters):
                K.taubin_step_nb(pos, tris, cnt, lam)
                K.taubin_step_nb(pos, tris, cnt, mu)
            side = np.ascontiguousarray(pos[:, :2].reshape(s_total, n, 2))
            K.post_smooth_nb(side, np.ascontiguousarray(stack))
            pos[:, :2] = side.reshape(-1, 2)
            pos[:, 2] = np.repeat(zs, n)
            stack = side
        self.add(pos, tris)
        return stack

    def build(self, stats: CellStats) -> CellMesh:
        if not self.pos:
            z3 = np.zeros((0, 3), dtype=np.float32)
            return CellMesh(z3, z3.copy(), np.zeros(0, dtype=np.uint32), stats)
        pos = np.concatenate(self.pos)
        return CellMesh(
            pos,
            np.concatenate(self.nrm),
            np.concatenate(self.idx).astype(np.uint32),
            stats,
            (float(pos[:, 0].min()), float(pos[:, 1].min()), float(pos[:, 0].max()), float(pos[:, 1].max())),
        )


def _stack(rings: list[np.ndarray], n: int, p: MeshParams) -> np.ndarray:
    st = np.empty((len(rings), n, 2), dtype=np.float64)
    for s, r in enumerate(rings):
        st[s] = _resample(r, n, p.curvature_base)
        if s:
            k = int(K.best_shift_nb(st[s - 1], st[s]))
            if k:
                st[s] = np.roll(st[s], -k, axis=0)
    return st


def _loft_chain(polys: list, zs: np.ndarray, p: MeshParams, out: _Builder, stats: CellStats) -> None:
    k = len(polys)
    ext = [_ring_xy(shapely.get_coordinates(q.exterior), ccw=True) for q in polys]
    n = _ring_count(max(q.exterior.length for q in polys), p, p.ring_min, p.ring_max)
    stack = out.tube(_stack(ext, n, p), zs, p)

    # Holes: per-slice interior rings, matched along the chain like pieces.
    hole_polys = [
        [h for h in (shapely.Polygon(r) for r in q.interiors) if h.area >= p.min_area_um2] for q in polys
    ]
    open_bottom: list[np.ndarray] = []
    open_top: list[np.ndarray] = []
    if any(hole_polys):
        hs = CellStats()
        for chain in _chains(hole_polys, p, hs):
            if len(chain) < 2:
                stats.holes_dropped += 1
                continue
            stats.hole_tubes += 1
            rings = [_ring_xy(shapely.get_coordinates(hole_polys[s][i].exterior), ccw=False) for s, i in chain]
            hn = _ring_count(max(hole_polys[s][i].length for s, i in chain), p, p.hole_ring_min, p.hole_ring_max)
            s0, s1 = chain[0][0], chain[-1][0]
            hstack = out.tube(_stack(rings, hn, p), zs[s0 : s1 + 1], p)
            if s0 == 0:
                open_bottom.append(hstack[0][::-1])
            else:
                out.cap([hstack[0][::-1]], float(zs[s0]), up=True)
            if s1 == k - 1:
                open_top.append(hstack[-1][::-1])
            else:
                out.cap([hstack[-1][::-1]], float(zs[s1]), up=False)
    # Earcut wants holes opposite to the outline: outline CCW, holes CW.
    out.cap([stack[0]] + [h[::-1] for h in open_bottom], float(zs[0]), up=False)
    out.cap([stack[-1]] + [h[::-1] for h in open_top], float(zs[-1]), up=True)


def mesh_cell(slices: Iterable[tuple[float, object]], p: MeshParams | None = None) -> CellMesh:
    """Mesh one cell from ``(z_um, (Multi)Polygon)`` slices (µm, any order)."""
    p = p or MeshParams()
    stats = CellStats()
    rows = sorted(slices, key=lambda t: t[0])
    if p.stride > 1 and len(rows) > 2:
        keep = list(range(0, len(rows), p.stride))
        if keep[-1] != len(rows) - 1:
            keep.append(len(rows) - 1)
        rows = [rows[i] for i in keep]
    zs = np.array([r[0] for r in rows], dtype=np.float64)
    pieces = []
    for _, g in rows:
        parts = [q for q in shapely.get_parts(g) if isinstance(q, shapely.Polygon) and q.area >= p.min_area_um2]
        if p.polyrender_rule and parts:
            parts = [shapely.Polygon(max(parts, key=lambda q: q.area).exterior)]
        pieces.append(parts)
    stats.pieces = sum(len(x) for x in pieces)
    out = _Builder()
    half = p.z_step_um * p.stride / 2
    for chain in _chains(pieces, p, stats):
        stats.chains += 1
        polys = [pieces[s][i] for s, i in chain]
        if len(chain) == 1:
            stats.slabs += 1
            z = zs[chain[0][0]]
            _loft_chain(polys * 2, np.array([z - half, z + half]), p, out, stats)
        elif p.extend_ends and not p.polyrender_rule:
            cz = zs[[s for s, _ in chain]]
            _loft_chain([polys[0], *polys, polys[-1]], np.concatenate([[cz[0] - half], cz, [cz[-1] + half]]), p, out, stats)
        else:
            _loft_chain(polys, zs[[s for s, _ in chain]], p, out, stats)
    return out.build(stats)


class CellMeshCache:
    """Per-cell meshes for one shapes table, built on demand and kept; windows are assembled from them."""

    def __init__(self, cell_ids: np.ndarray, z_um: np.ndarray, geoms: np.ndarray, label_ids: dict, p: MeshParams | None = None):
        self.p = p or MeshParams()
        order = np.argsort(cell_ids, kind="stable")
        cid = np.asarray(cell_ids)[order]
        self._z = np.asarray(z_um, dtype=np.float64)[order]
        self._g = np.asarray(geoms, dtype=object)[order]
        bounds = shapely.bounds(self._g)
        uniq, start = np.unique(cid, return_index=True)
        end = np.append(start[1:], len(cid))
        self.cells = [c for c in uniq]
        self._span = {c: (int(a), int(b)) for c, a, b in zip(uniq, start, end)}
        self.label = {c: int(label_ids[c]) for c in uniq}
        self.bbox = {
            c: (bounds[a:b, 0].min(), bounds[a:b, 1].min(), bounds[a:b, 2].max(), bounds[a:b, 3].max())
            for c, a, b in zip(uniq, start, end)
        }
        self._mesh: dict = {}
        self._windows: dict = {}

    def mesh(self, c) -> CellMesh:
        m = self._mesh.get(c)
        if m is None:
            a, b = self._span[c]
            m = mesh_cell(zip(self._z[a:b], self._g[a:b]), self.p)
            self._mesh[c] = m
        return m

    def cells_in(self, x0: float, y0: float, x1: float, y1: float) -> list:
        """Cells whose centre lies inside the window (whole cells, like the 2D map)."""
        out = []
        for c in self.cells:
            bx0, by0, bx1, by1 = self.bbox[c]
            cx, cy = (bx0 + bx1) / 2, (by0 + by1) / 2
            if x0 <= cx <= x1 and y0 <= cy <= y1:
                out.append(c)
        return out

    def build(self, cells: list, workers: int = 8) -> list[CellMesh]:
        todo = [c for c in cells if c not in self._mesh]
        if todo:
            with ThreadPoolExecutor(max_workers=workers) as ex:
                for c, m in zip(todo, ex.map(lambda c: mesh_cell(zip(*[a[self._span[c][0]:self._span[c][1]] for a in (self._z, self._g)]), self.p), todo)):
                    self._mesh[c] = m
        return [self._mesh[c] for c in cells]

    def window_bytes(self, x0: float, y0: float, x1: float, y1: float) -> bytes:
        key = (round(x0, 2), round(y0, 2), round(x1, 2), round(y1, 2))
        hit = self._windows.get(key)
        if hit is None:
            cells = self.cells_in(x0, y0, x1, y1)
            meshes = self.build(cells)
            hit = pack_mesh(meshes, [self.label[c] for c in cells], origin=(x0, y0, 0.0))
            self._windows[key] = hit
        return hit


def pack_mesh(meshes: list[CellMesh], label_ids: list[int], origin: tuple[float, float, float]) -> bytes:
    """One binary buffer for a window.

    Layout: ``MLMESH01``, uint32 header length, UTF-8 JSON header, then 4-byte
    aligned sections at the header's byte offsets: positions float32 (n, 3) in µm
    relative to ``origin``; normals int8 (n, 3) scaled by 127; cell uint16 (n,)
    local cell index; indices uint32 (m,); labels int32 (cells,) label id per
    local cell index.
    """
    ox, oy, oz = origin
    nv = sum(len(m.positions) for m in meshes)
    pos = np.empty((nv, 3), dtype=np.float32)
    nrm = np.empty((nv, 3), dtype=np.int8)
    cell = np.empty(nv, dtype=np.uint16)
    idx_parts = []
    off = 0
    for k, m in enumerate(meshes):
        n = len(m.positions)
        pos[off : off + n] = m.positions - np.array([ox, oy, oz], dtype=np.float32)
        nrm[off : off + n] = np.round(np.clip(m.normals, -1, 1) * 127).astype(np.int8)
        cell[off : off + n] = k
        idx_parts.append(m.indices.astype(np.uint32) + np.uint32(off))
        off += n
    idx = np.concatenate(idx_parts) if idx_parts else np.zeros(0, dtype=np.uint32)
    labels = np.asarray(label_ids, dtype=np.int32)
    sections = [("positions", pos), ("normals", nrm), ("cells", cell), ("indices", idx), ("labels", labels)]
    header: dict = {"version": 1, "vertices": int(nv), "indices": int(idx.size), "cells": int(len(labels)), "origin_um": [ox, oy, oz]}
    # Header first with placeholder offsets to size it, then real offsets.
    body = []
    cursor = 0
    offsets = {}
    for name, arr in sections:
        b = arr.tobytes()
        offsets[name] = cursor
        body.append(b)
        cursor += len(b)
        pad = (-cursor) % 4
        body.append(b"\0" * pad)
        cursor += pad
    header["offsets"] = offsets
    hj = json.dumps(header).encode()
    hj += b" " * ((-(len(MAGIC) + 4 + len(hj))) % 4)
    return MAGIC + struct.pack("<I", len(hj)) + hj + b"".join(body)


def unpack_mesh(buf: bytes) -> dict:
    assert buf[:8] == MAGIC
    (hl,) = struct.unpack("<I", buf[8:12])
    h = json.loads(buf[12 : 12 + hl])
    base = 12 + hl
    o = h["offsets"]
    nv, ni, nc = h["vertices"], h["indices"], h["cells"]
    return {
        "header": h,
        "positions": np.frombuffer(buf, np.float32, nv * 3, base + o["positions"]).reshape(-1, 3),
        "normals": np.frombuffer(buf, np.int8, nv * 3, base + o["normals"]).reshape(-1, 3),
        "cells": np.frombuffer(buf, np.uint16, nv, base + o["cells"]),
        "indices": np.frombuffer(buf, np.uint32, ni, base + o["indices"]),
        "labels": np.frombuffer(buf, np.int32, nc, base + o["labels"]),
    }
