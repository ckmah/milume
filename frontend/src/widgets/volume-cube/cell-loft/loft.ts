/**
 * Client-side port of milume/cell_mesh.py `mesh_cell` (+ milume/_loft_kernels.py),
 * branch proto-cell-mesh-ts. Same rules: pieces matched across neighbouring slices by
 * overlap; one-to-one matches loft into tubes (chains), piece-count changes are seams
 * (each piece capped, no side wall); a one-to-one match below min_iou is a seam too; a
 * piece on one slice is a slab one strided step thick; chains extend half a step past
 * their end slices; holes are matched along a chain and lofted as inward tubes, opening
 * the caps they reach. Caps are earcut (same algorithm as mapbox_earcut).
 */
import earcut from "earcut";
import { type Poly, makePoly, overlapAreaExact, overlapAreaScan } from "./geom";

export type MeshParams = {
  zStepUm: number; stride: number; segUm: number; ringMin: number; ringMax: number;
  holeRingMin: number; holeRingMax: number; smoothIters: number; smoothFactor: number;
  curvatureBase: number; minAreaUm2: number; overlapFrac: number; minIou: number; extendEnds: boolean;
};
export const DEFAULT_PARAMS: MeshParams = {
  zStepUm: 0.5, stride: 2, segUm: 1.0, ringMin: 12, ringMax: 40, holeRingMin: 8, holeRingMax: 24,
  smoothIters: 1, smoothFactor: 0.5, curvatureBase: 0.28, minAreaUm2: 0.5, overlapFrac: 0.1, minIou: 0.2, extendEnds: true,
};

export type CellStats = { pieces: number; chains: number; slabs: number; seams: number; abrupt: number; holeTubes: number; holesDropped: number; exactPairs: number; pairs: number };
export type CellMesh = { positions: Float32Array; normals: Float32Array; indices: Uint32Array; stats: CellStats };

const newStats = (): CellStats => ({ pieces: 0, chains: 0, slabs: 0, seams: 0, abrupt: 0, holeTubes: 0, holesDropped: 0, exactPairs: 0, pairs: 0 });

/** Python's round(): half to even. */
function roundHalfEven(x: number): number {
  const f = Math.floor(x), d = x - f;
  if (d > 0.5) return f + 1;
  if (d < 0.5) return f;
  return f % 2 === 0 ? f : f + 1;
}
const ringCount = (perim: number, p: MeshParams, lo: number, hi: number) => Math.min(hi, Math.max(lo, roundHalfEven(perim / p.segUm)));

/** _ring_xy: drop the closing point, orient CCW (ccw) or CW. Returns flat xy. */
function ringXY(r: Float64Array, ccw: boolean): Float64Array {
  let n = r.length / 2;
  if (n > 1 && Math.abs(r[0]! - r[2 * n - 2]!) <= 1e-8 + 1e-5 * Math.abs(r[2 * n - 2]!) && Math.abs(r[1]! - r[2 * n - 1]!) <= 1e-8 + 1e-5 * Math.abs(r[2 * n - 1]!)) n--;
  let a2 = 0;
  for (let i = 0; i < n; i++) { const j = (i + 1) % n; a2 += r[2 * i]! * r[2 * j + 1]! - r[2 * j]! * r[2 * i + 1]!; }
  const out = new Float64Array(2 * n);
  if ((a2 > 0) !== ccw) for (let i = 0; i < n; i++) { out[2 * i] = r[2 * (n - 1 - i)]!; out[2 * i + 1] = r[2 * (n - 1 - i) + 1]!; }
  else out.set(r.subarray(0, 2 * n));
  return out;
}

