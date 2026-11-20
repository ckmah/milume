import {
  TRANSECT_METHOD,
  type Band,
  type Cell,
  type CellField,
  type Field,
  type ProfileBin,
  type Stop,
} from "./types";

const BANDS: Band[] = ["low", "mid", "high"];

/**
 * Project a point onto the polyline through `stops`.
 * Distance is Euclidean in the landmark µm frame, not a cell graph.
 */
export function projectPoint(
  x: number,
  y: number,
  stops: readonly Pick<Stop, "x" | "y">[],
): CellField | null {
  if (stops.length < 2) return null;
  let bestD2 = Infinity;
  let best: CellField | null = null;
  for (let s = 0; s < stops.length - 1; s++) {
    const ax = stops[s].x;
    const ay = stops[s].y;
    const bx = stops[s + 1].x;
    const by = stops[s + 1].y;
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    if (len2 === 0) continue;
    let f = ((x - ax) * dx + (y - ay) * dy) / len2;
    if (f < 0) f = 0;
    else if (f > 1) f = 1;
    const px = ax + f * dx;
    const py = ay + f * dy;
    const ox = x - px;
    const oy = y - py;
    const d2 = ox * ox + oy * oy;
    if (d2 < bestD2) {
      bestD2 = d2;
      best = {
        t: s + f,
        offset: (dx * oy - dy * ox) / Math.sqrt(len2),
        segment: s,
      };
    }
  }
  return best;
}

export function transectField(cells: readonly Cell[], ordered: readonly Stop[]): Field | null {
  if (ordered.length < 2) return null;
  const byIndex: CellField[] = [];
  for (const cell of cells) {
    const hit = projectPoint(cell.x, cell.y, ordered);
    if (!hit) return null;
    byIndex[cell.index] = hit;
  }
  return { method: TRANSECT_METHOD, byIndex, tMax: ordered.length - 1 };
}

export function profileBins(
  cells: readonly Cell[],
  field: Field,
  binCount = 8,
): ProfileBin[] {
  const n = Math.max(1, binCount);
  const span = field.tMax <= 0 ? 1 : field.tMax;
  const bins: ProfileBin[] = Array.from({ length: n }, (_, i) => ({
    t0: (span * i) / n,
    t1: (span * (i + 1)) / n,
    n: 0,
    geneMean: 0,
    bands: { low: 0, mid: 0, high: 0 },
  }));
  const geneSum = bins.map(() => 0);
  for (const cell of cells) {
    const pos = field.byIndex[cell.index];
    if (!pos) continue;
    let i = Math.floor((pos.t / span) * n);
    if (i >= n) i = n - 1;
    if (i < 0) i = 0;
    const bin = bins[i];
    bin.n += 1;
    bin.bands[cell.band] += 1;
    geneSum[i] += cell.gene;
  }
  for (let i = 0; i < n; i++) {
    bins[i].geneMean = bins[i].n ? geneSum[i] / bins[i].n : 0;
  }
  return bins;
}

export function orderStops(stops: readonly Stop[], ids: readonly string[]): Stop[] {
  const byId = new Map(stops.map((stop) => [stop.id, stop]));
  const ordered: Stop[] = [];
  for (const id of ids) {
    const stop = byId.get(id as Stop["id"]);
    if (stop) ordered.push(stop);
  }
  return ordered;
}

export function pointOnPath(stops: readonly Pick<Stop, "x" | "y">[], t: number): { x: number; y: number } | null {
  if (stops.length < 2) return null;
  const max = stops.length - 1;
  const clamped = Math.min(max, Math.max(0, t));
  const s = Math.min(max - 1, Math.floor(clamped));
  const f = clamped - s;
  const a = stops[s];
  const b = stops[s + 1];
  return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
}

export function bandColor(band: Band): string {
  if (band === "low") return "#f3e6d4";
  if (band === "mid") return "#e36a9a";
  return "#ff0099";
}

export function tColor(t: number, tMax: number): string {
  const u = tMax <= 0 ? 0 : Math.min(1, Math.max(0, t / tMax));
  const low = [243, 230, 212];
  const high = [255, 0, 153];
  const c = low.map((channel, i) => Math.round(channel + (high[i] - channel) * u));
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}

export { BANDS };
