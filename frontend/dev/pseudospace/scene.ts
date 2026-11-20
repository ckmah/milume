import { decodeF32Base64, decodeI32Base64 } from "@/widgets/landmarks/binary";

import { landmarkId, type Band, type Cell, type GeneColumn, type Landmark, type LandmarkKind, type Scene } from "./types";

type LandmarkRaw = {
  id?: unknown;
  type?: unknown;
  vertices?: unknown;
};

type CategoryCol = {
  name?: unknown;
  labels?: unknown;
};

/**
 * Prototype-only closed shape. The xsmall fixture has a point and a line, and the
 * stills need a shape edge as well. It is not written back to the model.
 */
const HARNESS_SHAPE: Landmark = {
  id: landmarkId("harness-shape"),
  label: "harness-shape",
  kind: "shape",
  vertices: [
    { x: 908, y: -5135 },
    { x: 922, y: -5135 },
    { x: 922, y: -5048 },
    { x: 908, y: -5048 },
  ],
};

/** Prototype spline on the opposite side of the tissue from `harness-shape`. */
const HARNESS_SPLINE: Landmark = {
  id: landmarkId("harness-spline"),
  label: "harness-spline",
  kind: "spline",
  vertices: [
    { x: 980, y: -5130 },
    { x: 988, y: -5100 },
    { x: 978, y: -5070 },
    { x: 986, y: -5045 },
  ],
};

function num(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function pair(value: unknown): { x: number; y: number } | null {
  if (!Array.isArray(value) || value.length < 2) return null;
  const x = num(value[0], Number.NaN);
  const y = num(value[1], Number.NaN);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x, y };
}

function kindOf(type: unknown, count: number): LandmarkKind {
  if (type === "point" || type === "line" || type === "spline" || type === "shape") return type;
  return count <= 1 ? "point" : "line";
}

function landmarksFromState(raw: unknown): Landmark[] {
  const landmarks: Landmark[] = [];
  if (Array.isArray(raw)) {
    for (const item of raw as LandmarkRaw[]) {
      const id = String(item?.id ?? "landmark");
      const vertices = (Array.isArray(item?.vertices) ? item.vertices : []).map(pair).filter((p) => p != null);
      if (!vertices.length) continue;
      landmarks.push({
        id: landmarkId(id),
        label: id,
        kind: kindOf(item?.type, vertices.length),
        vertices,
      });
    }
  }
  if (!landmarks.some((landmark) => landmark.id === HARNESS_SHAPE.id)) landmarks.push(HARNESS_SHAPE);
  if (!landmarks.some((landmark) => landmark.id === HARNESS_SPLINE.id)) landmarks.push(HARNESS_SPLINE);
  return landmarks;
}

function geneVector(indptr: Int32Array, indices: Int32Array, data: Float32Array, geneIndex: number, nObs: number) {
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

function um(nx: number, bounds: number[]) {
  const lo = bounds[0] ?? 0;
  const hi = bounds[1] ?? lo + 1;
  return lo + ((nx + 1) / 2) * (hi - lo);
}

function text(state: Record<string, unknown>, underscored: string, plain: string) {
  const next = state[underscored];
  if (typeof next === "string" && next) return next;
  const old = state[plain];
  return typeof old === "string" ? old : "";
}

/** Parse a harness snapshot. The xsmall `region` column is one label, so bars use a gene. */
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
  const codec = text(state, "_gene_csc_codec", "gene_csc_codec");
  if (codec === "gzip") throw new Error("pseudospace prototype expects uncompressed gene CSC in fixture.json");
  const indptr = decodeI32Base64(text(state, "_gene_csc_indptr", "gene_csc_indptr"));
  const indices = decodeI32Base64(text(state, "_gene_csc_indices", "gene_csc_indices"));
  const data = decodeF32Base64(text(state, "_gene_csc_data", "gene_csc_data"));

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

  const genes: GeneColumn[] = geneNames.map((name, index) => ({
    name,
    values: geneVector(indptr, indices, data, index, nObs),
  }));
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

  const landmarks = landmarksFromState(state.landmarks);
  for (const landmark of landmarks) {
    for (const vertex of landmark.vertices) {
      if (vertex.x < x0) x0 = vertex.x;
      if (vertex.x > x1) x1 = vertex.x;
      if (vertex.y < y0) y0 = vertex.y;
      if (vertex.y > y1) y1 = vertex.y;
    }
  }

  const oneLabel = labels.length <= 1;
  return {
    cells,
    landmarks,
    genes,
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
    "_gene_csc_indptr",
    "_gene_csc_indices",
    "_gene_csc_data",
    "_gene_csc_codec",
    "gene_csc_indptr",
    "gene_csc_indices",
    "gene_csc_data",
    "gene_csc_codec",
  ];
  const state: Record<string, unknown> = {};
  for (const key of keys) state[key] = model.get(key);
  return sceneFromState(state);
}
