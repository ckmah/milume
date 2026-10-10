import { blendGeneSrgb as blendGeneSrgbCore } from "../../../../milume/static/gene-expression-blend.js";

import { decodeF32Base64, decodeI32Base64 } from "./binary";
import type { GeneColumn, GeneScaleMode } from "./helpers";

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

function srgbToLinearByte(c: number): number {
  const s = c / 255;
  const linear = s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  return Math.round(linear * 255);
}

/** sRGB 0–255 → linear RGB bytes for the cell LUT (matches category palette path). */
export function srgbBytesToLinear(rgb: [number, number, number]): [number, number, number] {
  return [srgbToLinearByte(rgb[0]), srgbToLinearByte(rgb[1]), srgbToLinearByte(rgb[2])];
}

/** sRGB bytes for one point (shared scaling with `blendGeneColors` in landmarks.js). */
export function blendGeneSrgb(
  pack: GeneExpressionPack,
  pointIndex: number,
): [number, number, number] {
  if (!pack.activeGenes.length || pointIndex < 0 || pointIndex >= pack.n) {
    return [107, 114, 128];
  }
  const dense: GeneDense = {
    dense: null,
    nGenes: pack.geneColumns.length,
  };
  const log1p = geneUsesLog1p(pack);
  return blendGeneSrgbCore({
    activeGenes: pack.activeGenes,
    pointIndex,
    scaleMode: pack.geneScaleMode,
    log1p,
    valueAt: (i, geneName) => {
      const gi = geneColumnIndex(pack, geneName);
      if (gi < 0) return null;
      return genePackedAt(pack, dense, i, gi);
    },
    metaAt: (geneName) => geneMeta(pack, geneName),
  }) as [number, number, number];
}
