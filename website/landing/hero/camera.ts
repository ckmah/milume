import {
  DEPTH_FAR_CULL,
  DEPTH_NEAR_CULL,
  FIELD_X_EXTENT,
  FIELD_Y_EXTENT,
  FOCUS,
  HERO_POINT_COUNT,
  HERO_RNG_SEED,
  HERO_TILE_COUNT,
  LOGICAL_H,
  LOGICAL_W,
  LOOP_SEC,
  PERIOD_Z,
  SCHEIMPFLUG_BAND,
  SCHEIMPFLUG_BLUR,
  SPEED,
  TILT_X,
  TILT_Y,
  focalLengthPx,
} from "./constants.ts";
import { HERO_PALETTE, paletteRgbForPoints, type HeroPalette } from "./palette.ts";
import { mulberry32 } from "./rng.ts";

const NX = -Math.sin(TILT_Y);
const NY = Math.sin(TILT_X);
const NZ = Math.cos(TILT_Y);
const NL = Math.hypot(NX, NY, NZ);
const F = focalLengthPx();

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

export type HeroPoint = {
  x: number;
  y: number;
  z: number;
  s: number;
  r: number;
  g: number;
  b: number;
};

export function generateHeroPoints(palette: HeroPalette = HERO_PALETTE): HeroPoint[] {
  const rnd = mulberry32(HERO_RNG_SEED);
  const pal = paletteRgbForPoints(palette).rgb;
  const pts: HeroPoint[] = [];
  for (let i = 0; i < HERO_POINT_COUNT; i++) {
    const x = (rnd() * 2 - 1) * FIELD_X_EXTENT;
    const y = (rnd() * 2 - 1) * FIELD_Y_EXTENT;
    const z = rnd() * PERIOD_Z;
    const slot = Math.floor(rnd() * pal.length);
    const [r, g, b] = pal[slot]!;
    const s = 0.6 + rnd() * 0.8;
    pts.push({ x, y, z, s, r, g, b });
  }
  return pts;
}

export type CameraState = {
  cz: number;
  cx: number;
  cy: number;
  roll: number;
  yaw: number;
  cr: number;
  sr: number;
  cyw: number;
  syw: number;
};

export function cameraState(t: number): CameraState {
  const w = (2 * Math.PI * t) / LOOP_SEC;
  const cz = SPEED * t;
  const cx = 0.175 * Math.sin(w);
  const cy = 0.09 * Math.sin(2 * w);
  const roll = 0.0125 * Math.sin(w + 0.6);
  const yaw = 0.015 * Math.cos(w);
  const cr = Math.cos(roll);
  const sr = Math.sin(roll);
  const cyw = Math.cos(yaw);
  const syw = Math.sin(yaw);
  return { cz, cx, cy, roll, yaw, cr, sr, cyw, syw };
}

/** Max instance count: each base point may appear on up to three depth tiles. */
export const MAX_HERO_INSTANCES = HERO_POINT_COUNT * HERO_TILE_COUNT;

/** Instance stride: depth (sort key), sx, sy, radius, alpha, r, g, b */
export const INSTANCE_STRIDE = 8;

export type InstanceScratch = {
  /** Sort workspace: depth + instance fields before reorder. */
  data: Float32Array;
  depths: Float32Array;
  order: Uint32Array;
  /** GPU upload layout: rgb, sx, sy, radius, alpha per instance (7 floats). */
  packed: Float32Array;
};

export function createInstanceScratch(): InstanceScratch {
  return {
    data: new Float32Array(MAX_HERO_INSTANCES * INSTANCE_STRIDE),
    depths: new Float32Array(MAX_HERO_INSTANCES),
    order: new Uint32Array(MAX_HERO_INSTANCES),
    packed: new Float32Array(MAX_HERO_INSTANCES * 7),
  };
}

