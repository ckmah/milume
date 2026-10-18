/**
 * Polygon helpers for the client-side loft (branch proto-cell-mesh-ts).
 *
 * Overlap matching needs intersection *areas* only (shapely.intersection().area in
 * milume/cell_mesh.py). We compute them by exact horizontal scanline integration on a
 * global row grid (row pitch SCAN_H µm): each polygon's even-odd crossings are computed
 * once per row and cached on the polygon, so a pair costs one interval intersection per
 * shared row. Holes fall out of even-odd for free. Where the scanline area is within a
 * small band of a decision threshold (overlap share, min IoU), the pair is recomputed
 * exactly with polygon-clipping (already a milume dependency), so match decisions
 * agree with GEOS. See cell-loft.ts for the thresholds.
 */
import polygonClipping from "polygon-clipping";

/** One polygon piece in µm. rings[0] is the exterior; rings are closed (first point repeated), as WKB. */
export type Poly = {
  rings: Float64Array[];
  area: number;
  bbox: [number, number, number, number];
  /** Perimeter of the exterior ring (shapely `exterior.length`). */
  extLength: number;
  _scan?: Scan | null;
};

type Scan = { r0: number; off: Uint32Array; xs: Float64Array };

export const SCAN_H = 0.05;

export function ringSignedArea2(r: Float64Array): number {
  // shoelace over the closed ring (closing point included, so the last term is 0)
  let a = 0;
  const n = r.length / 2;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    a += r[2 * i]! * r[2 * j + 1]! - r[2 * j]! * r[2 * i + 1]!;
  }
  return a;
}

export function ringLength(r: Float64Array): number {
  let l = 0;
  for (let i = 2; i < r.length; i += 2) l += Math.hypot(r[i]! - r[i - 2]!, r[i + 1]! - r[i - 1]!);
  return l;
}

export function makePoly(rings: Float64Array[]): Poly {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const e = rings[0]!;
  for (let i = 0; i < e.length; i += 2) {
    const x = e[i]!, y = e[i + 1]!;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  let area = Math.abs(ringSignedArea2(e)) / 2;
  for (let k = 1; k < rings.length; k++) area -= Math.abs(ringSignedArea2(rings[k]!)) / 2;
  return { rings, area, bbox: [x0, y0, x1, y1], extLength: ringLength(e) };
}

function scan(p: Poly): Scan | null {
  if (p._scan !== undefined) return p._scan;
  const h = SCAN_H;
  const r0 = Math.ceil(p.bbox[1] / h - 0.5);
  const r1 = Math.ceil(p.bbox[3] / h - 0.5); // exclusive
  const nr = r1 - r0;
  if (nr <= 0) return (p._scan = null);
  const cnt = new Uint32Array(nr + 1);
  const each = (fn: (r: number, x: number) => void) => {
    for (const ring of p.rings) {
      for (let i = 2; i < ring.length; i += 2) {
        const xa = ring[i - 2]!, ya = ring[i - 1]!, xb = ring[i]!, yb = ring[i + 1]!;
        if (ya === yb) continue;
        const lo = Math.min(ya, yb), hi = Math.max(ya, yb);
        const ra = Math.ceil(lo / h - 0.5), rb = Math.ceil(hi / h - 0.5); // rows with lo <= y < hi
        for (let r = ra; r < rb; r++) {
          const y = (r + 0.5) * h;
          fn(r - r0, xa + ((y - ya) / (yb - ya)) * (xb - xa));
        }
      }
    }
  };
  each((r) => cnt[r + 1]!++);
  for (let i = 0; i < nr; i++) cnt[i + 1]! += cnt[i]!;
  const xs = new Float64Array(cnt[nr]!);
  const fill = cnt.slice(0, nr);
  each((r, x) => (xs[fill[r]!++] = x));
  for (let r = 0; r < nr; r++) {
    const a = cnt[r]!, b = cnt[r + 1]!;
    if (b - a > 1) xs.subarray(a, b).sort();
  }
  return (p._scan = { r0, off: cnt, xs });
}

/** Intersection area by scanline integration (µm²). */
export function overlapAreaScan(a: Poly, b: Poly): number {
  if (a.bbox[2] < b.bbox[0] || b.bbox[2] < a.bbox[0] || a.bbox[3] < b.bbox[1] || b.bbox[3] < a.bbox[1]) return 0;
  const sa = scan(a), sb = scan(b);
  if (!sa || !sb) return 0;
  const ra = Math.max(sa.r0, sb.r0);
  const rb = Math.min(sa.r0 + sa.off.length - 1, sb.r0 + sb.off.length - 1);
  let total = 0;
  for (let r = ra; r < rb; r++) {
    let i = sa.off[r - sa.r0]!, ie = sa.off[r - sa.r0 + 1]!;
    let j = sb.off[r - sb.r0]!, je = sb.off[r - sb.r0 + 1]!;
    while (i + 1 < ie && j + 1 < je) {
      const lo = Math.max(sa.xs[i]!, sb.xs[j]!), hi = Math.min(sa.xs[i + 1]!, sb.xs[j + 1]!);
      if (hi > lo) total += hi - lo;
      if (sa.xs[i + 1]! < sb.xs[j + 1]!) i += 2; else j += 2;
    }
  }
  return total * SCAN_H;
}

function toPC(p: Poly): [number, number][][] {
  return p.rings.map((r) => {
    const out: [number, number][] = [];
    for (let i = 0; i < r.length; i += 2) out.push([r[i]!, r[i + 1]!]);
    return out;
  });
}

/** Exact intersection area (polygon-clipping). */
export function overlapAreaExact(a: Poly, b: Poly): number {
  try {
    const mp = polygonClipping.intersection(toPC(a) as never, toPC(b) as never);
    let s = 0;
    for (const poly of mp) {
      poly.forEach((ring, k) => {
        let a2 = 0;
        for (let i = 0; i < ring.length - 1; i++) a2 += ring[i]![0] * ring[i + 1]![1] - ring[i + 1]![0] * ring[i]![1];
        s += (k === 0 ? 1 : -1) * Math.abs(a2) / 2;
      });
    }
    return s;
  } catch {
    return overlapAreaScan(a, b);
  }
}
