import { GENE_COLORS } from "../helpers";
import type { CategoryColumn, SelectionItem } from "../helpers";
import { decodeF32Base64, decodeI32Base64 } from "../binary";
import { typeFocusIndicesFromState } from "../type-focus";
import { CLOUD_CUBE, isoProject, mixChannelRgb } from "./rgb-cube";

export type CompositionSlice = {
  key: string;
  label: string;
  value: number;
  fill: string;
};

export type DensitySeries = {
  key: string;
  label: string;
  color: string;
};

export type DensityRow = {
  x: number;
} & Record<string, number>;

function pointInRing(
  x: number,
  y: number,
  ring: ArrayLike<number> | number[][],
): boolean {
  // ring as [[x,y], ...]
  const n = (ring as number[][]).length;
  if (n < 3) return false;
  let inside = false;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = (ring as number[][])[i][0];
    const yi = (ring as number[][])[i][1];
    const xj = (ring as number[][])[j][0];
    const yj = (ring as number[][])[j][1];
    const intersect =
      yi > y !== yj > y &&
      x < ((xj - xi) * (y - yi)) / (yj - yi + Number.EPSILON) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/** Indices of points in the current selection / type focus (or all). */
export function resolvePointMask(opts: {
  n: number;
  selectedKind: string;
  selectedIndex: number;
  selectedTypeIndices?: number[];
  selections: SelectionItem[];
  pointsDataB64: string;
  categoryCodesB64: string;
  categoryColumns: CategoryColumn[];
  activeCategory: string;
  /** When false, type focus does not narrow the mask (for full donut + slice highlight). */
  filterByType?: boolean;
}): Uint8Array {
  const {
    n,
    selectedKind,
    selectedIndex,
    selectedTypeIndices,
    selections,
    pointsDataB64,
    categoryCodesB64,
    categoryColumns,
    activeCategory,
    filterByType = true,
  } = opts;
  const mask = new Uint8Array(n);
  mask.fill(1);

  if (filterByType && selectedKind === "type") {
    const typeIx = typeFocusIndicesFromState({
      selected_kind: selectedKind,
      selected_index: selectedIndex,
      selected_type_indices: selectedTypeIndices,
    });
    if (!typeIx.length) return mask;
    const colIdx = categoryColumns.findIndex((c) => c.name === activeCategory);
    if (colIdx < 0 || !categoryCodesB64) {
      mask.fill(0);
      return mask;
    }
    const codes = decodeI32Base64(categoryCodesB64);
    const want = new Set(typeIx);
    for (let i = 0; i < n; i++) {
      mask[i] = want.has(codes[colIdx * n + i]) ? 1 : 0;
    }
    return mask;
  }

  if (selectedKind === "selection" && selectedIndex >= 0) {
    const sel = selections[selectedIndex];
    const rawIdx = sel?.point_indices;
    if (Array.isArray(rawIdx) && rawIdx.length) {
      mask.fill(0);
      for (let i = 0; i < rawIdx.length; i++) {
        const idx = Number(rawIdx[i]);
        if (Number.isInteger(idx) && idx >= 0 && idx < n) mask[idx] = 1;
      }
      return mask;
    }
    const verts = (sel?.vertices as number[][] | undefined) || [];
    if (verts.length < 3 || !pointsDataB64) {
      mask.fill(0);
      return mask;
    }
    const pts = decodeF32Base64(pointsDataB64);
    // points_data: Nx4 float32 [x, y, …]
    for (let i = 0; i < n; i++) {
      const x = pts[i * 4];
      const y = pts[i * 4 + 1];
      mask[i] = pointInRing(x, y, verts) ? 1 : 0;
    }
    return mask;
  }

  return mask;
}

export function compositionSlices(opts: {
  n: number;
  mask: Uint8Array;
  categoryCodesB64: string;
  categoryColumns: CategoryColumn[];
  activeCategory: string;
}): CompositionSlice[] {
  const { n, mask, categoryCodesB64, categoryColumns, activeCategory } = opts;
  const colIdx = categoryColumns.findIndex((c) => c.name === activeCategory);
  const col = colIdx >= 0 ? categoryColumns[colIdx] : null;
  if (!col || !categoryCodesB64 || n <= 0) return [];

  const labels = col.labels || [];
  const palette = col.palette || [];
  const codes = decodeI32Base64(categoryCodesB64);
  const counts = new Array(labels.length).fill(0);
  for (let i = 0; i < n; i++) {
    if (!mask[i]) continue;
    const c = codes[colIdx * n + i];
    if (c >= 0 && c < counts.length) counts[c] += 1;
  }
  return labels
    .map((label: string, i: number) => ({
      key: `c${i}`,
      label,
      value: counts[i] as number,
      fill: palette[i % Math.max(palette.length, 1)] || "var(--muted-foreground)",
    }))
    .filter((s: CompositionSlice) => s.value > 0);
}

/** Smooth density curves for active genes (Gaussian KDE).
 * Axis domain follows selected-gene display bounds when provided so ticks
 * update with the gene set; otherwise uses the observed sample range.
 *
 * Gene packs are catalog col-major (dense ``gene_values`` or CSC). Active
 * genes are resolved through ``geneColumns`` name → column index.
 */
export function geneDensities(opts: {
  n: number;
  mask: Uint8Array;
  geneValuesB64: string;
  activeGenes: string[];
  geneLog1p: boolean;
  /** Catalog metadata; required to map active names → packed columns. */
  geneColumns?: Array<{ name: string }>;
  geneFormat?: string;
  geneCscIndptrB64?: string;
  geneCscIndicesB64?: string;
  geneCscDataB64?: string;
  /** Per-gene display bounds (same scale as samples when log1p). */
  geneBounds?: Array<{ lo: number; hi: number }>;
  bins?: number;
}): { series: DensitySeries[]; rows: DensityRow[]; xMin: number; xMax: number } {
  const {
    n,
    mask,
    geneValuesB64,
    activeGenes,
    geneLog1p,
    geneColumns = [],
    geneFormat = "dense",
    geneCscIndptrB64 = "",
    geneCscIndicesB64 = "",
    geneCscDataB64 = "",
    geneBounds,
    bins = 48,
  } = opts;
  const series: DensitySeries[] = activeGenes.map((name, i) => ({
    key: `g${i}`,
    label: name,
    color: GENE_COLORS[i % GENE_COLORS.length],
  }));
  if (!series.length || n <= 0) {
    return { series, rows: [], xMin: 0, xMax: 1 };
  }

  const colIndex = new Map(
    geneColumns.map((c, i) => [String(c.name), i] as const),
  );
  const catalogIdx = activeGenes.map((name) => colIndex.get(name) ?? -1);

  /** Value for active-series gene g at observation i (display-normalized). */
  let valueAt: (g: number, i: number) => number;
  if (geneFormat === "csc" && geneCscIndptrB64) {
    const indptr = decodeI32Base64(geneCscIndptrB64);
    const indices = decodeI32Base64(geneCscIndicesB64);
    const data = decodeF32Base64(geneCscDataB64);
    // Densify selected columns once (catalog may be sparse).
    const dense = new Float32Array(series.length * n);
    for (let g = 0; g < series.length; g++) {
      const gi = catalogIdx[g];
      if (gi < 0 || gi + 1 >= indptr.length) continue;
      const start = indptr[gi] | 0;
      const end = indptr[gi + 1] | 0;
      const off = g * n;
      for (let p = start; p < end; p++) {
        const i = indices[p] | 0;
        if (i >= 0 && i < n) dense[off + i] = data[p] || 0;
      }
    }
    valueAt = (g, i) => dense[g * n + i];
  } else if (geneValuesB64) {
    const values = decodeF32Base64(geneValuesB64);
    const nGenes =
      geneColumns.length || Math.floor(values.length / Math.max(n, 1));
    valueAt = (g, i) => {
      const gi = catalogIdx[g];
      if (gi < 0) return NaN;
      // Catalog col-major. Legacy: packed columns == active_genes order.
      if (values.length >= n * nGenes && nGenes > 0) {
        return values[gi * n + i];
      }
      if (values.length >= n * series.length) {
        return values[g * n + i];
      }
      return NaN;
    };
  } else {
    return { series, rows: [], xMin: 0, xMax: 1 };
  }

  const samples: number[][] = series.map(() => []);
  let obsLo = Infinity;
  let obsHi = -Infinity;
  for (let g = 0; g < series.length; g++) {
    for (let i = 0; i < n; i++) {
      if (!mask[i]) continue;
      let v = valueAt(g, i);
      if (!Number.isFinite(v)) continue;
      if (geneLog1p) v = Math.log1p(v);
      samples[g].push(v);
      if (v < obsLo) obsLo = v;
      if (v > obsHi) obsHi = v;
    }
  }

  if (!(obsHi > obsLo) || !Number.isFinite(obsLo) || !Number.isFinite(obsHi)) {
    obsLo = 0;
    obsHi = geneLog1p ? Math.log1p(1) : 1;
    if (geneBounds?.length) {
      let bLo = Infinity;
      let bHi = -Infinity;
      for (const b of geneBounds) {
        if (Number.isFinite(b.lo)) bLo = Math.min(bLo, b.lo);
        if (Number.isFinite(b.hi)) bHi = Math.max(bHi, b.hi);
      }
      if (Number.isFinite(bLo) && Number.isFinite(bHi) && bHi > bLo) {
        obsLo = bLo;
        obsHi = bHi;
      }
    }
  }

  // Domain tracks the selected genes' observed mass so ticks update with the set.
  let xMin = obsLo;
  let xMax = obsHi;
  if (geneBounds?.length) {
    let bHi = -Infinity;
    for (const b of geneBounds) {
      if (Number.isFinite(b.hi)) bHi = Math.max(bHi, b.hi);
    }
    // Extend to gene display max when the selection under-samples the scale.
    if (Number.isFinite(bHi) && bHi > xMax) xMax = bHi;
  }

  const pad = (xMax - xMin) * 0.04 || 1e-3;
  xMin -= pad;
  xMax += pad;
  if (!geneLog1p && xMin < 0) xMin = 0;

  const span = xMax - xMin;
  const bandwidth = Math.max(span / 24, 1e-3);
  const rows: DensityRow[] = [];
  for (let b = 0; b < bins; b++) {
    const x = xMin + (b / (bins - 1)) * span;
    const row: DensityRow = { x };
    for (let g = 0; g < series.length; g++) {
      const pts = samples[g];
      if (!pts.length) {
        row[series[g].key] = 0;
        continue;
      }
      let density = 0;
      const inv = 1 / (bandwidth * Math.sqrt(2 * Math.PI));
      const twoBw2 = 2 * bandwidth * bandwidth;
      for (const v of pts) {
        const d = x - v;
        density += inv * Math.exp(-(d * d) / twoBw2);
      }
      row[series[g].key] = density / pts.length;
    }
    rows.push(row);
  }
  return { series, rows, xMin, xMax };
}

/** ~3 nice tick values spanning [lo, hi] for ridge / scale axes. */
export function niceAxisTicks(lo: number, hi: number, target = 3): number[] {
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return [];
  if (!(hi > lo)) return [lo];
  const span = hi - lo;
  const rough = span / Math.max(target - 1, 1);
  const exp = Math.floor(Math.log10(Math.max(rough, 1e-12)));
  const pow = 10 ** exp;
  const norm = rough / pow;
  const niceNorm =
    norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10;
  const step = niceNorm * pow;
  const start = Math.ceil(lo / step - 1e-9) * step;
  const ticks: number[] = [];
  for (let v = start; v <= hi + step * 1e-6; v += step) {
    ticks.push(Number(v.toPrecision(12)));
    if (ticks.length > 8) break;
  }
  if (ticks.length < 2) return [lo, hi];
  const eps = span * 1e-6;
  if (Math.abs(ticks[0] - lo) > step * 0.35) ticks.unshift(lo);
  if (Math.abs(ticks[ticks.length - 1] - hi) > step * 0.35) ticks.push(hi);
  if (ticks.length <= 4) return ticks;
  return [ticks[0], ticks[Math.floor((ticks.length - 1) / 2)], ticks[ticks.length - 1]].filter(
    (v, i, a) => i === 0 || Math.abs(v - a[i - 1]) > eps,
  );
}

export type EmbeddingCloudPoint = {
  x: number;
  y: number;
  color: string;
  /** True when in focus, or when nothing is focused (uniform style). */
  selected: boolean;
};

/** Match landmarks.js point-role emphasis while a type/selection is focused. */
export const CLOUD_SELECTED_SIZE_SCALE = 1.28;
export const CLOUD_OTHER_SIZE_SCALE = 0.55;
export const CLOUD_OTHER_ALPHA_SCALE = 0.28;

/** Sample cells onto the isometric RGB cube (3 independent channels). */
export function embeddingRgbCloud(opts: {
  n: number;
  /** Universe to sample from (usually all cells). */
  mask: Uint8Array;
  /** When hasFocus, points with focusMask[i]=1 are emphasized. */
  focusMask?: Uint8Array;
  hasFocus?: boolean;
  embeddingValuesB64: string;
  nChannels: number;
  maxPoints?: number;
}): EmbeddingCloudPoint[] {
  const {
    n,
    mask,
    focusMask,
    hasFocus = false,
    embeddingValuesB64,
    nChannels,
    maxPoints = 400,
  } = opts;
  if (!embeddingValuesB64 || n <= 0 || nChannels <= 0) return [];
  const values = decodeF32Base64(embeddingValuesB64);
  if (values.length < n * nChannels) return [];

  const idxs: number[] = [];
  for (let i = 0; i < n; i++) if (mask[i]) idxs.push(i);
  if (!idxs.length) return [];

  const step = Math.max(1, Math.ceil(idxs.length / maxPoints));
  const out: EmbeddingCloudPoint[] = [];
  for (let k = 0; k < idxs.length; k += step) {
    const i = idxs[k];
    const ch = [0, 0, 0];
    for (let c = 0; c < Math.min(3, nChannels); c++) {
      ch[c] = Math.max(0, Math.min(1, values[c * n + i] || 0));
    }
    const { rr, gg, bb, sum } = mixChannelRgb(ch[0], ch[1], ch[2]);
    const p = isoProject(ch[0], ch[1], ch[2], CLOUD_CUBE);
    const selected = !hasFocus || !!(focusMask && focusMask[i]);
    out.push({
      x: p.x,
      y: p.y,
      color: sum > 1e-8 ? `rgb(${rr},${gg},${bb})` : "var(--muted-foreground)",
      selected,
    });
  }
  // Unselected under selected so emphasis reads on top.
  if (hasFocus) out.sort((a, b) => Number(a.selected) - Number(b.selected));
  return out;
}
