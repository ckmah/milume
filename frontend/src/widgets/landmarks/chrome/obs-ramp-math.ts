/** CSS gradient matching engine `obsColumnRgba` indexing along `point_palette`. */
export function obsPaletteGradient(palette: string[]): string {
  if (!palette.length) return "transparent";
  if (palette.length === 1) {
    return `linear-gradient(to top, var(--background), ${palette[0]})`;
  }
  const stops = palette.map((hex, i) => {
    const t = (i / (palette.length - 1)) * 100;
    return `${hex} ${t.toFixed(4)}%`;
  });
  return `linear-gradient(to top, ${stops.join(", ")})`;
}
