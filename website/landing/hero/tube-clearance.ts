import { FOCAL, LOOP_SEC } from "./constants.ts";
import { cam } from "./math.ts";
import {
  type InstanceProjectionStats,
  maxProjectedLogicalRadius,
  projectionStatsForInstance,
  projectedLogicalRadius,
} from "./projection.ts";

const LOOP_SAMPLES = 80;
const MAX_ITERS = 200;
const MIN_DEPTH = 1.15;
const TUBE_RADIUS = 3.2;
const MIN_WORLD_Z = 11.2;

function loopTimes(): number[] {
  return Array.from({ length: LOOP_SAMPLES }, (_, i) => (i / LOOP_SAMPLES) * LOOP_SEC);
}

type WorstCase = {
  t: number;
  depth: number;
  pr: number;
  wx: number;
  wy: number;
  wz: number;
  cx: number;
  cy: number;
  cz: number;
};

function findWorstCase(
  wx: number,
  wy: number,
  wz: number,
  worldRad: number,
  times: number[],
): WorstCase | null {
  let worst: WorstCase | null = null;
  let score = -1;
  const cap = maxProjectedLogicalRadius();
  for (const t of times) {
    const { c } = cam(t);
    const depth = wz - c[2];
    const pr = depth > 0 ? projectedLogicalRadius(worldRad, depth) : Number.POSITIVE_INFINITY;
    const depthPenalty = depth < MIN_DEPTH ? MIN_DEPTH - depth + 2 : 0;
    const prPenalty = pr > cap ? (pr - cap) / cap : 0;
    const tubeDist = Math.hypot(wx - c[0], wy - c[1], wz - c[2]);
    const tubePenalty = tubeDist < TUBE_RADIUS ? (TUBE_RADIUS - tubeDist) * 2 : 0;
    const s = depthPenalty * 10 + prPenalty * 5 + tubePenalty;
    if (s > score) {
      score = s;
      worst = {
        t,
        depth,
        pr,
        wx,
        wy,
        wz,
        cx: c[0],
        cy: c[1],
        cz: c[2],
      };
    }
  }
  return score > 0.01 ? worst : null;
}

/** Push each world-space instance out of the camera path tube across the full loop. */
export function relocateWorldPointsClearOfCameraPath(
  pos: Float32Array,
  rad: Float32Array,
  count: number,
): void {
  const times = loopTimes();
  const cap = maxProjectedLogicalRadius();

  for (let iter = 0; iter < MAX_ITERS; iter++) {
    let moved = false;
    for (let i = 0; i < count; i++) {
      const ix = i * 3;
      let px = pos[ix]!;
      let py = pos[ix + 1]!;
      let pz = pos[ix + 2]!;
      const r = rad[i]!;
      const stats = projectionStatsForInstance(px, py, pz, r, LOOP_SAMPLES);
      if (stats.minDepth >= MIN_DEPTH && stats.maxPr <= cap) continue;

      const worst = findWorstCase(px, py, pz, r, times);
      if (!worst) continue;

      let dx = worst.wx - worst.cx;
      let dy = worst.wy - worst.cy;
      let dz = worst.wz - worst.cz;
      let len = Math.hypot(dx, dy, dz);
      if (len < 1e-4) {
        dx = 1;
        dy = 0.15;
        dz = 0.55;
        len = Math.hypot(dx, dy, dz);
      }

      const dist = len;
      const radialPush = Math.max(0.35, TUBE_RADIUS - dist + 0.35);
      let wx = worst.wx + (dx / len) * radialPush;
      let wy = worst.wy + (dy / len) * radialPush;
      let wz = worst.wz + (dz / len) * radialPush;

      if (worst.depth < MIN_DEPTH) {
        wz += MIN_DEPTH - worst.depth + 0.2;
      }
      if (worst.pr > cap && worst.depth > 0) {
        const need = (FOCAL * r) / cap;
        const depth = wz - worst.cz;
        if (depth < need) {
          wz += need - depth + 0.15;
        }
      }

      if (wz < MIN_WORLD_Z) {
        wz += MIN_WORLD_Z - wz + 0.1;
      }

      px = wx;
      py = wy;
      pz = wz;

      pos[ix] = px;
      pos[ix + 1] = py;
      pos[ix + 2] = pz;
      moved = true;
    }
    if (!moved) break;
  }
}

/** @deprecated Use {@link relocateWorldPointsClearOfCameraPath}. */
export function relocateBasePointsClearOfCameraPath(
  basePos: Float32Array,
  rad: Float32Array,
  count: number,
): void {
  relocateWorldPointsClearOfCameraPath(basePos, rad, count);
}
