import type { CellColoring } from "./cell-lut-extension";
import { CELL_LUT_WIDTH, instanceColor } from "./cell-lut-extension";

const OTHERS = { color: "#d4d4d4", alpha: 0.4, behindGroups: 0.12 };
const OUTLINE = { color: "#f97316", alpha: 1, behindGroups: 0.35 };

function srgbToLinear(c: number): number {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function hexToLinear(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = Number.parseInt(m[1]!, 16);
  return [
    Math.round(srgbToLinear((n >> 16) & 255) * 255),
    Math.round(srgbToLinear((n >> 8) & 255) * 255),
    Math.round(srgbToLinear(n & 255) * 255),
  ];
}

function contrastingOutlineRgb(
  fillRgb: readonly [number, number, number],
  sharedOrange: readonly [number, number, number],
  mode: "shared" | "luminance",
): [number, number, number] {
  if (mode === "shared") return sharedOrange as [number, number, number];
  const r = fillRgb[0] / 255;
  const g = fillRgb[1] / 255;
  const b = fillRgb[2] / 255;
  const l = 0.299 * r + 0.587 * g + 0.114 * b;
  if (l > 0.42) return [22, 22, 26];
  return [235, 235, 240];
}

/** Per local cell index: linear RGBA rim bytes (index 0 = neutral / unused). */
export function buildCellOutlineLut(coloring: CellColoring, cells: readonly number[]): Uint8Array {
  const n = Math.max(1, cells.length);
  const width = Math.min(CELL_LUT_WIDTH, n);
  const height = Math.ceil(n / width);
  const fill = new Uint8Array(width * height * 4);
  const outline = hexToLinear(OUTLINE.color)!;
  const outlineA = Math.round(255 * OUTLINE.alpha);

  if (coloring.kind === "instances") {
    for (let i = 1; i < cells.length; i++) {
      const rgb = instanceColor(cells[i]!);
      fill.set(rgb, i * 4);
      fill[i * 4 + 3] = 255;
    }
    const out = new Uint8Array(width * height * 4);
    for (let i = 0; i < width * height; i++) {
      const off = i * 4;
      const rgb: [number, number, number] = [fill[off]!, fill[off + 1]!, fill[off + 2]!];
      const hasFill = fill[off + 3]! > 0 && rgb[0] + rgb[1] + rgb[2] > 1;
      const rim = hasFill ? contrastingOutlineRgb(rgb, outline, "luminance") : rgb;
      out.set([...rim, i === 0 ? fill[off + 3]! : hasFill ? outlineA : fill[off + 3]!], off);
    }
    return out;
  }

  if (coloring.kind === "expression") {
    for (let i = 1; i < cells.length; i++) {
      const rgb = coloring.byLabel.get(cells[i]!);
      if (rgb) fill.set([rgb[0], rgb[1], rgb[2], 0], i * 4);
    }
    const out = new Uint8Array(width * height * 4);
    for (let i = 0; i < width * height; i++) {
      const off = i * 4;
      const rgb: [number, number, number] = [fill[off]!, fill[off + 1]!, fill[off + 2]!];
      const hasFill = rgb[0] + rgb[1] + rgb[2] > 1;
      const rim = hasFill ? contrastingOutlineRgb(rgb, outline, "shared") : rgb;
      out.set([...rim, i === 0 ? 0 : hasFill ? outlineA : 0], off);
    }
    return out;
  }

  const { groups } = coloring;
  const sharedOutline = groups.length ? hexToLinear(OTHERS.color)! : outline;
  const others = hexToLinear(OTHERS.color)!;
  const colour = new Map<number, [number, number, number]>();
  for (const g of groups) {
    const rgb = hexToLinear(g.color);
    if (!rgb) continue;
    for (const id of g.labels) if (id > 0) colour.set(id, rgb);
  }
  for (let i = 1; i < cells.length; i++) {
    const rgb = colour.get(cells[i]!);
    if (rgb) fill.set([rgb[0], rgb[1], rgb[2], 255], i * 4);
    else fill.set([...others, Math.round(255 * (groups.length ? OTHERS.behindGroups : OTHERS.alpha))], i * 4);
  }
  const out = new Uint8Array(width * height * 4);
  const rimA = Math.round(255 * (groups.length ? OUTLINE.behindGroups : OUTLINE.alpha));
  for (let i = 0; i < width * height; i++) {
    const off = i * 4;
    const rgb: [number, number, number] = [fill[off]!, fill[off + 1]!, fill[off + 2]!];
    const hasFill = fill[off + 3]! > 0 && rgb[0] + rgb[1] + rgb[2] > 1;
    const rim = hasFill ? contrastingOutlineRgb(rgb, sharedOutline, "shared") : rgb;
    out.set([...rim, i === 0 ? fill[off + 3]! : hasFill ? rimA : fill[off + 3]!], off);
  }
  return out;
}

function onCutFace(
  px: number,
  py: number,
  pz: number,
  cut: readonly number[],
): boolean {
  const active =
    cut[1]! - cut[0]! < 0.999 || cut[3]! - cut[2]! < 0.999 || cut[5]! - cut[4]! < 0.999;
  if (!active) return false;
  const e = 0.004;
  if (cut[0]! > 0.001 && Math.abs(px - cut[0]!) < e) return true;
  if (cut[1]! < 0.999 && Math.abs(px - cut[1]!) < e) return true;
  if (cut[2]! > 0.001 && Math.abs(py - cut[2]!) < e) return true;
  if (cut[3]! < 0.999 && Math.abs(py - cut[3]!) < e) return true;
  if (cut[4]! > 0.001 && Math.abs(pz - cut[4]!) < e) return true;
  if (cut[5]! < 0.999 && Math.abs(pz - cut[5]!) < e) return true;
  return false;
}

export type CutRimMask = { data: Uint8Array; width: number; height: number; depth: number };

/** RGBA8 rim colours on cut faces only; linear RGB in .rgb, alpha in .a (0–255). */
export function buildCutRimMask(
  rg8: Uint8Array,
  width: number,
  height: number,
  depth: number,
  cutFrac: readonly number[],
  outlineLut: Uint8Array,
  lutWidth: number,
): CutRimMask {
  const plane = width * height;
  const data = new Uint8Array(plane * depth * 4);
  for (let z = 0; z < depth; z++) {
    const pz = (z + 0.5) / depth;
    for (let t = 0; t < height; t++) {
      const py = (t + 0.5) / height;
      for (let x = 0; x < width; x++) {
        const px = (x + 0.5) / width;
        if (!onCutFace(px, py, pz, cutFrac)) continue;
        const texel = z * plane + t * width + x;
        const g = rg8[texel * 2 + 1]!;
        if ((g & 128) === 0) continue;
        const idx = rg8[texel * 2]! + 256 * (g & 127);
        if (idx === 0) continue;
        const lx = idx % lutWidth;
        const ly = Math.floor(idx / lutWidth);
        const o = (ly * lutWidth + lx) * 4;
        const out = texel * 4;
        data[out] = outlineLut[o]!;
        data[out + 1] = outlineLut[o + 1]!;
        data[out + 2] = outlineLut[o + 2]!;
        data[out + 3] = outlineLut[o + 3]!;
      }
    }
  }
  return { data, width, height, depth };
}

export function cutRimCacheKey(cutFrac: readonly number[] | null | undefined, cellsLen: number): string {
  if (!cutFrac) return `none:${cellsLen}`;
  return `${cutFrac.map((v) => v.toFixed(5)).join(",")}:${cellsLen}`;
}
