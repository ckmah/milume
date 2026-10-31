/** Depth rail µm labels (#122): whole µm while dragging, legend-style at rest. */

export function formatDepthRailUm(value: number, preferWhole: boolean): string {
  if (!Number.isFinite(value)) return "";
  const rounded = Math.round(value);
  if (preferWhole && Math.abs(value - rounded) < 0.06) {
    return String(rounded);
  }
  if (preferWhole) return String(rounded);
  const oneDec = Math.round(value * 10) / 10;
  if (Number.isInteger(oneDec)) return String(oneDec);
  return String(oneDec);
}

/** Always rounds to whole µm (drag readout). */
export function formatDepthRailUmWhole(value: number): string {
  if (!Number.isFinite(value)) return "";
  return String(Math.round(value));
}

export function formatDepthRailDragReadout(
  focus: number,
  bandLo: number,
  bandHi: number,
): { main: string; subLo: string; subHi: string } {
  const half = (bandHi - bandLo) / 2;
  return {
    main: `${formatDepthRailUmWhole(focus)} ± ${formatDepthRailUmWhole(half)}`,
    subLo: formatDepthRailUmWhole(bandLo),
    subHi: formatDepthRailUmWhole(bandHi),
  };
}

export function formatRangeLine(
  focus: number,
  lo: number,
  hi: number,
): { main: string; subLo: string; subHi: string; symmetric: boolean } {
  const half = (hi - lo) / 2;
  const mid = (lo + hi) / 2;
  const symmetric =
    Math.abs(focus - mid) < 0.05 && Math.abs(half * 2 - (hi - lo)) < 0.05 && half > 0;
  const subLo = formatDepthRailUm(lo, symmetric);
  const subHi = formatDepthRailUm(hi, symmetric);
  if (symmetric) {
    const focusLabel = formatDepthRailUm(focus, true);
    const halfLabel = formatDepthRailUm(half, true);
    return {
      main: `${focusLabel} ± ${halfLabel}`,
      subLo,
      subHi,
      symmetric: true,
    };
  }
  return { main: formatDepthRailUm(focus, false), subLo, subHi, symmetric: false };
}
