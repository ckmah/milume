/**
 * Neighborhood performance helpers (issue #92).
 *
 * k-NN edge PathLayer cutoff rule (PM): hide lines only above the selection size
 * where edges-on end-to-end toggle exceeds ~200 ms on HF ``Stellaromics/demo``
 * ``small/`` (4,372 Pyxa cells).
 *
 * Edges-on sweep (2026-10, ``frontend/scripts/neighborhood-edge-cutoff-sweep.mjs``)
 * never crossed 200 ms through whole-tissue (≤ ~52k segments at k=12) — keep
 * edge lines on at all realistic sizes; cap disabled below.
 */

/** `null` = no edge-count cap (lines stay on). */
export const KNN_EDGE_MAX_EDGE_COUNT = null;

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
