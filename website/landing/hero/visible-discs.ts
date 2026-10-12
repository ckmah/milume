import { FOCAL, LOGICAL_H, LOGICAL_W, LOOP_SEC } from "./constants.ts";
import { cam } from "./math.ts";
import { MIN_DRAW_LOGICAL_RADIUS, projectedLogicalRadius } from "./projection.ts";

export type ViewLayout = {
  logicalW: number;
  logicalH: number;
};

const DEFAULT_LAYOUT: ViewLayout = { logicalW: LOGICAL_W, logicalH: LOGICAL_H };

/**
 * Discs whose projected footprint intersects the logical viewport (matches hero shader projection).
 */
export function countVisibleDiscsAtTime(
  pos: Float32Array,
  rad: Float32Array,
  count: number,
  t: number,
  layout: ViewLayout = DEFAULT_LAYOUT,
  minLogicalRadius = MIN_DRAW_LOGICAL_RADIUS,
): number {
  const { c, roll } = cam(t);
  const cr = Math.cos(roll);
  const sr = Math.sin(roll);
  const halfW = layout.logicalW / 2;
  const halfH = layout.logicalH / 2;
  const maxX = layout.logicalW;
  const maxY = layout.logicalH;
  let visible = 0;

  for (let i = 0; i < count; i++) {
    const ix = i * 3;
    const dx = pos[ix]! - c[0];
    const dy = pos[ix + 1]! - c[1];
    const dz = pos[ix + 2]! - c[2];
    if (dz <= 0) continue;

    const x = dx * cr - dy * sr;
    const y = dx * sr + dy * cr;
    const sx = halfW + (FOCAL * x) / dz;
    const sy = halfH + (FOCAL * y) / dz;
    const pr = projectedLogicalRadius(rad[i]!, dz);

    if (sx + pr < 0 || sx - pr > maxX || sy + pr < 0 || sy - pr > maxY) continue;
    if (pr < minLogicalRadius) continue;
    visible++;
  }
  return visible;
}

export function countVisibleDiscsAtTimeStrict(
  pos: Float32Array,
  rad: Float32Array,
  count: number,
  t: number,
  layout: ViewLayout = DEFAULT_LAYOUT,
): number {
  const { c, roll } = cam(t);
  const cr = Math.cos(roll);
  const sr = Math.sin(roll);
  const halfW = layout.logicalW / 2;
  const halfH = layout.logicalH / 2;
  let visible = 0;

  for (let i = 0; i < count; i++) {
    const ix = i * 3;
    const dx = pos[ix]! - c[0];
    const dy = pos[ix + 1]! - c[1];
    const dz = pos[ix + 2]! - c[2];
    if (dz <= 0) continue;

    const x = dx * cr - dy * sr;
    const y = dx * sr + dy * cr;
    const sx = halfW + (FOCAL * x) / dz;
    const sy = halfH + (FOCAL * y) / dz;
    if (sx < 0 || sx > layout.logicalW || sy < 0 || sy > layout.logicalH) continue;

    const pr = projectedLogicalRadius(rad[i]!, dz);
    if (pr < MIN_DRAW_LOGICAL_RADIUS) continue;
    visible++;
  }
  return visible;
}

export type VisibleDiscLoopStats = {
  min: number;
  max: number;
  mean: number;
  samples: number[];
};

export function visibleDiscStatsAcrossLoop(
  pos: Float32Array,
  rad: Float32Array,
  count: number,
  sampleCount = 24,
  layout: ViewLayout = DEFAULT_LAYOUT,
  counter: typeof countVisibleDiscsAtTime = countVisibleDiscsAtTime,
): VisibleDiscLoopStats {
  const samples: number[] = [];
  for (let i = 0; i < sampleCount; i++) {
    const t = (i / sampleCount) * LOOP_SEC;
    samples.push(counter(pos, rad, count, t, layout));
  }
  const min = Math.min(...samples);
  const max = Math.max(...samples);
  const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
  return { min, max, mean, samples };
}

/** Designer still target band (1024×576 reference). */
export const VISIBLE_DISCS_TARGET_MIN = 300;
export const VISIBLE_DISCS_TARGET_MAX = 400;
