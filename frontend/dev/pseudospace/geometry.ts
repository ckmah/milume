import {
  KNN_K,
  PSEUDOSPACE_METHOD,
  type Band,
  type Cell,
  type CellField,
  type Field,
  type IsoSegment,
  type Landmark,
  type ProfileBin,
} from "./types";

const BANDS: Band[] = ["low", "mid", "high"];

type Edge = { to: number; w: number };

function hypot(ax: number, ay: number, bx: number, by: number) {
  return Math.hypot(ax - bx, ay - by);
}

/** Distance from a point to the segment AB. */
export function segmentDistance(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return hypot(px, py, ax, ay);
  let t = ((px - ax) * dx + (py - ay) * dy) / len2;
  if (t < 0) t = 0;
  else if (t > 1) t = 1;
  return hypot(px, py, ax + t * dx, ay + t * dy);
}

function pointInPolygon(px: number, py: number, vertices: readonly { x: number; y: number }[]) {
  let inside = false;
  for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
    const a = vertices[i];
    const b = vertices[j];
    if (!a || !b) continue;
    const cross = a.y > py !== b.y > py && px < ((b.x - a.x) * (py - a.y)) / (b.y - a.y || 1e-12) + a.x;
    if (cross) inside = !inside;
  }
  return inside;
}

/** Open centripetal-ish samples. Uniform Catmull-Rom is enough for a harness spline. */
function splinePolyline(vertices: readonly { x: number; y: number }[], steps = 8) {
  if (vertices.length < 3) return vertices.map((v) => ({ x: v.x, y: v.y }));
  const pts = vertices.map((v) => ({ x: v.x, y: v.y }));
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    if (!p0 || !p1 || !p2 || !p3) continue;
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      const t2 = t * t;
      const t3 = t2 * t;
      out.push({
        x: 0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
        y: 0.5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
      });
    }
  }
  const last = pts[pts.length - 1];
  if (last) out.push(last);
  return out;
}

function polyline(landmark: Landmark): { x: number; y: number }[] {
  if (landmark.kind === "spline") return splinePolyline(landmark.vertices);
  return landmark.vertices;
}

/** Euclidean distance to the landmark geometry. Shapes use the boundary, not the interior. */
export function distanceToGeometry(x: number, y: number, landmark: Landmark) {
  const vertices = polyline(landmark);
  if (!vertices.length) return Infinity;
  if (vertices.length === 1) return hypot(x, y, vertices[0].x, vertices[0].y);
  let best = Infinity;
  const closed = landmark.kind === "shape";
  const n = closed ? vertices.length : vertices.length - 1;
  for (let i = 0; i < n; i++) {
    const a = vertices[i];
    const b = vertices[(i + 1) % vertices.length];
    if (!a || !b) continue;
    best = Math.min(best, segmentDistance(x, y, a.x, a.y, b.x, b.y));
  }
  return best;
}

export function hitsLandmark(x: number, y: number, landmark: Landmark, tolerance: number) {
  if (landmark.kind === "shape" && pointInPolygon(x, y, landmark.vertices)) return true;
  return distanceToGeometry(x, y, landmark) <= tolerance;
}

export function landmarkCentroid(landmark: Landmark) {
  const vertices = landmark.vertices;
  let x = 0;
  let y = 0;
  for (const v of vertices) {
    x += v.x;
    y += v.y;
  }
  const n = vertices.length || 1;
  return { x: x / n, y: y / n };
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
      adj[i].push(edge);
      adj[edge.to].push({ to: i, w: edge.w });
    }
  }
  return adj;
}

/** Multi-source Dijkstra. Sources are cells on or next to the geometry. */
export function geodesicToLandmark(cells: readonly Cell[], adj: readonly Edge[][], landmark: Landmark): Float64Array {
  const eu = cells.map((cell) => distanceToGeometry(cell.x, cell.y, landmark));
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
      if (!used[i] && dist[i] < best) {
        best = dist[i];
        u = i;
      }
    }
    if (u < 0 || best === Infinity) break;
    used[u] = 1;
    for (const edge of adj[u] ?? []) {
      const next = dist[u] + edge.w;
      if (next < dist[edge.to]) dist[edge.to] = next;
    }
  }
  for (let i = 0; i < dist.length; i++) {
    if (!Number.isFinite(dist[i])) dist[i] = eu[i] ?? 0;
  }
  return dist;
}

