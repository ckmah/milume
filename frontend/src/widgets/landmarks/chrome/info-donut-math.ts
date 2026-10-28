/** Annular slice geometry for the Info donut (degrees: 0 = 3 o'clock, CCW positive). */

export type DonutSliceInput = {
  key: string;
  value: number;
};

export type DonutSliceAngle = {
  key: string;
  startDeg: number;
  endDeg: number;
};

/** Recharts Pie default: start at 12 o'clock, sweep clockwise (decreasing angle). */
export function donutSliceAngles(
  slices: DonutSliceInput[],
  total: number,
): DonutSliceAngle[] {
  if (total <= 0) return [];
  let cursor = 90;
  const out: DonutSliceAngle[] = [];
  for (const s of slices) {
    const frac = s.value / total;
    if (frac <= 0) continue;
    const sweep = frac * 360;
    const endDeg = cursor - sweep;
    out.push({ key: s.key, startDeg: cursor, endDeg });
    cursor = endDeg;
  }
  return out;
}

function polar(cx: number, cy: number, r: number, deg: number) {
  const rad = (deg * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy - r * Math.sin(rad) };
}

/**
 * Closed SVG path for one annular donut slice using circular arc commands.
 * `outerR` / `innerR` are in the same units as `cx` / `cy`.
 */
export function donutSlicePath(opts: {
  cx: number;
  cy: number;
  innerR: number;
  outerR: number;
  startDeg: number;
  endDeg: number;
}): string {
  const { cx, cy, innerR, outerR, startDeg, endDeg } = opts;
  const sweep = Math.abs(endDeg - startDeg);
  if (sweep < 1e-6) return "";

  const largeArc = sweep > 180 ? 1 : 0;
  const clockwise = endDeg < startDeg;
  const outerSweep = clockwise ? 1 : 0;
  const innerSweep = clockwise ? 0 : 1;

  const outerStart = polar(cx, cy, outerR, startDeg);
  const outerEnd = polar(cx, cy, outerR, endDeg);
  const innerEnd = polar(cx, cy, innerR, endDeg);
  const innerStart = polar(cx, cy, innerR, startDeg);

  const fmt = (p: { x: number; y: number }) =>
    `${p.x.toFixed(2)} ${p.y.toFixed(2)}`;

  return [
    `M ${fmt(outerStart)}`,
    `A ${outerR} ${outerR} 0 ${largeArc} ${outerSweep} ${fmt(outerEnd)}`,
    `L ${fmt(innerEnd)}`,
    `A ${innerR} ${innerR} 0 ${largeArc} ${innerSweep} ${fmt(innerStart)}`,
    "Z",
  ].join(" ");
}

export function typeIndexFromSliceKey(key: string): number | null {
  const m = /^c(\d+)$/.exec(key);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}
