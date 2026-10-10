import { decodeF32Base64, decodeI32Base64 } from "./binary";
import { GENE_COLORS, type GeneColumn, type GeneScaleMode } from "./helpers";

export type GeneExpressionPack = {
  n: number;
  geneColumns: GeneColumn[];
  activeGenes: string[];
  geneFormat: string;
  geneValuesB64: string;
  geneCscIndptrB64: string;
  geneCscIndicesB64: string;
  geneCscDataB64: string;
  geneScaleMode: GeneScaleMode;
  geneLog1p: boolean;
  geneExpressionLogged: boolean;
};

function geneUsesLog1p(pack: GeneExpressionPack) {
  return !!pack.geneLog1p && !pack.geneExpressionLogged;
}

function geneMeta(pack: GeneExpressionPack, geneName: string) {
  return pack.geneColumns.find((g) => g.name === geneName) ?? null;
}

function geneColumnIndex(pack: GeneExpressionPack, geneName: string) {
  return pack.geneColumns.findIndex((g) => g.name === geneName);
}

type GeneDense = { dense: Float32Array | null; nGenes: number };

let cscDenseCache: { key: string; dense: Float32Array | null } | null = null;

function ensureGeneDenseFromCsc(pack: GeneExpressionPack, n: number): Float32Array | null {
  if (pack.geneFormat !== "csc" || !pack.geneCscIndptrB64) return null;
  const key = [
    pack.geneCscIndptrB64,
    pack.geneCscIndicesB64,
    pack.geneCscDataB64,
    n,
    pack.geneColumns.length,
  ].join("|");
  if (cscDenseCache?.key === key) return cscDenseCache.dense;
  const indptr = decodeI32Base64(pack.geneCscIndptrB64);
  const indices = decodeI32Base64(pack.geneCscIndicesB64);
  const data = decodeF32Base64(pack.geneCscDataB64);
  const nGenes = Math.max(0, indptr.length - 1);
  if (!nGenes || !indptr.length) {
    cscDenseCache = { key, dense: new Float32Array(0) };
    return cscDenseCache.dense;
  }
  const dense = new Float32Array(nGenes * n);
  for (let gi = 0; gi < nGenes; gi++) {
    const start = indptr[gi]!;
    const end = indptr[gi + 1]!;
    const col = gi * n;
    for (let p = start; p < end; p++) {
      const i = indices[p]!;
      if (i >= 0 && i < n) dense[col + i] = data[p] || 0;
    }
  }
  cscDenseCache = { key, dense };
  return dense;
}

function genePackedAt(pack: GeneExpressionPack, dense: GeneDense, i: number, gi: number): number | null {
  const n = pack.n;
  if (gi < 0 || i < 0 || i >= n) return null;
  if (pack.geneFormat === "csc" && pack.geneCscIndptrB64) {
    const fromCsc = ensureGeneDenseFromCsc(pack, n);
    if (!fromCsc) return 0;
    if (gi >= dense.nGenes) return null;
    return fromCsc[gi * n + i] || 0;
  }
  if (!pack.geneValuesB64) return null;
  const values = decodeF32Base64(pack.geneValuesB64);
  const nGenes = pack.geneColumns.length || dense.nGenes;
  if (!nGenes || values.length < n * nGenes) {
    const active = pack.activeGenes;
    if (values.length === n * active.length) {
      const ai = active.indexOf(pack.geneColumns[gi]?.name ?? "");
      if (ai < 0) return null;
      return values[ai * n + i];
    }
    return null;
  }
  return values[gi * n + i];
}

function geneIntensity(t01: number, vmin: number, vmax: number, log1p: boolean) {
  const lo = Number.isFinite(vmin) ? vmin : 0;
  const hi = Number.isFinite(vmax) && vmax > lo ? vmax : lo + 1;
  const t = Math.max(0, Math.min(1, t01));
  const raw = Math.max(0, lo + t * (hi - lo));
  return log1p ? Math.log1p(raw) : raw;
}

