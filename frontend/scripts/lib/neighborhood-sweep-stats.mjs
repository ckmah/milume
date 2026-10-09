/** @param {number[]} samples */
export function median(samples) {
  const s = [...samples].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)] ?? 0;
}

/** Nearest-rank p95 (≥5 samples recommended). */
export function p95(samples) {
  const s = [...samples].sort((a, b) => a - b);
  if (!s.length) return 0;
  const idx = Math.min(s.length - 1, Math.ceil(0.95 * s.length) - 1);
  return s[idx];
}

/** Simple OLS y = a + b*x; returns { intercept, slope, r2 }. */
export function linReg(xs, ys) {
  const n = xs.length;
  if (n < 2) return { intercept: ys[0] ?? 0, slope: 0, r2: 0 };
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  let ssTot = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    den += (xs[i] - mx) ** 2;
    ssTot += (ys[i] - my) ** 2;
  }
  const slope = den ? num / den : 0;
  const intercept = my - slope * mx;
  let ssRes = 0;
  for (let i = 0; i < n; i++) {
    const pred = intercept + slope * xs[i];
    ssRes += (ys[i] - pred) ** 2;
  }
  const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0;
  return { intercept, slope, r2 };
}

/**
 * Cap where first-toggle p95 crosses `thresholdMs` (use last safe point before crossing).
 * @param {{ edgeCount: number, firstToggleP95: number }[]} rows sorted by edgeCount
 */
export function capFromFirstToggleP95(rows, thresholdMs = 200) {
  const valid = rows.filter((r) => r.edgeCount > 0 && r.firstToggleP95 > 0);
  if (!valid.length) return { cap: null, crossing: null };
  const over = valid.find((r) => r.firstToggleP95 >= thresholdMs);
  if (!over) return { cap: null, crossing: null };
  const idx = valid.indexOf(over);
  const safe = idx > 0 ? valid[idx - 1] : null;
  return {
    cap: safe ? safe.edgeCount : 0,
    crossing: over,
  };
}
