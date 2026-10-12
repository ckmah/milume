import { FOCAL, LOGICAL_H, LOOP_SEC } from "./constants.ts";
import { cam } from "./math.ts";

/** Matches WebGL hero vertex shader (`max(pr, 0.35)`). */
export const MIN_DRAW_LOGICAL_RADIUS = 0.35;

export const MAX_PROJECTED_RADIUS_FRAC = 0.15;

export function maxProjectedLogicalRadius(): number {
  return MAX_PROJECTED_RADIUS_FRAC * LOGICAL_H;
}

export function projectedLogicalRadius(worldRad: number, cameraDepth: number): number {
  if (cameraDepth <= 0) return Number.POSITIVE_INFINITY;
  const pr = (FOCAL * worldRad) / cameraDepth;
  return Math.max(pr, MIN_DRAW_LOGICAL_RADIUS);
}

export type InstanceProjectionStats = {
  maxPr: number;
  minDepth: number;
};

export function projectionStatsForInstance(
  px: number,
  py: number,
  pz: number,
  worldRad: number,
  sampleCount = 72,
): InstanceProjectionStats {
  let maxPr = 0;
  let minDepth = Number.POSITIVE_INFINITY;
  for (let i = 0; i < sampleCount; i++) {
    const t = (i / sampleCount) * LOOP_SEC;
    const { c } = cam(t);
    const depth = pz - c[2];
    minDepth = Math.min(minDepth, depth);
    if (depth > 0) {
      maxPr = Math.max(maxPr, projectedLogicalRadius(worldRad, depth));
    }
  }
  return { maxPr, minDepth };
}

export function maxProjectionStatsForField(
  pos: Float32Array,
  rad: Float32Array,
  count: number,
  sampleCount = 72,
): InstanceProjectionStats {
  let maxPr = 0;
  let minDepth = Number.POSITIVE_INFINITY;
  for (let i = 0; i < count; i++) {
    const ix = i * 3;
    const stats = projectionStatsForInstance(
      pos[ix]!,
      pos[ix + 1]!,
      pos[ix + 2]!,
      rad[i]!,
      sampleCount,
    );
    maxPr = Math.max(maxPr, stats.maxPr);
    minDepth = Math.min(minDepth, stats.minDepth);
  }
  return { maxPr, minDepth };
}
