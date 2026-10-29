/** sRGB hex (#rrggbb) or rgb()/rgba() string to [0,1] linear RGB triple. */
function parseRgb(input) {
  const hex = input.match(/^#([0-9a-f]{6})$/i);
  if (hex) {
    const n = Number.parseInt(hex[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => c / 255);
  }
  const rgb = input.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i);
  if (rgb) return [rgb[1], rgb[2], rgb[3]].map(Number).map((c) => c / 255);
  throw new Error(`unparsed color: ${input}`);
}

function lin(c) {
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function relLuminance(rgb) {
  const [r, g, b] = rgb.map(lin);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2.x contrast ratio for two CSS color strings. */
export function contrastRatio(fg, bg) {
  const l1 = relLuminance(parseRgb(fg));
  const l2 = relLuminance(parseRgb(bg));
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}
