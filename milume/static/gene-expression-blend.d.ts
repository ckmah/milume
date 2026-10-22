export const GENE_BLEND_COLORS: string[];
export const LOW_EXPR_SRGB: [number, number, number];
export const MAX_RGB_GENES: number;

export function aggregateGeneT(ts: number[], mode: "mean" | "median" | "max"): number;

export function geneUsesLog1pFromFlags(
  geneLog1p: boolean,
  geneExpressionLogged: boolean,
): boolean;

export function blendGeneSrgb(args: {
  activeGenes: string[];
  pointIndex: number;
  scaleMode: string;
  log1p: boolean;
  valueAt: (pointIndex: number, geneName: string) => number | null;
  metaAt: (geneName: string) => { vmin?: number; vmax?: number } | null;
  aggregate?: "mean" | "median" | "max";
}): [number, number, number];