function arcResample(ring: Float64Array, nPts: number): Float64Array {
  let n = ring.length / 2;
  if (n > 1) { const dx = ring[2 * n - 2]! - ring[0]!, dy = ring[2 * n - 1]! - ring[1]!; if (dx * dx + dy * dy < 1e-20) n -= 1; }
  const out = new Float64Array(2 * nPts);
  const cum = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) { const j = (i + 1) % n; cum[i + 1] = cum[i]! + Math.hypot(ring[2 * j]! - ring[2 * i]!, ring[2 * j + 1]! - ring[2 * i + 1]!); }
  const total = cum[n]!;
  if (total < 1e-15) { for (let i = 0; i < nPts; i++) { out[2 * i] = ring[0]!; out[2 * i + 1] = ring[1]!; } return out; }
  const step = total / nPts; let seg = 0;
  for (let i = 0; i < nPts; i++) {
    const t = i * step;
    while (seg < n - 1 && cum[seg + 1]! <= t) seg++;
    const span = cum[seg + 1]! - cum[seg]!;
    const frac = span > 1e-15 ? (t - cum[seg]!) / span : 0;
    const k = (seg + 1) % n;
    out[2 * i] = ring[2 * seg]! + frac * (ring[2 * k]! - ring[2 * seg]!);
    out[2 * i + 1] = ring[2 * seg + 1]! + frac * (ring[2 * k + 1]! - ring[2 * seg + 1]!);
  }
  return out;
}

function curvatureResample(ring: Float64Array, nT: number, base: number): Float64Array {
  const n = ring.length / 2;
  const X = (i: number) => ring[2 * (((i % n) + n) % n)]!, Y = (i: number) => ring[2 * (((i % n) + n) % n) + 1]!;
  const w = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const vp0 = X(i) - X(i - 1), vp1 = Y(i) - Y(i - 1), vn0 = X(i + 1) - X(i), vn1 = Y(i + 1) - Y(i);
    const lp = Math.sqrt(vp0 * vp0 + vp1 * vp1) + 1e-12, ln = Math.sqrt(vn0 * vn0 + vn1 * vn1) + 1e-12;
    const d = Math.min(1, Math.max(-1, (vp0 * vn0 + vp1 * vn1) / (lp * ln)));
    const a0 = X(i + 1) - X(i), a1 = Y(i + 1) - Y(i), b0 = X(i + 2) - X(i + 1), b1 = Y(i + 2) - Y(i + 1);
    const la = Math.sqrt(a0 * a0 + a1 * a1) + 1e-12, lb = Math.sqrt(b0 * b0 + b1 * b1) + 1e-12;
    const d3 = Math.min(1, Math.max(-1, (a0 * b0 + a1 * b1) / (la * lb)));
    const e1 = 1 - d + base * Math.PI, e2 = 1 - d3 + base * Math.PI;
    w[i] = (Math.sqrt(a0 * a0 + a1 * a1) + 1e-12) * 0.5 * (e1 + e2);
  }
  let total = 0; for (let i = 0; i < n; i++) total += w[i]!;
  const out = new Float64Array(2 * nT);
  if (total < 1e-12) { for (let i = 0; i < nT; i++) { out[2 * i] = ring[0]!; out[2 * i + 1] = ring[1]!; } return out; }
  const cum = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) cum[i + 1] = cum[i]! + w[i]!;
  const step = total / nT; let seg = 0;
  for (let i = 0; i < nT; i++) {
    const t = i * step;
    while (seg < n - 1 && cum[seg + 1]! <= t) seg++;
    const span = cum[seg + 1]! - cum[seg]!;
    const frac = span > 1e-15 ? (t - cum[seg]!) / span : 0;
    const k = (seg + 1) % n;
    out[2 * i] = ring[2 * seg]! + frac * (ring[2 * k]! - ring[2 * seg]!);
    out[2 * i + 1] = ring[2 * seg + 1]! + frac * (ring[2 * k + 1]! - ring[2 * seg + 1]!);
  }
  return out;
}

function resample(ring: Float64Array, n: number, base: number): Float64Array {
  const m = ring.length / 2;
  return m >= n && m >= 4 ? curvatureResample(ring, n, base) : arcResample(ring, n);
}

