/**
 * Neighborhood performance helpers (issue #92).
 *
 * k-NN edge PathLayer cutoff (PM): hide lines when edges-on first-toggle p95 exceeds
 * ~200 ms on **colon** subsamples (``frontend/scripts/neighborhood-colon-subsample-sweep.mjs``).
 *
 * Mouse brain ``small/``/``xsmall/`` (HF Pyxa) are for timing/CI only — do not join colon
 * labels onto them by cell_id. Brain edges-on sweeps stay well under 200 ms at slice scale.
 */

/**
 * Colon A2 subsample sweep (2026-10): first-toggle p95 crosses ~200 ms at
 * predicted edges 120_000 (10k seeds × k=12 @ 25k cells); last safe point 102_000.
 */
export const KNN_EDGE_MAX_EDGE_COUNT = 102_000;

export function shouldDrawKnnEdgeLines(pointCount, seedCount, edgeCount = 0) {
  const edges = edgeCount | 0;
  if (
    KNN_EDGE_MAX_EDGE_COUNT != null &&
    edges > (KNN_EDGE_MAX_EDGE_COUNT | 0)
  ) {
    return false;
  }
  return true;
}

export function hashSeedIndices(seeds) {
  let h = seeds.length * 73856093;
  for (let i = 0; i < seeds.length; i++) h = (Math.imul(h, 31) + (seeds[i] | 0)) | 0;
  return h;
}

/** Stable cache key for prepareFocusGeom (neighbor indices + roles + edges). */
export function neighborGeomCacheKey({
  pointsKey,
  focusKind,
  focusIndex,
  hoodMode,
  hoodK,
  hoodRadius,
  seedCount,
  seedHash,
}) {
  return [
    pointsKey,
    focusKind,
    focusIndex,
    hoodMode,
    hoodK | 0,
    Number(hoodRadius).toFixed(4),
    seedCount | 0,
    seedHash | 0,
  ].join("|");
}
