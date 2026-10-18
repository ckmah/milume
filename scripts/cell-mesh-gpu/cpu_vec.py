"""Fair CPU baseline: the shipped loft, with the Python/shapely front end batched and the
per-chain loft spread over processes (the GIL caps the shipped ThreadPool).

  1. stride + piece explode for all requested cells in one vectorized pass;
  2. overlap matching for every (cell, slice, slice+1) piece pair at once:
     one shapely.intersects + one intersection/area call (GEOS, GIL released,
     split over threads);
  3. one-to-one links, seam/abrupt stats and chains by numpy pointer chasing;
  4. lofting each cell's chains with milume.cell_mesh._loft_chain (unchanged numba
     kernels) in a persistent fork pool.

Output matches mesh_cell triangle for triangle (checked in bench_all.py).
"""
from __future__ import annotations
import os
import multiprocessing as mp
from concurrent.futures import ThreadPoolExecutor
import numpy as np
import shapely
import milume.cell_mesh as CM
from milume.cell_mesh import MeshParams, CellMesh, CellStats, _Builder, _loft_chain


def _ring_xy_fast(coords, ccw):  # same as CM._ring_xy without np.allclose (1.6 s of 7.6 s in the profile)
    pts = np.asarray(coords, dtype=np.float64)[:, :2]
    if len(pts) > 1 and pts[0, 0] == pts[-1, 0] and pts[0, 1] == pts[-1, 1]:
        pts = pts[:-1]
    a2 = float(np.dot(pts[:, 0], np.roll(pts[:, 1], -1)) - np.dot(np.roll(pts[:, 0], -1), pts[:, 1]))
    if (a2 > 0) != ccw:
        pts = pts[::-1]
    return np.ascontiguousarray(pts)


CM._ring_xy = _ring_xy_fast  # this process (and forked workers) only; exact closure check like allclose on GEOS rings

_G: dict = {}


def _par(fn, arrays, threads):
    n = len(arrays[0])
    if n < 2000 or threads <= 1:
        return fn(*arrays)
    cuts = np.linspace(0, n, threads + 1).astype(int)
    with ThreadPoolExecutor(threads) as ex:
        parts = list(ex.map(lambda k: fn(*[a[cuts[k]:cuts[k + 1]] for a in arrays]), range(threads)))
    return np.concatenate(parts)


def plan(cell_codes, z, geoms, p: MeshParams, threads=8):
    """Rows sorted by (cell, z). Returns per-cell work: {cell: (zs, pieces, chains, stats)}."""
    n = len(cell_codes)
    start = np.flatnonzero(np.r_[True, cell_codes[1:] != cell_codes[:-1]])
    cnt = np.diff(np.r_[start, n])
    rank = np.arange(n) - np.repeat(start, cnt)
    tot = np.repeat(cnt, cnt)
    keep = (tot <= 2) | (p.stride <= 1) | (rank % p.stride == 0) | (rank == tot - 1)
    kc, kz, kg = cell_codes[keep], z[keep], geoms[keep]
    ks = np.arange(len(kc)) - np.repeat(np.flatnonzero(np.r_[True, kc[1:] != kc[:-1]]), np.diff(np.r_[np.flatnonzero(np.r_[True, kc[1:] != kc[:-1]]), len(kc)]))
    parts, src = shapely.get_parts(kg, return_index=True)
    ok = (shapely.get_type_id(parts) == 3) & (shapely.area(parts) >= p.min_area_um2)
    parts, src = parts[ok], src[ok]
    pc, ps = kc[src], ks[src]
    # piece index within (cell, slice), in get_parts order (as mesh_cell)
    newgrp = np.r_[True, (pc[1:] != pc[:-1]) | (ps[1:] != ps[:-1])]
    gstart = np.flatnonzero(newgrp)
    pi = np.arange(len(pc)) - np.repeat(gstart, np.diff(np.r_[gstart, len(pc)]))
    # candidate pairs: pieces of (cell, s) x pieces of (cell, s+1); groups are contiguous
    gkey_c, gkey_s = pc[gstart], ps[gstart]
    gsize = np.diff(np.r_[gstart, len(pc)])
    nxt_grp = np.r_[(gkey_c[1:] == gkey_c[:-1]) & (gkey_s[1:] == gkey_s[:-1] + 1), False]
    ga = np.flatnonzero(nxt_grp)
    na, nb_ = gsize[ga], gsize[ga + 1]
    reps = na * nb_
    pa_grp = np.repeat(ga, reps)
    off = np.arange(reps.sum()) - np.repeat(np.r_[0, np.cumsum(reps)[:-1]], reps)
    ia = gstart[pa_grp] + off // np.repeat(nb_, reps)
    ib = gstart[pa_grp + 1] + off % np.repeat(nb_, reps)
    hit = _par(shapely.intersects, [parts[ia], parts[ib]], threads)
    ia, ib = ia[hit], ib[hit]
    inter = _par(lambda a, b: shapely.area(shapely.intersection(a, b)), [parts[ia], parts[ib]], threads)
    aa, ab = shapely.area(parts[ia]), shapely.area(parts[ib])
    m = inter > p.overlap_frac * np.minimum(aa, ab)
    ia, ib, inter, aa, ab = ia[m], ib[m], inter[m], aa[m], ab[m]
    iou = inter / (aa + ab - inter)
    od = np.bincount(ia, minlength=len(pc)); idg = np.bincount(ib, minlength=len(pc))
    one = (od[ia] == 1) & (idg[ib] == 1)
    abrupt_e = one & (iou < p.min_iou)
    link = one & ~abrupt_e
    nxt = np.full(len(pc), -1); nxt[ia[link]] = ib[link]
    has_prev = np.zeros(len(pc), bool); has_prev[ib[link]] = True
    # seams per slice pair (mesh_cell rule): piece counts differ, or any degree > 1
    bad = np.zeros(len(gstart), bool)
    bad[ga] = na != nb_
    grp_of = np.repeat(np.arange(len(gstart)), gsize)
    np.logical_or.at(bad, grp_of[od > 1], True)
    np.logical_or.at(bad, grp_of[idg > 1] - 1, True)
    # pairs where one side has no pieces at all are counted by mesh_cell too (len differ): slices with zero pieces
    # are absent here; mesh_cell's loop compares every consecutive kept slice. Count them below per cell.
    heads = np.flatnonzero(~has_prev)
    chain_of = np.full(len(pc), -1); chain_of[heads] = np.arange(len(heads))
    cur = heads.copy(); members = [cur]
    while True:
        cur = nxt[cur]; cur = cur[cur >= 0]
        if not cur.size:
            break
        members.append(cur)
    # node -> chain id by walking again (vectorized, step by step)
    cur = heads.copy(); ids = np.arange(len(heads))
    while cur.size:
        chain_of[cur] = ids
        nx = nxt[cur]; ok2 = nx >= 0; cur, ids = nx[ok2], ids[ok2]
    pos_in_chain = np.zeros(len(pc), int)
    cur = heads.copy(); k = 0
    while cur.size:
        pos_in_chain[cur] = k; k += 1
        cur = nxt[cur]; cur = cur[cur >= 0]
    # group per cell
    work = {}
    cell_of_chain = pc[heads]
    order = np.lexsort((pos_in_chain, chain_of))
    bounds = np.searchsorted(chain_of[order], np.arange(len(heads) + 1))
    kst = np.flatnonzero(np.r_[True, kc[1:] != kc[:-1]]); kcnt = np.diff(np.r_[kst, len(kc)])
    zs_by_cell = {int(c): kz[a:a + l] for c, a, l in zip(kc[kst], kst, kcnt)}
    nslice = {int(c): int(l) for c, l in zip(kc[kst], kcnt)}
    abrupt_by = np.bincount(pc[ia[abrupt_e]], minlength=int(cell_codes.max()) + 1)
    seam_by = np.bincount(gkey_c[bad], minlength=int(cell_codes.max()) + 1)
    chains_by: dict = {}
    for h in range(len(heads)):
        nodes = order[bounds[h]:bounds[h + 1]]
        chains_by.setdefault(int(cell_of_chain[h]), []).append(nodes)
    pieces_by = np.bincount(pc, minlength=int(cell_codes.max()) + 1)
    # slices with no pieces still count as seams against neighbours with pieces (len differs)
    present = set(zip(gkey_c.tolist(), gkey_s.tolist()))
    for c, ns in nslice.items():
        extra = 0
        for s in range(ns - 1):
            a, b = (c, s) in present, (c, s + 1) in present
            if a != b:
                extra += 1
        st = CellStats(pieces=int(pieces_by[c]), seams=int(seam_by[c]) + extra, abrupt=int(abrupt_by[c]))
        work[c] = (zs_by_cell[c], chains_by.get(c, []), st)
    return work, parts, ps


