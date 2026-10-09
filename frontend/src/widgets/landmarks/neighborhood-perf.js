/**
 * Neighborhood performance helpers (issue #92).
 *
 * k-NN edge PathLayer cutoff from harness sweeps (2026-10):
 * - Pyxa small (~4.3k points): toggle median ~490ms at 295 seeds; ~200ms crossing ~120 seeds.
 * - Colon A2 (~358k points): toggle ~3.7s at 1 seed / 12 edges (deck scatter dominates).
 */

/** Hide k-NN edge lines above this seed count on small/medium tissues. */
export const KNN_EDGE_MAX_SEED_COUNT = 120;

/**
 * Above this scatter size, k-NN toggle exceeds 200ms even for minimal selections
 * (colon A2 sweep); edge lines stay off regardless of seed count.
 */
export const KNN_EDGE_MAX_POINT_COUNT = 10_000;

export function shouldDrawKnnEdgeLines(pointCount, seedCount) {
  if ((pointCount | 0) > KNN_EDGE_MAX_POINT_COUNT) return false;
  if ((seedCount | 0) > KNN_EDGE_MAX_SEED_COUNT) return false;
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
