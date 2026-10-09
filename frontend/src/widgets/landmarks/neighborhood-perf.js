/**
 * Neighborhood performance helpers (issue #92).
 *
 * k-NN edge PathLayer cutoff from end-to-end harness sweeps (re-measured after
 * binary scatter + hood overlay). Prefer edge-count cap — PathLayer cost scales
 * with segment count, not seed count alone.
 */

/**
 * Hide k-NN edge lines when segment count would exceed this (seeds × k), measured
 * on Pyxa small / colon A2 harness after scatter role optimization.
 */
export const KNN_EDGE_MAX_EDGE_COUNT = 25_000;

/** Legacy guard for very large tissues when edge estimate is unavailable. */
export const KNN_EDGE_MAX_POINT_COUNT = 500_000;

export function shouldDrawKnnEdgeLines(pointCount, seedCount, edgeCount = 0) {
  const edges = edgeCount | 0;
  if (edges > KNN_EDGE_MAX_EDGE_COUNT) return false;
  if ((pointCount | 0) > KNN_EDGE_MAX_POINT_COUNT) return false;
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
