import { PERIOD_Z } from "./constants.ts";

const WORLD_Z_MIN = 12;
const WORLD_Z_MAX = 12 + PERIOD_Z * 4.5;

function hashU32(n: number): number {
  let h = (n + 1) ^ 0xa5a51620;
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
  h ^= h >>> 16;
  return h >>> 0;
}

/** Assign each subsampled point a distinct world z across the fly-through depth span. */
export function spreadWorldDepths(pos: Float32Array, count: number): void {
  const span = WORLD_Z_MAX - WORLD_Z_MIN;
  for (let i = 0; i < count; i++) {
    const ix = i * 3;
    const u = (i + 0.5) / count;
    const h = hashU32(i * 17 + 3);
    const jitter = (h / 4294967296 - 0.5) * (span / count) * 0.85;
    pos[ix + 2] = WORLD_Z_MIN + u * span + jitter;
  }
}
