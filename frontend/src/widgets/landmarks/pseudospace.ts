/** Geodesic pseudospace between consecutive landmark geometries. */

export type GeomKind = "point" | "line" | "spline" | "shape";

export type Geom = {
  id: string;
  kind: GeomKind;
  vertices: { x: number; y: number }[];
};

export type Cell = { x: number; y: number };

const KNN_K = 8;

type Edge = { to: number; w: number };

function hypot(ax: number, ay: number, bx: number, by: number) {
  return Math.hypot(ax - bx, ay - by);
}

function segmentDistance(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return hypot(px, py, ax, ay);
  let t = ((px - ax) * dx + (py - ay) * dy) / len2;
  if (t < 0) t = 0;
  else if (t > 1) t = 1;
  return hypot(px, py, ax + t * dx, ay + t * dy);
}

function splinePolyline(vertices: readonly { x: number; y: number }[], steps = 8) {
  if (vertices.length < 3) return vertices.map((v) => ({ x: v.x, y: v.y }));
  const pts = vertices.map((v) => ({ x: v.x, y: v.y }));
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)]!;
    const p1 = pts[i]!;
    const p2 = pts[i + 1]!;
    const p3 = pts[Math.min(pts.length - 1, i + 2)]!;
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      const t2 = t * t;
      const t3 = t2 * t;
      out.push({
        x:
          0.5 *
          (2 * p1.x +
            (-p0.x + p2.x) * t +
            (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
            (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
        y:
          0.5 *
          (2 * p1.y +
            (-p0.y + p2.y) * t +
            (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
            (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
      });
    }
  }
  const last = pts[pts.length - 1];
  if (last) out.push(last);
  return out;
}

function polyline(geom: Geom) {
  if (geom.kind === "spline") return splinePolyline(geom.vertices);
  return geom.vertices;
}

function distanceToGeometry(x: number, y: number, geom: Geom) {
  const vertices = polyline(geom);
  if (!vertices.length) return Infinity;
  const first = vertices[0];
  if (!first) return Infinity;
  if (vertices.length === 1) return hypot(x, y, first.x, first.y);
  let best = Infinity;
  const closed = geom.kind === "shape";
  const n = closed ? vertices.length : vertices.length - 1;
  for (let i = 0; i < n; i++) {
    const a = vertices[i];
    const b = vertices[(i + 1) % vertices.length];
    if (!a || !b) continue;
    best = Math.min(best, segmentDistance(x, y, a.x, a.y, b.x, b.y));
  }
  return best;
}

function knn(cells: readonly Cell[], k: number): Edge[][] {
  const adj: Edge[][] = cells.map(() => []);
  for (let i = 0; i < cells.length; i++) {
    const origin = cells[i];
    if (!origin) continue;
    const near: Edge[] = [];
    for (let j = 0; j < cells.length; j++) {
      if (i === j) continue;
      const other = cells[j];
      if (!other) continue;
      near.push({ to: j, w: hypot(origin.x, origin.y, other.x, other.y) });
    }
    near.sort((a, b) => a.w - b.w);
    for (const edge of near.slice(0, k)) {
      adj[i]!.push(edge);
      adj[edge.to]!.push({ to: i, w: edge.w });
    }
  }
  return adj;
}

function geodesicToLandmark(cells: readonly Cell[], adj: readonly Edge[][], geom: Geom): Float64Array {
  const eu = cells.map((cell) => distanceToGeometry(cell.x, cell.y, geom));
  let nearest = Infinity;
  for (const d of eu) if (d < nearest) nearest = d;
  const cutoff = Math.max(nearest * 1.25, nearest + 1e-9);
  const dist = new Float64Array(cells.length);
  dist.fill(Infinity);
  for (let i = 0; i < cells.length; i++) {
    if ((eu[i] ?? Infinity) <= cutoff) dist[i] = eu[i] ?? 0;
  }
  const used = new Uint8Array(cells.length);
  for (;;) {
    let u = -1;
    let best = Infinity;
    for (let i = 0; i < dist.length; i++) {
      if (!used[i] && (dist[i] ?? Infinity) < best) {
        best = dist[i] ?? Infinity;
        u = i;
      }
    }
    if (u < 0 || best === Infinity) break;
    used[u] = 1;
    for (const edge of adj[u] ?? []) {
      const next = (dist[u] ?? Infinity) + edge.w;
      if (next < (dist[edge.to] ?? Infinity)) dist[edge.to] = next;
    }
  }
  for (let i = 0; i < dist.length; i++) {
    if (!Number.isFinite(dist[i])) dist[i] = eu[i] ?? 0;
  }
  return dist;
}

/**
 * Value is 0 at the first landmark and `ordered.length - 1` at the last.
 * Display labels are 1-based and are not this number.
 */
export function pseudospaceField(cells: readonly Cell[], ordered: readonly Geom[]): { values: Float64Array; valueMax: number } | null {
  if (ordered.length < 2 || !cells.length) return null;
  const adj = knn(cells, KNN_K);
  const columns = ordered.map((geom) => geodesicToLandmark(cells, adj, geom));
  const values = new Float64Array(cells.length);
  for (let index = 0; index < cells.length; index++) {
    let pair = 0;
    let best = Infinity;
    for (let p = 0; p < ordered.length - 1; p++) {
      const sum = (columns[p]?.[index] ?? Infinity) + (columns[p + 1]?.[index] ?? Infinity);
      if (sum < best) {
        best = sum;
        pair = p;
      }
    }
    const d0 = columns[pair]?.[index] ?? 0;
    const d1 = columns[pair + 1]?.[index] ?? 0;
    if (!Number.isFinite(d0) || !Number.isFinite(d1)) {
      values[index] = Number.NaN;
      continue;
    }
    const frac = d0 + d1 === 0 ? 0 : d0 / (d0 + d1);
    values[index] = pair + frac;
  }
  return { values, valueMax: ordered.length - 1 };
}

const DIVERGE: { u: number; rgb: [number, number, number] }[] = [
  { u: 0, rgb: [165, 15, 21] },
  { u: 0.28, rgb: [252, 141, 89] },
  { u: 0.5, rgb: [247, 247, 247] },
  { u: 0.72, rgb: [107, 174, 214] },
  { u: 1, rgb: [84, 39, 136] },
];

export function divergingRgb(value: number, valueMax: number): [number, number, number] {
  const u = valueMax <= 0 ? 0 : Math.min(1, Math.max(0, value / valueMax));
  let a = DIVERGE[0]!;
  let b = DIVERGE[DIVERGE.length - 1]!;
  for (let i = 0; i < DIVERGE.length - 1; i++) {
    const left = DIVERGE[i];
    const right = DIVERGE[i + 1];
    if (left && right && u >= left.u && u <= right.u) {
      a = left;
      b = right;
      break;
    }
  }
  const span = b.u - a.u || 1;
  const t = (u - a.u) / span;
  return [
    Math.round(a.rgb[0] + (b.rgb[0] - a.rgb[0]) * t),
    Math.round(a.rgb[1] + (b.rgb[1] - a.rgb[1]) * t),
    Math.round(a.rgb[2] + (b.rgb[2] - a.rgb[2]) * t),
  ];
}

export function centroid(geom: Geom): { x: number; y: number } {
  let x = 0;
  let y = 0;
  for (const v of geom.vertices) {
    x += v.x;
    y += v.y;
  }
  const n = geom.vertices.length || 1;
  return { x: x / n, y: y / n };
}
