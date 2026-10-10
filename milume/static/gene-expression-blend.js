/** Additive gene channels (keep in sync with frontend helpers GENE_COLORS). */
export const GENE_BLEND_COLORS = ["#ff0099", "#5cbf00", "#0088cc"];

export const LOW_EXPR_SRGB = [107, 114, 128];

export function geneUsesLog1pFromFlags(geneLog1p, geneExpressionLogged) {
  return !!geneLog1p && !geneExpressionLogged;
}

export function geneIntensity(t01, vmin, vmax, log1p) {
  const lo = Number.isFinite(vmin) ? vmin : 0;
  const hi = Number.isFinite(vmax) && vmax > lo ? vmax : lo + 1;
  const t = Math.max(0, Math.min(1, t01 == null ? 0 : t01));
  const raw = Math.max(0, lo + t * (hi - lo));
  return log1p ? Math.log1p(raw) : raw;
}

export function geneCeiling(vmin, vmax, log1p) {
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

export function geneFloor(vmin, vmax, log1p) {
  const lo = Number.isFinite(vmin) ? vmin : 0;
  const bot = Math.max(0, lo);
  return log1p ? Math.log1p(bot) : bot;
}

export function scaledGeneT({
  t01,
  vmin,
  vmax,
  scaleMode,
  sharedCeiling,
  log1p,
}) {
  if (t01 == null) return 0;
  const intensity = geneIntensity(t01, vmin, vmax, log1p);
  if (scaleMode === "shared") {
    const ceil =
      sharedCeiling > 0 ? sharedCeiling : geneCeiling(vmin, vmax, log1p);
    return Math.max(0, Math.min(1, intensity / ceil));
  }
  const floor = geneFloor(vmin, vmax, log1p);
  const ceil = geneCeiling(vmin, vmax, log1p);
  if (ceil <= floor) return 0;
  return Math.max(0, Math.min(1, (intensity - floor) / (ceil - floor)));
}

export function sharedGeneCeiling(activeGenes, metaAt, log1p) {
  let max = 0;
  for (const name of activeGenes) {
    const meta = metaAt(name);
    if (!meta) continue;
    max = Math.max(max, geneCeiling(meta.vmin ?? 0, meta.vmax ?? 1, log1p));
  }
  return max;
}

function parseHexRgb(hex) {
  const n = Number.parseInt(String(hex).replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/**
 * Additive sRGB bytes for one point. `valueAt(i, geneName)` returns packed [0,1]
 * or null; `metaAt(geneName)` returns `{ vmin, vmax }` or null.
 */
export function blendGeneSrgb({
  activeGenes,
  pointIndex,
  scaleMode,
  log1p,
  valueAt,
  metaAt,
}) {
  if (!activeGenes?.length || pointIndex < 0) return LOW_EXPR_SRGB;
  const shared = scaleMode === "shared" ? sharedGeneCeiling(activeGenes, metaAt, log1p) : 0;
  let r = 0;
  let g = 0;
  let b = 0;
  let w = 0;
  for (let ai = 0; ai < activeGenes.length; ai++) {
    const geneName = activeGenes[ai];
    const meta = metaAt(geneName);
    if (!meta) continue;
    const t01 = valueAt(pointIndex, geneName);
    const t = scaledGeneT({
      t01,
      vmin: meta.vmin ?? 0,
      vmax: meta.vmax ?? 1,
      scaleMode,
      sharedCeiling: shared,
      log1p,
    });
    if (!(t > 0)) continue;
    const rgb = parseHexRgb(GENE_BLEND_COLORS[ai % GENE_BLEND_COLORS.length]);
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
