export const GENE_BLEND_COLORS: string[];
export const LOW_EXPR_SRGB: [number, number, number];

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
}): [number, number, number];
