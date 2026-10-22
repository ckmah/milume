import { blendGeneSrgb as blendGeneSrgbCore } from "../../../../milume/static/gene-expression-blend.js";

import type { GeneStore } from "./gene-store.js";
import type { GeneScaleMode } from "./helpers";

/** What one gene blend needs: the shared gene store plus the scale flags. */
export type GeneExpressionPack = {
  n: number;
  activeGenes: string[];
  genes: GeneStore;
  geneScaleMode: GeneScaleMode;
  geneLog1p: boolean;
  geneExpressionLogged: boolean;
};

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
  const { genes } = pack;
  return blendGeneSrgbCore({
    activeGenes: pack.activeGenes,
    pointIndex,
    scaleMode: pack.geneScaleMode,
    log1p: !!pack.geneLog1p && !pack.geneExpressionLogged,
    valueAt: (i, geneName) => {
      const col = genes.column(geneName);
      return col ? (col[i] ?? null) : null;
    },
    metaAt: (geneName) => genes.meta(geneName),
    aggregate: genes.aggregate,
  }) as [number, number, number];
}