function bestShift(prev: Float64Array, curr: Float64Array): number {
  const n = prev.length / 2; let best = 1e200, bk = 0;
  for (let k = 0; k < n; k++) {
    let c = 0;
    for (let i = 0; i < n; i++) { const s = (i + k) % n; const dx = curr[2 * s]! - prev[2 * i]!, dy = curr[2 * s + 1]! - prev[2 * i + 1]!; c += dx * dx + dy * dy; }
    if (c < best) { best = c; bk = k; }
  }
  return bk;
}

/** (S, n, 2) stack as S flat rings, each resampled to n and rolled to align with the previous. */
function stackRings(rings: Float64Array[], n: number, p: MeshParams): Float64Array[] {
  const st: Float64Array[] = [];
  rings.forEach((r, s) => {
    let q = resample(r, n, p.curvatureBase);
    if (s) {
      const k = bestShift(st[s - 1]!, q);
      if (k) { const o = new Float64Array(2 * n); for (let i = 0; i < n; i++) { o[2 * i] = q[2 * ((i + k) % n)]!; o[2 * i + 1] = q[2 * ((i + k) % n) + 1]!; } q = o; }
    }
    st.push(q);
  });
  return st;
}

function vertexNormals(pos: Float32Array, tris: Uint32Array): Float32Array {
  const nv = pos.length / 3; const acc = new Float64Array(nv * 3);
  for (let f = 0; f < tris.length; f += 3) {
    const a = tris[f]!, b = tris[f + 1]!, c = tris[f + 2]!;
    const e1x = pos[3 * b]! - pos[3 * a]!, e1y = pos[3 * b + 1]! - pos[3 * a + 1]!, e1z = pos[3 * b + 2]! - pos[3 * a + 2]!;
    const e2x = pos[3 * c]! - pos[3 * a]!, e2y = pos[3 * c + 1]! - pos[3 * a + 1]!, e2z = pos[3 * c + 2]! - pos[3 * a + 2]!;
    const nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
    for (const v of [a, b, c]) { acc[3 * v] += nx; acc[3 * v + 1] += ny; acc[3 * v + 2] += nz; }
  }
  const out = new Float32Array(nv * 3);
  for (let i = 0; i < nv; i++) {
    const s = acc[3 * i]! ** 2 + acc[3 * i + 1]! ** 2 + acc[3 * i + 2]! ** 2;
    const inv = s > 1e-24 ? 1 / Math.sqrt(s) : 0;
    out[3 * i] = acc[3 * i]! * inv; out[3 * i + 1] = acc[3 * i + 1]! * inv; out[3 * i + 2] = acc[3 * i + 2]! * inv;
  }
  return out;
}

