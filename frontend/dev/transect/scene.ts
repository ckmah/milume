import { decodeF32Base64, decodeI32Base64 } from "@/widgets/landmarks/binary";

import { stopId, type Band, type Cell, type Scene, type Stop } from "./types";

type LandmarkRaw = {
  id?: unknown;
  type?: unknown;
  vertices?: unknown;
};

type CategoryCol = {
  name?: unknown;
  labels?: unknown;
};

function num(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function pair(value: unknown): [number, number] | null {
  if (!Array.isArray(value) || value.length < 2) return null;
  const x = num(value[0], Number.NaN);
  const y = num(value[1], Number.NaN);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return [x, y];
}

function stopsFromLandmarks(raw: unknown): Stop[] {
  if (!Array.isArray(raw)) return [];
  const stops: Stop[] = [];
  for (const item of raw as LandmarkRaw[]) {
    const landmarkId = String(item?.id ?? "landmark");
    const vertices = Array.isArray(item?.vertices) ? item.vertices : [];
    const points = vertices.map(pair).filter((p): p is [number, number] => p != null);
    if (!points.length) continue;
    const single = points.length === 1 || item?.type === "point";
    const use = single ? [points[0]] : points;
    use.forEach((xy, vertexIndex) => {
      const id = single ? landmarkId : `${landmarkId}#${vertexIndex}`;
      stops.push({
        id: stopId(id),
        label: single ? landmarkId : `${landmarkId} ${vertexIndex + 1}`,
        x: xy[0],
        y: xy[1],
        landmarkId,
        vertexIndex,
      });
    });
  }
  return stops;
}

function geneVector(
  indptr: Int32Array,
  indices: Int32Array,
  data: Float32Array,
  geneIndex: number,
  nObs: number,
): Float32Array {
  const out = new Float32Array(nObs);
  if (geneIndex < 0 || geneIndex + 1 >= indptr.length) return out;
  const a = indptr[geneIndex] ?? 0;
  const b = indptr[geneIndex + 1] ?? a;
  for (let k = a; k < b; k++) {
    const row = indices[k];
    if (row >= 0 && row < nObs) out[row] = data[k] ?? 0;
  }
  return out;
}

function tertile(values: Float32Array): Band[] {
  const sorted = Array.from(values).sort((a, b) => a - b);
  const lo = sorted[Math.floor(sorted.length / 3)] ?? 0;
  const hi = sorted[Math.floor((2 * sorted.length) / 3)] ?? lo;
  return Array.from(values, (value) => {
    if (value <= lo) return "low";
    if (value <= hi) return "mid";
    return "high";
  });
}

function um(nx: number, bounds: number[]): number {
  const lo = bounds[0] ?? 0;
  const hi = bounds[1] ?? lo + 1;
  return lo + ((nx + 1) / 2) * (hi - lo);
}

/**
 * Parse a harness model snapshot. `region` on the xsmall fixture is one label,
 * so composition bands are tertiles of a real gene column.
 */
export function sceneFromState(state: Record<string, unknown>): Scene {
  const xBounds = Array.isArray(state.x_bounds) ? (state.x_bounds as number[]) : [0, 1];
  const yBounds = Array.isArray(state.y_bounds) ? (state.y_bounds as number[]) : [0, 1];
  const pts = decodeF32Base64(String(state.points_data ?? ""));
  const nObs = Math.floor(pts.length / 4);

  const columns = (state._category_columns ?? state.category_columns) as CategoryCol[] | undefined;
  const col = Array.isArray(columns) ? columns[0] : undefined;
  const categoryName = String(col?.name ?? "category");
  const labels = Array.isArray(col?.labels) ? col.labels.map(String) : [];
  const codes = decodeI32Base64(String(state._category_codes ?? state.category_codes ?? ""));

  const options = (state._color_options ?? {}) as { genes?: { name?: string }[] };
  const geneNames = (options.genes ?? (state.gene_names as { name?: string }[] | undefined) ?? [])
    .map((gene) => String(gene?.name ?? ""))
    .filter(Boolean);
  const codec = String(state.gene_csc_codec ?? "");
  if (codec === "gzip") {
    throw new Error("transect prototype expects uncompressed gene CSC in fixture.json");
  }
  const indptr = decodeI32Base64(String(state.gene_csc_indptr ?? ""));
  const indices = decodeI32Base64(String(state.gene_csc_indices ?? ""));
  const data = decodeF32Base64(String(state.gene_csc_data ?? ""));

  let geneName = geneNames.includes("Aldoc") ? "Aldoc" : (geneNames[0] ?? "gene");
  let values = geneVector(indptr, indices, data, geneNames.indexOf(geneName), nObs);
  let nnz = 0;
  for (let i = 0; i < values.length; i++) if (values[i]) nnz += 1;
  if (!nnz) {
    for (let g = 0; g < geneNames.length; g++) {
      const next = geneVector(indptr, indices, data, g, nObs);
      let count = 0;
      for (let i = 0; i < next.length; i++) if (next[i]) count += 1;
      if (count > nnz) {
        nnz = count;
        values = next;
        geneName = geneNames[g] ?? geneName;
      }
    }
  }

  const bands = tertile(values);
  const cells: Cell[] = [];
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  for (let i = 0; i < nObs; i++) {
    const x = um(pts[i * 4] ?? 0, xBounds);
    const y = um(pts[i * 4 + 1] ?? 0, yBounds);
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
    const code = codes[i] ?? 0;
    cells.push({
      index: i,
      x,
      y,
      category: labels[code] ?? categoryName,
      band: bands[i] ?? "low",
      gene: values[i] ?? 0,
    });
  }

  const stops = stopsFromLandmarks(state.landmarks);
  for (const stop of stops) {
    if (stop.x < x0) x0 = stop.x;
    if (stop.x > x1) x1 = stop.x;
    if (stop.y < y0) y0 = stop.y;
    if (stop.y > y1) y1 = stop.y;
  }

  const oneLabel = labels.length <= 1;
  return {
    cells,
    stops,
    geneName,
    categoryName,
    compositionNote: oneLabel
      ? `${categoryName} has one label in this fixture. Bars are ${geneName} tertiles from the same cells.`
      : `Bars are ${categoryName}.`,
    bounds: {
      x0: Number.isFinite(x0) ? x0 : 0,
      x1: Number.isFinite(x1) ? x1 : 1,
      y0: Number.isFinite(y0) ? y0 : 0,
      y1: Number.isFinite(y1) ? y1 : 1,
    },
  };
}

export function sceneFromModel(model: { get(key: string): unknown }): Scene {
  const keys = [
    "landmarks",
    "points_data",
    "x_bounds",
    "y_bounds",
    "_category_columns",
    "category_columns",
    "_category_codes",
    "category_codes",
    "_color_options",
    "gene_names",
    "gene_csc_indptr",
    "gene_csc_indices",
    "gene_csc_data",
    "gene_csc_codec",
  ];
  const state: Record<string, unknown> = {};
  for (const key of keys) state[key] = model.get(key);
  return sceneFromState(state);
}