def _loft_cell(args):
    c, zs, chains, st = args
    parts, ps, p = _G["parts"], _G["ps"], _G["p"]
    out = _Builder()
    half = p.z_step_um * p.stride / 2
    for nodes in chains:
        st.chains += 1
        polys = list(parts[nodes]); cs = ps[nodes]
        if len(nodes) == 1:
            st.slabs += 1
            z = zs[cs[0]]
            _loft_chain(polys * 2, np.array([z - half, z + half]), p, out, st)
        elif p.extend_ends and not p.polyrender_rule:
            cz = zs[cs]
            _loft_chain([polys[0], *polys, polys[-1]], np.concatenate([[cz[0] - half], cz, [cz[-1] + half]]), p, out, st)
        else:
            _loft_chain(polys, zs[cs], p, out, st)
    m = out.build(st)
    return c, m


class VecMesher:
    """Holds the sorted table; build(cells) -> list[CellMesh]. Pool is forked per build call
    (fork is copy-on-write, so only the small plan for the requested cells is shipped)."""

    def __init__(self, cell_ids, z_um, geoms, p: MeshParams, procs: int | None = None):
        self.p = p
        order = np.lexsort((np.asarray(z_um), np.asarray(cell_ids)))
        cid = np.asarray(cell_ids)[order]
        self.uniq, self.code = np.unique(cid, return_inverse=True)
        self.z = np.asarray(z_um, dtype=np.float64)[order]
        self.g = np.asarray(geoms, dtype=object)[order]
        self.procs = procs or os.cpu_count()

    def build(self, cells, timings=None):
        tm = timings if timings is not None else {}
        import time
        t = time.perf_counter()
        codes = np.searchsorted(self.uniq, np.asarray(cells))
        sel = np.isin(self.code, codes)
        work, parts, ps = plan(self.code[sel], self.z[sel], self.g[sel], self.p)
        tm["plan"] = time.perf_counter() - t
        t = time.perf_counter()
        _G.update(parts=parts, ps=ps, p=self.p)
        jobs = [(c, *work[c]) for c in codes.tolist()]
        ctx = mp.get_context("fork")
        with ctx.Pool(self.procs) as pool:
            res = dict(pool.imap_unordered(_loft_cell, jobs, chunksize=max(1, len(jobs) // (self.procs * 8))))
        tm["loft"] = time.perf_counter() - t
        return [res[c] for c in codes.tolist()]
