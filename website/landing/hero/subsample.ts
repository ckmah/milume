/** Points emitted by `export-hero-points.py` before bake subsampling. */
export const HERO_EXPORT_BASE_COUNT = 2700;

/**
 * Unique world-space instances in `hero-points.bin` (no z-tile repetition).
 * Tuned for ~300–400 visible discs per frame on the live 1600×900 hero.
 */
export const HERO_BAKED_BASE_COUNT = 425;

const SUBSAMPLE_SEED = 0xa5a51620;

function hashIndex(sourceIndex: number): number {
  let h = (sourceIndex + 1) ^ SUBSAMPLE_SEED;
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
  h ^= h >>> 16;
  return h >>> 0;
}

/** Indices to keep when reducing export field to baked density (sorted ascending). */
export function heroSubsampleIndices(
  sourceCount: number = HERO_EXPORT_BASE_COUNT,
  keepCount: number = HERO_BAKED_BASE_COUNT,
): number[] {
  if (keepCount > sourceCount) {
    throw new Error(`hero subsample: keep ${keepCount} > source ${sourceCount}`);
  }
  const ranked = Array.from({ length: sourceCount }, (_, i) => i);
  ranked.sort((a, b) => {
    const d = hashIndex(a) - hashIndex(b);
    return d !== 0 ? d : a - b;
  });
  return ranked.slice(0, keepCount).sort((a, b) => a - b);
}

export function heroBakedInstanceCount(): number {
  return HERO_BAKED_BASE_COUNT;
}
