import { useMemo } from "react";

import { decodeF32Base64 } from "./binary";

/** True when any cell carries a finite z (µm) in `points_data` column 4. */
export function usePointZExtent(pointsDataB64: string): {
  hasZ: boolean;
  lo: number;
  hi: number;
} {
  return useMemo(() => {
    const b64 = pointsDataB64 || "";
    if (!b64) return { hasZ: false, lo: 0, hi: 0 };
    const raw = decodeF32Base64(b64);
    const n = Math.floor(raw.length / 4);
    let lo = Infinity;
    let hi = -Infinity;
    let hasZ = false;
    for (let i = 0; i < n; i++) {
      const z = raw[i * 4 + 3];
      if (!Number.isFinite(z)) continue;
      hasZ = true;
      if (z < lo) lo = z;
      if (z > hi) hi = z;
    }
    if (!hasZ) return { hasZ: false, lo: 0, hi: 0 };
    return { hasZ: true, lo, hi };
  }, [pointsDataB64]);
}
