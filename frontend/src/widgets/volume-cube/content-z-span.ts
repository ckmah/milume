/** Half-open z index range [lo, hi) in the loaded window texture that contains signal. */
export type ContentZSpan = readonly [lo: number, hi: number];

/**
 * First and last z planes with any voxel above `minValue`, as half-open [lo, hi).
 * Returns [0, depth) when nothing passes or depth is invalid.
 */
export function contentZIndexSpan(
  data: ArrayLike<number>,
  width: number,
  height: number,
  depth: number,
  minValue: number,
): ContentZSpan {
  if (!(depth > 0) || !(width > 0) || !(height > 0)) return [0, Math.max(0, depth)];
  const plane = width * height;
  let lo = depth;
  let hi = -1;
  for (let z = 0; z < depth; z++) {
    const start = z * plane;
    const end = start + plane;
    for (let i = start; i < end; i++) {
      if (data[i]! > minValue) {
        if (z < lo) lo = z;
        if (z > hi) hi = z;
        break;
      }
    }
  }
  if (hi < lo) return [0, depth];
  return [lo, hi + 1];
}
