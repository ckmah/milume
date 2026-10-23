/** Annular slice geometry for the Info hand-drawn donut (degrees: 0 = 3 o'clock, CCW positive). */

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

function wobbleRadius(
  r: number,
  t: number,
  seed: number,
  amplitude: number,
): number {
  return (
    r +
    amplitude *
      (0.65 * Math.sin(seed * 0.017 + t * 11.3) +
        0.35 * Math.cos(seed * 0.023 + t * 7.1))
  );
}

function hashSeed(key: string): number {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
  return h;
}

/**
 * Closed SVG path for one donut slice with a subtle hand-drawn radius wobble.
 * `outerR` / `innerR` are in the same units as `cx` / `cy`.
 */
export function wobbleDonutSlicePath(opts: {
  cx: number;
  cy: number;
  innerR: number;
  outerR: number;
  startDeg: number;
  endDeg: number;
  sliceKey: string;
  wobbleAmp?: number;
}): string {
  const {
    cx,
    cy,
    innerR,
    outerR,
    startDeg,
    endDeg,
    sliceKey,
    wobbleAmp = 1.15,
  } = opts;
  const sweep = Math.abs(endDeg - startDeg);
  if (sweep < 1e-6) return "";

  const seed = hashSeed(sliceKey);
  const steps = Math.max(10, Math.ceil(sweep / 6));

  const outerPts: { x: number; y: number }[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const deg = startDeg + (endDeg - startDeg) * t;
    const r = wobbleRadius(outerR, t, seed, wobbleAmp);
    outerPts.push(polar(cx, cy, r, deg));
  }

  const innerPts: { x: number; y: number }[] = [];
  for (let i = steps; i >= 0; i--) {
    const t = i / steps;
    const deg = startDeg + (endDeg - startDeg) * t;
    const r = wobbleRadius(innerR, t + 0.37, seed + 3, wobbleAmp * 0.55);
    innerPts.push(polar(cx, cy, r, deg));
  }

  const fmt = (p: { x: number; y: number }) =>
    `${p.x.toFixed(2)} ${p.y.toFixed(2)}`;

  let d = `M ${fmt(outerPts[0]!)}`;
  for (let i = 1; i < outerPts.length; i++) d += ` L ${fmt(outerPts[i]!)}`;
  d += ` L ${fmt(innerPts[0]!)}`;
  for (let i = 1; i < innerPts.length; i++) d += ` L ${fmt(innerPts[i]!)}`;
  d += " Z";
  return d;
}

export function typeIndexFromSliceKey(key: string): number | null {
  const m = /^c(\d+)$/.exec(key);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}
