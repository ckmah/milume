/** Pseudospace field: geometry distance to ordered landmarks (no graph walk). */

import { PSEUDOSPACE_COLORS } from "../../../../milume/static/pseudospace-colors.js";

export { PSEUDOSPACE_COLORS };

export type GeomKind = "point" | "line" | "spline" | "shape";

export type Geom = {
  id: string;
  kind: GeomKind;
  vertices: { x: number; y: number }[];
};

export type Cell = { x: number; y: number };

function hypot(ax: number, ay: number, bx: number, by: number) {
  return Math.hypot(ax - bx, ay - by);
}

function closestOnSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return { x: ax, y: ay };
  let t = ((px - ax) * dx + (py - ay) * dy) / len2;
  if (t < 0) t = 0;
  else if (t > 1) t = 1;
  return { x: ax + t * dx, y: ay + t * dy };
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

function closestPoint(x: number, y: number, geom: Geom): { x: number; y: number } | null {
  const vertices = polyline(geom);
  if (!vertices.length) return null;
  const first = vertices[0];
  if (!first) return null;
  if (vertices.length === 1) return { x: first.x, y: first.y };
  let bestD = Infinity;
  let best = { x: first.x, y: first.y };
  const closed = geom.kind === "shape";
  const n = closed ? vertices.length : vertices.length - 1;
  for (let i = 0; i < n; i++) {
    const a = vertices[i];
    const b = vertices[(i + 1) % vertices.length];
    if (!a || !b) continue;
    const point = closestOnSegment(x, y, a.x, a.y, b.x, b.y);
    const d = hypot(x, y, point.x, point.y);
    if (d < bestD) {
      bestD = d;
      best = point;
    }
  }
  return best;
}

function distanceToGeometry(x: number, y: number, geom: Geom) {
  const point = closestPoint(x, y, geom);
  if (!point) return Infinity;
  return hypot(x, y, point.x, point.y);
}

/**
 * t = 0 at the closest point on the first geometry of the pair, t = 1 at the
 * closest point on the second. t < 0 is beyond the first, t > 1 beyond the second.
 */
function pairProjection(cell: Cell, first: Geom, second: Geom): number {
  const c0 = closestPoint(cell.x, cell.y, first);
  const c1 = closestPoint(cell.x, cell.y, second);
  if (!c0 || !c1) return Number.NaN;
  const dx = c1.x - c0.x;
  const dy = c1.y - c0.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return 0;
  return ((cell.x - c0.x) * dx + (cell.y - c0.y) * dy) / len2;
}

function distanceColumn(cells: readonly Cell[], geom: Geom): Float64Array {
  const dist = new Float64Array(cells.length);
  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i];
    dist[i] = cell ? distanceToGeometry(cell.x, cell.y, geom) : Infinity;
  }
  return dist;
}

/**
 * Value is 0 at the first landmark and `ordered.length - 1` at the last.
 * Each cell uses Euclidean distance to landmark geometry (point / segment / shape).
 * A cell whose nearest pair is the first and whose projection t is < 0, or whose
 * nearest pair is the last and t is > 1, is outside the span and gets NaN.
 * Display labels are 1-based and are not this number.
 */
export function pseudospaceField(cells: readonly Cell[], ordered: readonly Geom[]): { values: Float64Array; valueMax: number } | null {
  if (ordered.length < 2 || !cells.length) return null;
  const columns = ordered.map((geom) => distanceColumn(cells, geom));
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
    const cell = cells[index];
    const geom0 = ordered[pair];
    const geom1 = ordered[pair + 1];
    if (!cell || !geom0 || !geom1 || !Number.isFinite(d0) || !Number.isFinite(d1)) {
      values[index] = Number.NaN;
      continue;
    }
    const t = pairProjection(cell, geom0, geom1);
    const beyondStart = pair === 0 && t < 0;
    const beyondEnd = pair === ordered.length - 2 && t > 1;
    if (!Number.isFinite(t) || beyondStart || beyondEnd) {
      values[index] = Number.NaN;
      continue;
    }
    const frac = d0 + d1 === 0 ? 0 : d0 / (d0 + d1);
    values[index] = pair + frac;
  }
  return { values, valueMax: ordered.length - 1 };
}

const RAMP = PSEUDOSPACE_COLORS.ramp;

export function pseudospaceRgb(value: number, valueMax: number, dark: boolean): [number, number, number] {
  if (!Number.isFinite(value)) {
    const neutral = dark ? PSEUDOSPACE_COLORS.neutral.dark : PSEUDOSPACE_COLORS.neutral.light;
    return [neutral[0], neutral[1], neutral[2]];
  }
  return divergingRgb(value, valueMax);
}

export function divergingRgb(value: number, valueMax: number): [number, number, number] {
  const u = valueMax <= 0 ? 0 : Math.min(1, Math.max(0, value / valueMax));
  let a = RAMP[0]!;
  let b = RAMP[RAMP.length - 1]!;
  for (let i = 0; i < RAMP.length - 1; i++) {
    const left = RAMP[i];
    const right = RAMP[i + 1];
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