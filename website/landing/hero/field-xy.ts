/** Field extent for normalizing horizontal position (export herolib spread). */
export const FIELD_XY_EXTENT = { x: 30, y: 18 } as const;

const XY_QUANT = 1e4;

export function normalizedXyKey(x: number, y: number): string {
  const nx = Math.round((x / FIELD_XY_EXTENT.x) * XY_QUANT);
  const ny = Math.round((y / FIELD_XY_EXTENT.y) * XY_QUANT);
  return `${nx},${ny}`;
}

export function assertUniqueNormalizedXy(pos: Float32Array, count: number): void {
  const seen = new Set<string>();
  for (let i = 0; i < count; i++) {
    const ix = i * 3;
    const key = normalizedXyKey(pos[ix]!, pos[ix + 1]!);
    if (seen.has(key)) {
      throw new Error(`hero field: duplicate normalized xy at instance ${i} (${key})`);
    }
    seen.add(key);
  }
}

function hashU32(n: number): number {
  let h = (n + 1) ^ 0x9e3779b9;
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
  h ^= h >>> 16;
  return h >>> 0;
}

/** Nudge xy until normalized keys are unique (deterministic). */
export function jitterDuplicateNormalizedXy(pos: Float32Array, count: number): void {
  const keys = new Map<string, number>();
  for (let i = 0; i < count; i++) {
    const ix = i * 3;
    let x = pos[ix]!;
    let y = pos[ix + 1]!;
    let key = normalizedXyKey(x, y);
    let attempt = 0;
    while (keys.has(key)) {
      const h = hashU32(i * 97 + attempt);
      const a = (h / 4294967296) * Math.PI * 2;
      const r = 0.04 + (attempt % 5) * 0.03;
      x += Math.cos(a) * r;
      y += Math.sin(a) * r;
      key = normalizedXyKey(x, y);
      attempt++;
      if (attempt > 48) {
        throw new Error(`hero field: could not separate normalized xy for instance ${i}`);
      }
    }
    pos[ix] = x;
    pos[ix + 1] = y;
    keys.set(key, i);
  }
}