function isolines(cells: readonly Cell[], adj: readonly Edge[][], values: readonly number[], valueMax: number): IsoSegment[] {
  const levels: number[] = [];
  for (let level = 0.5; level < valueMax; level += 1) levels.push(level);
  const seen = new Set<string>();
  const out: IsoSegment[] = [];
  for (let i = 0; i < cells.length; i++) {
    const a = cells[i];
    const va = values[i];
    if (!a || va == null) continue;
    for (const edge of adj[i] ?? []) {
      const key = i < edge.to ? `${i}:${edge.to}` : `${edge.to}:${i}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const b = cells[edge.to];
      const vb = values[edge.to];
      if (!b || vb == null) continue;
      for (const level of levels) {
        const cross = (va - level) * (vb - level);
        if (cross > 0 || va === vb) continue;
        const f = (level - va) / (vb - va);
        const x = a.x + (b.x - a.x) * f;
        const y = a.y + (b.y - a.y) * f;
        const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
        const nx = -(b.y - a.y) / len;
        const ny = (b.x - a.x) / len;
        const tick = 1.6;
        out.push({ x0: x - nx * tick, y0: y - ny * tick, x1: x + nx * tick, y1: y + ny * tick });
      }
    }
  }
  return out;
}

/**
 * Pseudospace between consecutive landmarks.
 * A cell belongs to the pair with the smallest d_k + d_k+1.
 * Its value is (pair index) + d_k / (d_k + d_k+1).
 * Cells past either end stay in [0, valueMax]. There is no side offset.
 */
export function pseudospaceField(cells: readonly Cell[], ordered: readonly Landmark[]): Field | null {
  if (ordered.length < 2 || !cells.length) return null;
  const adj = knn(cells, KNN_K);
  const columns = ordered.map((landmark) => geodesicToLandmark(cells, adj, landmark));
  const values: number[] = [];
  const byIndex: CellField[] = cells.map((_, index) => {
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
    const frac = d0 + d1 === 0 ? 0 : d0 / (d0 + d1);
    const value = pair + frac;
    values[index] = value;
    return {
      value,
      pair,
      distances: columns.map((column) => column[index] ?? 0),
    };
  });
  const valueMax = ordered.length - 1;
  return {
    method: PSEUDOSPACE_METHOD,
    byIndex,
    valueMax,
    isolines: isolines(cells, adj, values, valueMax),
  };
}

export function profileBins(cells: readonly Cell[], field: Field, binCount = 8): ProfileBin[] {
  const n = Math.max(1, binCount);
  const span = field.valueMax <= 0 ? 1 : field.valueMax;
  const bins: ProfileBin[] = Array.from({ length: n }, (_, i) => ({
    v0: (span * i) / n,
    v1: (span * (i + 1)) / n,
    n: 0,
    geneMean: 0,
    bands: { low: 0, mid: 0, high: 0 },
  }));
  const geneSum = bins.map(() => 0);
  for (const cell of cells) {
    const pos = field.byIndex[cell.index];
    if (!pos) continue;
    let i = Math.floor((pos.value / span) * n);
    if (i >= n) i = n - 1;
    if (i < 0) i = 0;
    const bin = bins[i];
    if (!bin) continue;
    bin.n += 1;
    bin.bands[cell.band] += 1;
    geneSum[i] = (geneSum[i] ?? 0) + cell.gene;
  }
  for (let i = 0; i < n; i++) {
    const bin = bins[i];
    if (!bin) continue;
    bin.geneMean = bin.n ? (geneSum[i] ?? 0) / bin.n : 0;
  }
  return bins;
}

export function orderLandmarks(landmarks: readonly Landmark[], ids: readonly string[]): Landmark[] {
  const byId = new Map(landmarks.map((landmark) => [landmark.id, landmark]));
  const ordered: Landmark[] = [];
  for (const id of ids) {
    const landmark = byId.get(id as Landmark["id"]);
    if (landmark) ordered.push(landmark);
  }
  return ordered;
}

export function bandColor(band: Band): string {
  if (band === "low") return "#f3e6d4";
  if (band === "mid") return "#e36a9a";
  return "#ff0099";
}

export function valueColor(value: number, valueMax: number): string {
  const u = valueMax <= 0 ? 0 : Math.min(1, Math.max(0, value / valueMax));
  const low = [243, 230, 212];
  const high = [255, 0, 153];
  const c = low.map((channel, i) => Math.round(channel + ((high[i] ?? channel) - channel) * u));
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}

export { BANDS };
