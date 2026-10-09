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

/** E2E only: `window.__KNN_EDGE_MAX_OVERRIDE` lowers the cap without rebuilding. */
export function effectiveKnnEdgeMaxEdgeCount() {
  const g = typeof globalThis !== "undefined" ? globalThis : {};
  const o = g.__KNN_EDGE_MAX_OVERRIDE;
  if (o != null && Number.isFinite(Number(o))) return Number(o) | 0;
  return KNN_EDGE_MAX_EDGE_COUNT;
}

/** Compact label for UI copy (e.g. 102_000 → `102k`). */
export function formatKnnEdgeCapLabel(maxEdges) {
  const v = Math.abs(maxEdges | 0);
  if (v >= 1000) {
    const k = v / 1000;
    const text = Number.isInteger(k) ? String(k) : k.toFixed(1).replace(/\.0$/, "");
    return `${text}k`;
  }
  return String(v);
}

/** True when k-NN edge lines are suppressed by the predicted-edge cap (seeds × k). */
export function knnEdgesHiddenByCap(neighborhood, seedCount, k = 12) {
  if (neighborhood !== "knn") return false;
  const max = effectiveKnnEdgeMaxEdgeCount();
  if (max == null) return false;
  const predicted = (seedCount | 0) * (Math.max(1, k | 0) | 0);
  return predicted > (max | 0);
}

/** One-line selection-card copy when edges are capped; `null` when cap is disabled. */
export function knnEdgeCapHiddenNote(neighborhood, seedCount, k = 12) {
  if (!knnEdgesHiddenByCap(neighborhood, seedCount, k)) return null;
  const max = effectiveKnnEdgeMaxEdgeCount();
  if (max == null) return null;
  return `Edges hidden above ${formatKnnEdgeCapLabel(max)} for speed`;
}

export function shouldDrawKnnEdgeLines(pointCount, seedCount, edgeCount = 0) {
  const edges = edgeCount | 0;
  const max = effectiveKnnEdgeMaxEdgeCount();
  if (max != null && edges > (max | 0)) {
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
