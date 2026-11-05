import type { ImagePalette } from "./cell-lut-extension";

const cache = new Map<string, ImagePalette>();

function srgbToLinearByte(c: number): number {
  const s = c / 255;
  return Math.round((s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4) * 255);
}

function parseHex(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = Number.parseInt(m[1]!, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Grayscale-to-tint ramp for one channel (matches map backdrop additive tints). */
export function tintPalette(hex: string): ImagePalette {
  const hit = cache.get(hex);
  if (hit) return hit;
  const rgb = parseHex(hex) ?? [255, 255, 255];
  const data = new Uint8Array(256 * 4);
  for (let i = 0; i < 256; i++) {
    const t = i / 255;
    for (let c = 0; c < 3; c++) {
      data[i * 4 + c] = srgbToLinearByte(rgb[c]! * t);
    }
    data[i * 4 + 3] = 255;
  }
  const lut = { data, width: 256 as const, height: 1 as const };
  cache.set(hex, lut);
  return lut;
}

export const CHANNEL_TINTS = [
  "#6eb5ff",
  "#ff8844",
  "#55cc88",
  "#cc66cc",
  "#ffdd44",
  "#44dddd",
  "#ff66aa",
  "#aabb44",
] as const;

export function defaultChannelTint(index: number): string {
  return CHANNEL_TINTS[index % CHANNEL_TINTS.length] ?? "#cccccc";
}