class Builder {
  pos: Float32Array[] = []; nrm: Float32Array[] = []; idx: Uint32Array[] = []; n = 0;
  add(pos: Float64Array | Float32Array, tris: Uint32Array, nrm?: Float32Array) {
    const p32 = pos instanceof Float32Array ? pos : Float32Array.from(pos);
    this.pos.push(p32);
    this.nrm.push(nrm ?? vertexNormals(p32, tris));
    const t = new Uint32Array(tris.length); for (let i = 0; i < tris.length; i++) t[i] = tris[i]! + this.n;
    this.idx.push(t);
    this.n += p32.length / 3;
  }
  cap(rings: Float64Array[], z: number, up: boolean) {
    let len = 0; for (const r of rings) len += r.length;
    const verts = new Float64Array(len); const holes: number[] = [];
    let o = 0; rings.forEach((r, k) => { if (k) holes.push(o / 2); verts.set(r, o); o += r.length; });
    const t = earcut(verts as unknown as number[], holes.length ? holes : undefined, 2);
    if (!t.length) return;
    const tris = Uint32Array.from(t);
    for (let f = 0; f < tris.length; f += 3) {
      const a = tris[f]!, b = tris[f + 1]!, c = tris[f + 2]!;
      const cz = (verts[2 * b]! - verts[2 * a]!) * (verts[2 * c + 1]! - verts[2 * a + 1]!) - (verts[2 * b + 1]! - verts[2 * a + 1]!) * (verts[2 * c]! - verts[2 * a]!);
      if (up ? cz < 0 : cz > 0) { tris[f + 1] = c; tris[f + 2] = b; }
    }
    const nv = verts.length / 2; const pos = new Float64Array(nv * 3); const nrm = new Float32Array(nv * 3);
    for (let i = 0; i < nv; i++) { pos[3 * i] = verts[2 * i]!; pos[3 * i + 1] = verts[2 * i + 1]!; pos[3 * i + 2] = z; nrm[3 * i + 2] = up ? 1 : -1; }
    this.add(pos, tris, nrm);
  }
  /** Side wall through the stack; returns the (smoothed) rings so caps share them. */
  tube(stack: Float64Array[], zs: ArrayLike<number>, p: MeshParams): Float64Array[] {
    const S = stack.length, n = stack[0]!.length / 2;
    const tris = new Uint32Array((S - 1) * n * 6);
    let o = 0;
    for (let s = 0; s < S - 1; s++) for (let qi = 0; qi < n; qi++) {
      const qj = (qi + 1) % n, b = s * n;
      tris.set([b + qi, b + qj, b + n + qj, b + qi, b + n + qj, b + n + qi], o); o += 6;
    }
    const pos = new Float64Array(S * n * 3);
    for (let s = 0; s < S; s++) for (let i = 0; i < n; i++) { const v = s * n + i; pos[3 * v] = stack[s]![2 * i]!; pos[3 * v + 1] = stack[s]![2 * i + 1]!; pos[3 * v + 2] = zs[s]!; }
    if (p.smoothIters > 0 && S >= 3) {
      const lam = Math.min(0.65, Math.max(0.2, 0.2 + 0.45 * p.smoothFactor));
      const mu = 1 / (0.1 - 1 / lam);
      const nv = S * n; const cnt = new Float64Array(nv);
      for (let i = 0; i < tris.length; i++) cnt[tris[i]!]! += 1;
      for (let i = 0; i < nv; i++) cnt[i] = Math.max(cnt[i]! * 2, 1);
      const sums = new Float64Array(nv * 3);
      const step = (f: number) => {
        sums.fill(0);
        for (let t = 0; t < tris.length; t += 3) {
          const a = tris[t]!, b = tris[t + 1]!, c = tris[t + 2]!;
          for (let k = 0; k < 3; k++) {
            sums[3 * a + k] += pos[3 * b + k]! + pos[3 * c + k]!;
            sums[3 * b + k] += pos[3 * a + k]! + pos[3 * c + k]!;
            sums[3 * c + k] += pos[3 * a + k]! + pos[3 * b + k]!;
          }
        }
        for (let v = 0; v < nv; v++) for (let k = 0; k < 3; k++) pos[3 * v + k] += f * (sums[3 * v + k]! / cnt[v]! - pos[3 * v + k]!);
      };
      for (let it = 0; it < p.smoothIters; it++) { step(lam); step(mu); }
      // post_smooth: restore per-slice centroid and mean radius from the pre-smooth rings
      const side: Float64Array[] = [];
      for (let s = 0; s < S; s++) {
        const ref = stack[s]!; const cur = new Float64Array(2 * n);
        for (let i = 0; i < n; i++) { cur[2 * i] = pos[3 * (s * n + i)]!; cur[2 * i + 1] = pos[3 * (s * n + i) + 1]!; }
        let cxr = 0, cyr = 0, cxc = 0, cyc = 0;
        for (let i = 0; i < n; i++) { cxr += ref[2 * i]!; cyr += ref[2 * i + 1]!; cxc += cur[2 * i]!; cyc += cur[2 * i + 1]!; }
        cxr /= n; cyr /= n; cxc /= n; cyc /= n;
        let rr = 0, rc = 0;
        for (let i = 0; i < n; i++) { rr += Math.hypot(ref[2 * i]! - cxr, ref[2 * i + 1]! - cyr); rc += Math.hypot(cur[2 * i]! - cxc, cur[2 * i + 1]! - cyc); }
        rr /= n; rc /= n;
        const sc = rr > 1e-12 && rc > 1e-12 ? rr / rc : 1;
        for (let i = 0; i < n; i++) { cur[2 * i] = cxr + sc * (cur[2 * i]! - cxc); cur[2 * i + 1] = cyr + sc * (cur[2 * i + 1]! - cyc); }
        side.push(cur);
        for (let i = 0; i < n; i++) { const v = s * n + i; pos[3 * v] = cur[2 * i]!; pos[3 * v + 1] = cur[2 * i + 1]!; pos[3 * v + 2] = zs[s]!; }
      }
      stack = side;
    }
    this.add(pos, tris);
    return stack;
  }
  build(stats: CellStats): CellMesh {
    let nv = 0, ni = 0; for (const p of this.pos) nv += p.length; for (const t of this.idx) ni += t.length;
    const positions = new Float32Array(nv), normals = new Float32Array(nv), indices = new Uint32Array(ni);
    let a = 0; this.pos.forEach((p, k) => { positions.set(p, a); normals.set(this.nrm[k]!, a); a += p.length; });
    let b = 0; for (const t of this.idx) { indices.set(t, b); b += t.length; }
    return { positions, normals, indices, stats };
  }
}

