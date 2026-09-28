/** Image colour maps for the volume cube, sampled by the cube shader. */

export type PaletteName = "gray" | "inferno" | "magma" | "viridis" | "cividis";
export const PALETTES: PaletteName[] = ["gray", "inferno", "magma", "viridis", "cividis"];

/** How the cube draws the image and the cells, on top of the lookup textures. */
export type RenderSettings = {
  palette: PaletteName;
  /** Scales the image's per-sample alpha. */
  imageAlpha: number;
  /** Exponent on the contrast-limited image value. */
  imageGamma: number;
  /** Scales every cell's per-sample alpha. */
  cellAlpha: number;
};

export const DEFAULT_RENDER: RenderSettings = { palette: "gray", imageAlpha: 1, imageGamma: 1, cellAlpha: 1 };

// sRGB stops, evenly spaced. Gray is generated instead (see `grayRamp`).
const STOPS: Record<Exclude<PaletteName, "gray">, string[]> = {
  inferno: ["#000004", "#1f0c48", "#550f6d", "#88226a", "#ba3655", "#e35933", "#f98e09", "#f9cb35", "#fcffa4"],
  magma: ["#000004", "#1c1044", "#4f127b", "#812581", "#b5367a", "#e55064", "#fb8761", "#fec287", "#fcfdbf"],
  viridis: ["#440154", "#472d7b", "#3b528b", "#2c728e", "#21918c", "#28ae80", "#5ec962", "#addc30", "#fde725"],
  cividis: ["#00224e", "#123570", "#3b496c", "#575d6d", "#707173", "#8a8678", "#a59c74", "#c3b369", "#fee838"],
};

const cache = new Map<PaletteName, { data: Uint8Array; width: 256; height: 1 }>();

function rgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** The cube's image colour before palettes; Viv used it as linear light. */
const GRAY_END = [220, 225, 230];

function linearToSrgb(x: number): number {
  return x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055;
}

/**
 * A linear-light ramp to GRAY_END / 255, so the default cube draws exactly as
 * it did with Viv's channel colour (an sRGB-interpolated ramp is far darker).
 */
function grayRamp(): Uint8Array {
  const data = new Uint8Array(256 * 4);
  for (let i = 0; i < 256; i++) {
    for (let c = 0; c < 3; c++) data[i * 4 + c] = Math.round(linearToSrgb((i / 255) * (GRAY_END[c]! / 255)) * 255);
    data[i * 4 + 3] = 255;
  }
  return data;
}

function stopsRamp(name: Exclude<PaletteName, "gray">): Uint8Array {
  const stops = STOPS[name].map(rgb);
  const data = new Uint8Array(256 * 4);
  for (let i = 0; i < 256; i++) {
    const t = (i / 255) * (stops.length - 1);
    const k = Math.min(Math.floor(t), stops.length - 2);
    const f = t - k;
    for (let c = 0; c < 3; c++) data[i * 4 + c] = Math.round(stops[k]![c]! * (1 - f) + stops[k + 1]![c]! * f);
    data[i * 4 + 3] = 255;
  }
  return data;
}

/** 256 RGBA texels in sRGB; the shader linearises before compositing. */
export function paletteLut(name: PaletteName) {
  const hit = cache.get(name);
  if (hit) return hit;
  const data = name === "gray" ? grayRamp() : stopsRamp(name);
  const lut = { data, width: 256 as const, height: 1 as const };
  cache.set(name, lut);
  return lut;
}
