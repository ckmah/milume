/**
 * Selection membership for seeds (matches `selectionMemberIndices` in landmarks.js).
 * @param {{ hidden?: boolean, point_indices?: unknown[] } | undefined} sel
 * @param {number} pointCount
 */
export function selectionMemberCount(sel, pointCount) {
  if (!sel || sel.hidden) return 0;
  const raw = sel.point_indices;
  if (Array.isArray(raw) && raw.length) {
    let c = 0;
    for (let i = 0; i < raw.length; i++) {
      const idx = Number(raw[i]);
      if (Number.isInteger(idx) && idx >= 0 && idx < pointCount) c++;
    }
    return c;
  }
  return 0;
}