const reversedRing = (r: Float64Array) => { const n = r.length / 2, o = new Float64Array(r.length); for (let i = 0; i < n; i++) { o[2 * i] = r[2 * (n - 1 - i)]!; o[2 * i + 1] = r[2 * (n - 1 - i) + 1]!; } return o; };

/** Exact recheck band around the match thresholds (relative). */
const BAND = 0.02;

function match(a: Poly[], b: Poly[], p: MeshParams, stats: CellStats) {
  const od = new Int32Array(a.length), idg = new Int32Array(b.length);
  const edges: [number, number, number][] = [];
  for (let i = 0; i < a.length; i++) for (let j = 0; j < b.length; j++) {
    const A = a[i]!, B = b[j]!;
    if (A.bbox[2] < B.bbox[0] || B.bbox[2] < A.bbox[0] || A.bbox[3] < B.bbox[1] || B.bbox[3] < A.bbox[1]) continue;
    stats.pairs++;
    let x = overlapAreaScan(A, B);
    const mn = Math.min(A.area, B.area), thr = p.overlapFrac * mn;
    const iou = x / (A.area + B.area - x);
    if (Math.abs(x - thr) < BAND * mn || (x > thr && Math.abs(iou - p.minIou) < BAND)) { x = overlapAreaExact(A, B); stats.exactPairs++; }
    if (!(x > thr)) continue;
    edges.push([i, j, x / (A.area + B.area - x)]);
    od[i]++; idg[j]++;
  }
  return { edges, od, idg };
}

function chains(slices: Poly[][], p: MeshParams, stats: CellStats): [number, number][][] {
  const nxt = new Map<number, number>(); const hasPrev = new Set<number>();
  const W = 1 << 16; const key = (s: number, i: number) => s * W + i;
  for (let s = 0; s < slices.length - 1; s++) {
    const { edges, od, idg } = match(slices[s]!, slices[s + 1]!, p, stats);
    if (slices[s]!.length !== slices[s + 1]!.length || od.some((v) => v > 1) || idg.some((v) => v > 1)) stats.seams++;
    for (const [i, j, iou] of edges) {
      if (od[i] === 1 && idg[j] === 1) {
        if (iou < p.minIou) { stats.abrupt++; continue; }
        nxt.set(key(s, i), key(s + 1, j)); hasPrev.add(key(s + 1, j));
      }
    }
  }
  const out: [number, number][][] = [];
  slices.forEach((pieces, s) => pieces.forEach((_, i) => {
    const k0 = key(s, i); if (hasPrev.has(k0)) return;
    const ch: [number, number][] = [[s, i]]; let k = k0;
    while (nxt.has(k)) { k = nxt.get(k)!; ch.push([Math.floor(k / W), k % W]); }
    out.push(ch);
  }));
  return out;
}

