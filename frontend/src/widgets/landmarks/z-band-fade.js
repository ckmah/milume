/**
 * Depth-band falloff for scatter and overlays (#122).
 * Clarence has not finalised hard vs soft fade; tune here only.
 */

/** Absolute alpha multiplier for points outside the focus band (0–1). */
export const Z_BAND_ALPHA_FLOOR = 0.12;

/**
 * @param {number} alphaByte 0–255
 * @param {number | undefined} z cell z in µm
 * @param {number} lo band lower bound µm
 * @param {number} hi band upper bound µm
 * @param {boolean} active when false, pass alpha through
 */
export function applyZBandAlphaByte(alphaByte, z, lo, hi, active) {
  if (!active || z === undefined || !Number.isFinite(z)) return alphaByte;
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi <= lo) return alphaByte;
  if (z >= lo && z <= hi) return alphaByte;
  return Math.round(Z_BAND_ALPHA_FLOOR * 255);
}

/** @param {import('@deck.gl/core').Color} rgba length-4 0–255 */
export function applyZBandAlphaRgba(rgba, z, lo, hi, active) {
  rgba[3] = applyZBandAlphaByte(rgba[3], z, lo, hi, active);
  return rgba;
}
