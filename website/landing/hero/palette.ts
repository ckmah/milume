export type HeroPalette = {
  id: "dark" | "light";
  backgroundHex: string;
  tealRampHex: readonly [string, string, string, string];
  accentHex: string;
  /** Chroma scale applied to ramp and accent RGB (0–1). */
  saturation: number;
  /** When true, hero uses standard src-alpha blending (light); dark uses the same path today. */
  normalAlphaBlend: boolean;
};

export const HERO_PALETTE_DARK: HeroPalette = {
  id: "dark",
  backgroundHex: "#05100f",
  tealRampHex: ["#0f766e", "#14b8a6", "#5eead4", "#a5f3fc"],
  accentHex: "#f59e0b",
  saturation: 0.85,
  normalAlphaBlend: false,
};

/** Reserved for a future landing light theme (not wired while wordmark/copy stay on-dark). */
export const HERO_PALETTE_LIGHT: HeroPalette = {
  id: "light",
  backgroundHex: "#f7faf9",
  tealRampHex: ["#115e59", "#0f766e", "#0d9488", "#14b8a6"],
  accentHex: "#d97706",
  saturation: 1.0,
  normalAlphaBlend: true,
};

/** Landing hero uses dark only until header/copy/wordmark support light surfaces. */
export const HERO_PALETTE: HeroPalette = HERO_PALETTE_DARK;

/** Five baked slots: teal ramp 0–3, orange 4. */
export const HERO_PALETTE_SLOT_COUNT = 5;
export const HERO_ACCENT_SLOT = 4;

const COLOR_PICK_SEED = 0x1620f59e;

function hashU32(n: number): number {
  let h = (n + 1) ^ COLOR_PICK_SEED;
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
  h ^= h >>> 16;
  return h >>> 0;
}

/** Uniform pick among five palette slots (~20% orange). */
export function heroPointPaletteSlot(baseIndex: number): number {
  return hashU32(baseIndex * 11 + 3) % HERO_PALETTE_SLOT_COUNT;
}

export function assignBakedPointPalette(baseCat: Uint8Array, count: number): void {
  for (let i = 0; i < count; i++) {
    baseCat[i] = heroPointPaletteSlot(i);
  }
}

function hexToRgb01(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export function applySaturation(rgb: [number, number, number], saturation: number): [number, number, number] {
  const l = 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
  return [
    l + (rgb[0] - l) * saturation,
    l + (rgb[1] - l) * saturation,
    l + (rgb[2] - l) * saturation,
  ];
}

export type HeroPaletteGl = {
  background: [number, number, number];
  slots: [number, number, number][];
};

export function heroPaletteForGl(palette: HeroPalette = HERO_PALETTE): HeroPaletteGl {
  const sat = palette.saturation;
  const slots: [number, number, number][] = palette.tealRampHex.map((hex) =>
    applySaturation(hexToRgb01(hex), sat),
  );
  slots.push(applySaturation(hexToRgb01(palette.accentHex), sat));
  return {
    background: hexToRgb01(palette.backgroundHex),
    slots,
  };
}

export function glVec3([r, g, b]: [number, number, number]): string {
  return `vec3(${r.toFixed(6)}, ${g.toFixed(6)}, ${b.toFixed(6)})`;
}