/**
 * Fill scratch buffers with visible instances for time `t`. Returns instance count.
 * Rows are packed as [depth, sx, sy, radius, alpha, r, g, b] then sorted back-to-front.
 */
export function buildInstances(
  points: readonly HeroPoint[],
  t: number,
  scratch: InstanceScratch,
): number {
  const { cz, cx, cy, cr, sr, cyw, syw } = cameraState(t);
  const { data, depths, order } = scratch;
  let n = 0;

  for (const p of points) {
    let rz = ((p.z - cz) % PERIOD_Z + PERIOD_Z) % PERIOD_Z;
    for (let k = 0; k < HERO_TILE_COUNT; k++) {
      const d0 = rz + k * PERIOD_Z;
      if (d0 < DEPTH_NEAR_CULL || d0 > DEPTH_FAR_CULL) continue;

      let x = p.x - cx;
      let y = p.y - cy;
      let z = d0;
      const x2 = x * cyw - z * syw;
      z = x * syw + z * cyw;
      x = x2;
      const x3 = x * cr - y * sr;
      const y3 = x * sr + y * cr;
      if (z < DEPTH_NEAR_CULL) continue;

      const sx = LOGICAL_W / 2 + (x3 * F) / z;
      const sy = LOGICAL_H / 2 + (y3 * F) / z;
      const core = Math.max(0.9, (0.03 * F * p.s) / z);
      const dpl = (NX * x3 + NY * y3 + NZ * (z - FOCUS)) / NL;
      const ex = Math.max(0, Math.abs(dpl) - SCHEIMPFLUG_BAND);
      const coc =
        (SCHEIMPFLUG_BLUR * ex * ex / (0.9 + ex) * p.s) / Math.sqrt(Math.max(z, 0.6) / FOCUS);
      const radius = Math.sqrt(core * core + coc * coc);
      if (sx < -radius - 2 || sx > LOGICAL_W + radius + 2 || sy < -radius - 2 || sy > LOGICAL_H + radius + 2) {
        continue;
      }

      let a = Math.min(1, (core * core + 0.6) / (radius * radius + 0.6)) * 0.95;
      a *= smoothstep(0.5, 1.8, z) * (1 - smoothstep(7, 11.5, z));
      a *= 0.6 + 0.4 * (1 - smoothstep(FOCUS, 11, z));
      if (a < 0.002) continue;

      const row = n * INSTANCE_STRIDE;
      data[row] = z;
      data[row + 1] = sx;
      data[row + 2] = sy;
      data[row + 3] = radius;
      data[row + 4] = a;
      data[row + 5] = p.r;
      data[row + 6] = p.g;
      data[row + 7] = p.b;
      depths[n] = z;
      order[n] = n;
      n++;
    }
  }

  const sortSlice = order.subarray(0, n);
  sortSlice.sort((ia, ib) => depths[ib]! - depths[ia]!);

  const workspace = scratch.data;
  const out = scratch.packed;
  for (let k = 0; k < n; k++) {
    const src = sortSlice[k]! * INSTANCE_STRIDE;
    const dst = k * 7;
    out[dst] = workspace[src + 5]!;
    out[dst + 1] = workspace[src + 6]!;
    out[dst + 2] = workspace[src + 7]!;
    out[dst + 3] = workspace[src + 1]!;
    out[dst + 4] = workspace[src + 2]!;
    out[dst + 5] = workspace[src + 3]!;
    out[dst + 6] = workspace[src + 4]!;
  }
  return n;
}

export function fieldHasNaN(points: readonly HeroPoint[]): boolean {
  for (const p of points) {
    if (
      !Number.isFinite(p.x) ||
      !Number.isFinite(p.y) ||
      !Number.isFinite(p.z) ||
      !Number.isFinite(p.s) ||
      !Number.isFinite(p.r) ||
      !Number.isFinite(p.g) ||
      !Number.isFinite(p.b)
    ) {
      return true;
    }
  }
  return false;
}