function geneCeiling(vmin: number, vmax: number, log1p: boolean) {
  const lo = Number.isFinite(vmin) ? vmin : 0;
  const hi = Number.isFinite(vmax) && vmax > lo ? vmax : lo + 1;
  const top = Math.max(0, hi);
  const bot = Math.max(0, lo);
  if (log1p) {
    const a = Math.log1p(bot);
    const b = Math.log1p(top);
    return b > a ? b : b + 1e-6;
  }
  return top > bot ? top : top + 1e-6;
}

function geneFloor(vmin: number, _vmax: number, log1p: boolean) {
  const lo = Number.isFinite(vmin) ? vmin : 0;
  const bot = Math.max(0, lo);
  return log1p ? Math.log1p(bot) : bot;
}

function scaledGeneT(
  pack: GeneExpressionPack,
  dense: GeneDense,
  i: number,
  geneName: string,
  sharedCeiling: number,
) {
  const meta = geneMeta(pack, geneName);
  if (!meta) return 0;
  const gi = geneColumnIndex(pack, geneName);
  const t01 = genePackedAt(pack, dense, i, gi);
  if (t01 == null) return 0;
  const log1p = geneUsesLog1p(pack);
  const vmin = meta.vmin ?? 0;
  const vmax = meta.vmax ?? 1;
  const intensity = geneIntensity(t01, vmin, vmax, log1p);
  if (pack.geneScaleMode === "shared") {
    const ceil = sharedCeiling > 0 ? sharedCeiling : geneCeiling(vmin, vmax, log1p);
    return Math.max(0, Math.min(1, intensity / ceil));
  }
  const floor = geneFloor(vmin, vmax, log1p);
  const ceil = geneCeiling(vmin, vmax, log1p);
  if (ceil <= floor) return 0;
  return Math.max(0, Math.min(1, (intensity - floor) / (ceil - floor)));
}

function sharedGeneCeiling(pack: GeneExpressionPack) {
  let max = 0;
  const log1p = geneUsesLog1p(pack);
  for (const name of pack.activeGenes) {
    const meta = geneMeta(pack, name);
    if (!meta) continue;
    max = Math.max(max, geneCeiling(meta.vmin ?? 0, meta.vmax ?? 1, log1p));
  }
  return max;
}

function parseHexRgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const LOW_EXPR_SRGB: [number, number, number] = [107, 114, 128];

function srgbToLinearByte(c: number): number {
  const s = c / 255;
  const linear = s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  return Math.round(linear * 255);
}

/** sRGB 0–255 → linear RGB bytes for the cell LUT (matches category palette path). */
export function srgbBytesToLinear(rgb: [number, number, number]): [number, number, number] {
  return [srgbToLinearByte(rgb[0]), srgbToLinearByte(rgb[1]), srgbToLinearByte(rgb[2])];
}

/**
 * sRGB bytes for one point, matching ``blendGeneColors`` in ``landmarks.js``.
 */
export function blendGeneSrgb(
  pack: GeneExpressionPack,
  pointIndex: number,
): [number, number, number] {
  const active = pack.activeGenes;
  if (!active.length || pointIndex < 0 || pointIndex >= pack.n) {
    return LOW_EXPR_SRGB;
  }
  const dense: GeneDense = {
    dense: null,
    nGenes: pack.geneColumns.length,
  };
  const shared =
    pack.geneScaleMode === "shared" ? sharedGeneCeiling(pack) : 0;
  let r = 0;
  let g = 0;
  let b = 0;
  let w = 0;
  for (let ai = 0; ai < active.length; ai++) {
    const t = scaledGeneT(pack, dense, pointIndex, active[ai]!, shared);
    if (!(t > 0)) continue;
    const rgb = parseHexRgb(GENE_COLORS[ai % GENE_COLORS.length]);
    r += rgb[0] * t;
    g += rgb[1] * t;
    b += rgb[2] * t;
    w += t;
  }
  if (w < 1e-6) return LOW_EXPR_SRGB;
  return [
    Math.min(255, Math.round(r)),
    Math.min(255, Math.round(g)),
    Math.min(255, Math.round(b)),
  ];
}