function loftChain(polys: Poly[], zs: number[], p: MeshParams, out: Builder, stats: CellStats) {
  const k = polys.length;
  const ext = polys.map((q) => ringXY(q.rings[0]!, true));
  const n = ringCount(Math.max(...polys.map((q) => q.extLength)), p, p.ringMin, p.ringMax);
  const stack = out.tube(stackRings(ext, n, p), zs, p);
  const holePolys = polys.map((q) => q.rings.slice(1).map((r) => makePoly([r])).filter((h) => h.area >= p.minAreaUm2));
  const openBottom: Float64Array[] = [], openTop: Float64Array[] = [];
  if (holePolys.some((h) => h.length)) {
    const hs = newStats();
    for (const ch of chains(holePolys, p, hs)) {
      if (ch.length < 2) { stats.holesDropped++; continue; }
      stats.holeTubes++;
      const rings = ch.map(([s, i]) => ringXY(holePolys[s]![i]!.rings[0]!, false));
      const hn = ringCount(Math.max(...ch.map(([s, i]) => holePolys[s]![i]!.extLength)), p, p.holeRingMin, p.holeRingMax);
      const s0 = ch[0]![0], s1 = ch[ch.length - 1]![0];
      const hst = out.tube(stackRings(rings, hn, p), zs.slice(s0, s1 + 1), p);
      if (s0 === 0) openBottom.push(reversedRing(hst[0]!)); else out.cap([reversedRing(hst[0]!)], zs[s0]!, true);
      if (s1 === k - 1) openTop.push(reversedRing(hst[hst.length - 1]!)); else out.cap([reversedRing(hst[hst.length - 1]!)], zs[s1]!, false);
    }
  }
  out.cap([stack[0]!, ...openBottom.map(reversedRing)], zs[0]!, false);
  out.cap([stack[stack.length - 1]!, ...openTop.map(reversedRing)], zs[zs.length - 1]!, true);
}

/** Mesh one cell from (z µm, polygon pieces) slices (any order). Pieces: all parts of the slice's (Multi)Polygon. */
export function meshCell(slices: { z: number; parts: Poly[] }[], p: MeshParams = DEFAULT_PARAMS): CellMesh {
  const stats = newStats();
  let rows = slices.map((r, i) => ({ r, i })).sort((a, b) => a.r.z - b.r.z || a.i - b.i).map((x) => x.r);
  if (p.stride > 1 && rows.length > 2) {
    const keep: number[] = []; for (let i = 0; i < rows.length; i += p.stride) keep.push(i);
    if (keep[keep.length - 1] !== rows.length - 1) keep.push(rows.length - 1);
    rows = keep.map((i) => rows[i]!);
  }
  const zs = rows.map((r) => r.z);
  const pieces = rows.map((r) => r.parts.filter((q) => q.area >= p.minAreaUm2));
  stats.pieces = pieces.reduce((a, x) => a + x.length, 0);
  const out = new Builder();
  const half = (p.zStepUm * p.stride) / 2;
  for (const ch of chains(pieces, p, stats)) {
    stats.chains++;
    const polys = ch.map(([s, i]) => pieces[s]![i]!);
    if (ch.length === 1) {
      stats.slabs++;
      const z = zs[ch[0]![0]]!;
      loftChain([polys[0]!, polys[0]!], [z - half, z + half], p, out, stats);
    } else if (p.extendEnds) {
      const cz = ch.map(([s]) => zs[s]!);
      loftChain([polys[0]!, ...polys, polys[polys.length - 1]!], [cz[0]! - half, ...cz, cz[cz.length - 1]! + half], p, out, stats);
    } else {
      loftChain(polys, ch.map(([s]) => zs[s]!), p, out, stats);
    }
  }
  return out.build(stats);
}
