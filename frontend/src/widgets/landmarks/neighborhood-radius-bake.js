/** Distance-field bake for radius neighborhood gradient (world/common µm). */

const NEIGH_GRADIENT_MAX_DIM = 512;
const NEIGH_GRADIENT_MAX_DIM_LARGE = 256;
const NEIGH_GRADIENT_MAX_DIM_HUGE = 128;

function bakeMaxDim(seedCount) {
  const n = seedCount | 0;
  if (n > 3000) return NEIGH_GRADIENT_MAX_DIM_HUGE;
  if (n > 800) return NEIGH_GRADIENT_MAX_DIM_LARGE;
  return NEIGH_GRADIENT_MAX_DIM;
}

/**
 * Bake a min-distance-to-nearest-seed field at r_max (world/common µm).
 * @param {Array<{x:number,y:number}>} pts
 * @param {number[]} seeds
 * @param {number} rMax
 */
export function bakeRadiusDistanceField(pts, seeds, rMax) {
  if (!seeds.length || !(rMax > 0)) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const positions = [];
  for (let i = 0; i < seeds.length; i++) {
    const s = pts[seeds[i]];
    if (!s) continue;
    positions.push(s);
    if (s.x < minX) minX = s.x;
    if (s.y < minY) minY = s.y;
    if (s.x > maxX) maxX = s.x;
    if (s.y > maxY) maxY = s.y;
  }
  if (!positions.length) return null;
  minX -= rMax;
  minY -= rMax;
  maxX += rMax;
  maxY += rMax;
  const spanX = Math.max(maxX - minX, 1e-6);
  const spanY = Math.max(maxY - minY, 1e-6);
  const maxDim = bakeMaxDim(positions.length);
  const scale = maxDim / Math.max(spanX, spanY);
  const w = Math.max(1, Math.min(maxDim, Math.ceil(spanX * scale)));
  const h = Math.max(1, Math.min(maxDim, Math.ceil(spanY * scale)));
  const sx = w / spanX;
  const sy = h / spanY;
  const dist = new Float32Array(w * h);
  dist.fill(Number.POSITIVE_INFINITY);
  const rPxX = rMax * sx;
  const rPxY = rMax * sy;

  for (let si = 0; si < positions.length; si++) {
    const s = positions[si];
    const cx = (s.x - minX) * sx;
    const cy = (maxY - s.y) * sy;
    const x0 = Math.max(0, Math.floor(cx - rPxX));
    const x1 = Math.min(w - 1, Math.ceil(cx + rPxX));
    const y0 = Math.max(0, Math.floor(cy - rPxY));
    const y1 = Math.min(h - 1, Math.ceil(cy + rPxY));
    for (let y = y0; y <= y1; y++) {
      const dyWorld = (y + 0.5 - cy) / sy;
      const row = y * w;
      for (let x = x0; x <= x1; x++) {
        const dxWorld = (x + 0.5 - cx) / sx;
        const d = Math.hypot(dxWorld, dyWorld);
        if (d > rMax) continue;
        const idx = row + x;
        if (d < dist[idx]) dist[idx] = d;
      }
    }
  }

  return {
    dist,
    w,
    h,
    bounds: [minX, minY, maxX, maxY],
    seedCount: positions.length,
    rMax,
    textureSize: [w, h],
  };
}
