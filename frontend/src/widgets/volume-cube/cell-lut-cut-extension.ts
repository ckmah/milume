import { ColorPalette3DExtensions } from "@hms-dbmi/viv";

import {
  CELL_LUT_WIDTH,
  EMPTY_CELL_LUT,
  instanceColor,
  type CellColoring,
  type CellLut,
  type ImagePalette,
} from "./cell-lut-extension";
import { type CellVolume, type Device, vivVolumeImage } from "./cell-volume";
import { type ImageFormat, imageTextureInfo } from "./image-volume";
import { DEFAULT_RENDER, type RenderSettings, paletteLut } from "./palettes";

type CubeUniforms = Partial<RenderSettings> & {
  cellsOn?: number;
  imageOn?: number;
  imageScale?: number;
  imageMip?: number;
  cellMip?: number;
  cutX0?: number;
  cutX1?: number;
  cutY0?: number;
  cutY1?: number;
  cutZ0?: number;
  cutZ1?: number;
};

function cubeRenderUniformBlock(extra = "") {
  return `\
uniform cubeRenderUniforms {
  float imageAlpha;
  float imageGamma;
  float cellAlpha;
  ${extra}float cellsOn;
  float imageOn;
  float imageScale;
  float imageMip;
  float cellMip;
  float cutX0;
  float cutX1;
  float cutY0;
  float cutY1;
  float cutZ0;
  float cutZ1;
} cubeRender;`;
}

const CUBE_RENDER_INJECT = {
  "fs:DECKGL_PROCESS_INTENSITY":
    "intensity = apply_contrast_limits(intensity * cubeRender.imageScale, contrastLimits);",
};

// Active cut with outlines: dual-plane LUT and rim fetches only on the cut face.
const cubeRenderModuleCut = {
  name: "cubeRender",
  uniformTypes: {
    imageAlpha: "f32",
    imageGamma: "f32",
    cellAlpha: "f32",
    cellOutlineOn: "f32",
    cellsOn: "f32",
    imageOn: "f32",
    imageScale: "f32",
    imageMip: "f32",
    cellMip: "f32",
    cutX0: "f32",
    cutX1: "f32",
    cutY0: "f32",
    cutY1: "f32",
    cutZ0: "f32",
    cutZ1: "f32",
  },
  defaultUniforms: {
    imageAlpha: 1,
    imageGamma: 1,
    cellAlpha: DEFAULT_RENDER.cellAlpha,
    cellOutlineOn: DEFAULT_RENDER.cellOutlineOn,
    cellsOn: 0,
    imageOn: 1,
    imageScale: 1,
    imageMip: 0,
    cellMip: 0,
    cutX0: 0,
    cutX1: 1,
    cutY0: 0,
    cutY1: 1,
    cutZ0: 0,
    cutZ1: 1,
  },
  getUniforms: (render: CubeUniforms = {}) => ({
    imageAlpha: render.imageAlpha ?? DEFAULT_RENDER.imageAlpha,
    imageGamma: render.imageGamma ?? DEFAULT_RENDER.imageGamma,
    cellAlpha: render.cellAlpha ?? DEFAULT_RENDER.cellAlpha,
    cellOutlineOn: render.cellOutlineOn ?? DEFAULT_RENDER.cellOutlineOn,
    cellsOn: render.cellsOn ?? 0,
    imageOn: render.imageOn ?? 1,
    imageScale: render.imageScale ?? 1,
    imageMip: render.imageMip ?? 0,
    cellMip: render.cellMip ?? 0,
    cutX0: render.cutX0 ?? 0,
    cutX1: render.cutX1 ?? 1,
    cutY0: render.cutY0 ?? 0,
    cutY1: render.cutY1 ?? 1,
    cutZ0: render.cutZ0 ?? 0,
    cutZ1: render.cutZ1 ?? 1,
  }),
  inject: CUBE_RENDER_INJECT,
  fs: `${cubeRenderUniformBlock("float cellOutlineOn;\n  ")}
uniform highp sampler3D imagePalette;
uniform highp sampler3D cellLut;
uniform highp sampler3D labelVolume;

vec3 srgbToLinear(vec3 c) { return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c)); }

float cover(float a, float steps) {
  return 1.0 - pow(clamp(1.0 - a, 0.0, 1.0), steps);
}

vec4 imageSample(float v) {
  float g = pow(clamp(v, 0.0, 1.0), cubeRender.imageGamma);
  vec3 c = srgbToLinear(texelFetch(imagePalette, ivec3(int(g * 255.0 + 0.5), 0, 0), 0).rgb);
  return vec4(c, g * cubeRender.imageAlpha * cubeRender.imageOn);
}

bool cutActive() {
  return cubeRender.cutX1 - cubeRender.cutX0 < 0.999
    || cubeRender.cutY1 - cubeRender.cutY0 < 0.999
    || cubeRender.cutZ1 - cubeRender.cutZ0 < 0.999;
}

bool onCutFace(vec3 p, float xLo, float xHi, float yLo, float yHi, float zLo, float zHi) {
  if (!cutActive()) return false;
  float e = 0.004;
  if (cubeRender.cutX0 > 0.001 && abs(p.x - xLo) < e) return true;
  if (cubeRender.cutX1 < 0.999 && abs(p.x - xHi) < e) return true;
  if (cubeRender.cutY0 > 0.001 && abs(p.y - yLo) < e) return true;
  if (cubeRender.cutY1 < 0.999 && abs(p.y - yHi) < e) return true;
  if (cubeRender.cutZ0 > 0.001 && abs(p.z - zLo) < e) return true;
  if (cubeRender.cutZ1 < 0.999 && abs(p.z - zHi) < e) return true;
  return false;
}

vec4 cellRimColor(int lx, int ly, int lutH, bool highlighted) {
  vec4 rim = texelFetch(cellLut, ivec3(lx, ly + lutH, 0), 0);
  vec4 neutral = texelFetch(cellLut, ivec3(0, lutH, 0), 0);
  vec4 c = highlighted ? rim : neutral;
  return vec4(c.rgb, c.a);
}

// Colour (linear RGB) and per-sample alpha of the label voxel at texel q.
// cellLut is two planes: fill rows 0..H/2-1, precomputed outline rows H/2..H-1.
vec4 cellColor(ivec3 q, vec3 p, float xLo, float xHi, float yLo, float yHi, float zLo, float zHi) {
  ivec2 b = ivec2(texelFetch(labelVolume, q, 0).rg * 255.0 + 0.5);
  int idx = b.x + 256 * (b.y & 127);
  if (idx == 0) return vec4(0.0);
  bool surface = b.y >= 128;
  ivec2 size = textureSize(cellLut, 0).xy;
  int lutH = size.y / 2;
  int lx = idx % size.x;
  int ly = idx / size.x;
  if (ly >= lutH) return vec4(0.0);
  vec4 own = texelFetch(cellLut, ivec3(lx, ly, 0), 0);
  bool hasRgb = dot(own.rgb, vec3(1.0)) > 1.0 / 255.0;
  if (!hasRgb || own.a <= 0.0) return vec4(0.0);
  float fillA = own.a * cubeRender.cellAlpha;
  bool showRim = onCutFace(p, xLo, xHi, yLo, yHi, zLo, zHi) && surface && cubeRender.cellOutlineOn > 0.5;
  if (showRim) return cellRimColor(lx, ly, lutH, own.a > 0.5 && hasRgb);
  return vec4(own.rgb, fillA);
}
`,
};

// No channel placeholders anywhere, so Viv does not repeat these lines per
// channel. With no labels bound, or Labels off, cellsOn skips the label fetch.
const CELL_SETUP = `
  ivec3 cellSize = textureSize(labelVolume, 0);
  bool cellsOn = cubeRender.cellsOn > 0.5;`;

const CELL_SAMPLE_CUT = `
    vec4 cell = canShow * cellColor(
      clamp(ivec3(p * vec3(cellSize)), ivec3(0), cellSize - 1),
      p, xLo, xHi, yLo, yHi, zLo, zHi);`;

const IN_CUT = `
    vec2 xS = fragmentUniforms3D.xSlice;
    vec2 yS = fragmentUniforms3D.ySlice;
    vec2 zS = fragmentUniforms3D.zSlice;
    float xLo = mix(xS.x, xS.y, cubeRender.cutX0);
    float xHi = mix(xS.x, xS.y, cubeRender.cutX1);
    float yLo = mix(yS.x, yS.y, cubeRender.cutY0);
    float yHi = mix(yS.x, yS.y, cubeRender.cutY1);
    float zLo = mix(zS.x, zS.y, cubeRender.cutZ0);
    float zHi = mix(zS.x, zS.y, cubeRender.cutZ1);
    bool inCut = p.x >= xLo - 0.002 && p.x <= xHi + 0.002
      && p.y >= yLo - 0.002 && p.y <= yHi + 0.002
      && p.z >= zLo - 0.002 && p.z <= zHi + 0.002;`;

const RENDERING_CUT = {
  _BEFORE_RENDER: `${CELL_SETUP}
  vec4 acc = vec4(0.0);
  float maxImage = -1.0;
  vec4 cells = vec4(0.0);
  float cellMax = 0.0;
  vec3 cellMaxRgb = vec3(0.0);
  bool ghosting = cutActive();
  float stepScale = 1.0;`,
  _RENDER: `
    ${IN_CUT}
    if (!(ghosting && !inCut)) {
      if (cubeRender.imageMip > 0.5) {
        maxImage = max(maxImage, intensityValue0);
      } else if (acc.a < 0.95) {
        vec4 im = imageSample(intensityValue0);
        float a = cover(im.a, stepScale);
        acc.rgb += (1.0 - acc.a) * a * im.rgb;
        acc.a += (1.0 - acc.a) * a;
      }
      if (cellsOn && (cubeRender.cellMip > 0.5 || cells.a < 0.95)) {
        if (cubeRender.cellMip > 0.5) {
          vec4 cellMip = canShow * cellColor(
            clamp(ivec3(p * vec3(cellSize)), ivec3(0), cellSize - 1),
            p, xLo, xHi, yLo, yHi, zLo, zHi);
          if (cellMip.a > cellMax) {
            cellMax = cellMip.a;
            cellMaxRgb = cellMip.rgb;
          }
        } else {
        ${CELL_SAMPLE_CUT}
          float a = cover(cell.a, stepScale);
          cells.rgb += (1.0 - cells.a) * a * cell.rgb;
          cells.a += (1.0 - cells.a) * a;
        }
      }
    }
    bool imageDone = cubeRender.imageMip < 0.5 && acc.a >= 0.95;
    float cellTarget = cubeRender.cellAlpha < 0.25 ? 0.68 : 0.95;
    bool cellsDone = !cellsOn || (cubeRender.cellMip < 0.5 && cells.a >= cellTarget);
    if (imageDone && cellsDone) {
      break;
    }`,
  _AFTER_RENDER: `
  vec4 imageOut = acc;
  if (cubeRender.imageMip > 0.5) {
    vec4 im = imageSample(maxImage);
    imageOut = vec4(im.rgb * cubeRender.imageAlpha * cubeRender.imageOn, cubeRender.imageOn);
  }
  vec4 cellsOut = cubeRender.cellMip > 0.5 ? vec4(cellMaxRgb * cellMax, cellMax) : cells;
  color = vec4(
    cellsOut.rgb + (1.0 - cellsOut.a) * imageOut.rgb,
    cellsOut.a + (1.0 - cellsOut.a) * imageOut.a
  );`,
};

/** Category/group rims: v1.1.0-style shared orange. Instance rims: near-white / near-black from luminance. */
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

function mirrorOutlinePlane(
  data: Uint8Array,
  width: number,
  fillRows: number,
  sharedOrange: readonly [number, number, number],
  outlineAlpha = 255,
  mode: "shared" | "luminance" = "shared",
) {
  const plane = width * fillRows;
  for (let i = 0; i < plane; i++) {
    const off = i * 4;
    const rgb: [number, number, number] = [data[off]!, data[off + 1]!, data[off + 2]!];
    const a = data[off + 3]!;
    const hasFill = a > 0 && rgb[0] + rgb[1] + rgb[2] > 1;
    const outlineRgb = hasFill ? contrastingOutlineRgb(rgb, sharedOrange, mode) : rgb;
    const outlineA = i === 0 ? a : hasFill ? outlineAlpha : a;
    const o = (plane + i) * 4;
    data[o] = outlineRgb[0];
    data[o + 1] = outlineRgb[1];
    data[o + 2] = outlineRgb[2];
    data[o + 3] = outlineA;
  }
}


const OTHERS = { color: "#d4d4d4", alpha: 0.4, behindGroups: 0.12 };
const OUTLINE = { color: "#f97316", alpha: 1, behindGroups: 0.35 };
const FILL_WEIGHT = 1;

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

function srgbToLinear(c: number): number {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}



/** Dual-plane lookup with precomputed contrasting rims for the cut-face shader. */
export function buildCellLutWithCutOutlines(coloring: CellColoring, cells: readonly number[]): CellLut {
  const n = Math.max(1, cells.length);
  const width = Math.min(CELL_LUT_WIDTH, n);
  const fillRows = Math.ceil(n / width);
  const height = fillRows * 2;
  const data = new Uint8Array(width * height * 4);
  const fill = Math.round(255 * FILL_WEIGHT);
  const outline = hexToLinear(OUTLINE.color)!;
  if (coloring.kind === "instances") {
    data.set([...outline, Math.round(255 * OUTLINE.alpha)], 0);
    for (let i = 1; i < cells.length; i++) data.set([...instanceColor(cells[i]!), fill], i * 4);
    mirrorOutlinePlane(data, width, fillRows, outline, Math.round(255 * OUTLINE.alpha), "luminance");
    return { data, width, height };
  }
  if (coloring.kind === "expression") {
    data.set([...outline, Math.round(255 * OUTLINE.alpha)], 0);
    for (let i = 1; i < cells.length; i++) {
      const rgb = coloring.byLabel.get(cells[i]!);
      if (rgb) data.set([rgb[0], rgb[1], rgb[2], 0], i * 4);
    }
    mirrorOutlinePlane(data, width, fillRows, outline, Math.round(255 * OUTLINE.alpha), "shared");
    return { data, width, height };
  }
  const { groups } = coloring;
  const sharedOutline = groups.length ? hexToLinear(OTHERS.color)! : outline;
  data.set(
    [...sharedOutline, Math.round(255 * (groups.length ? OUTLINE.behindGroups : OUTLINE.alpha))],
    0,
  );
  const others = hexToLinear(OTHERS.color)!;
  const othersFill = Math.round(255 * (groups.length ? OTHERS.behindGroups : OTHERS.alpha));
  const colour = new Map<number, [number, number, number]>();
  for (const g of groups) {
    const rgb = hexToLinear(g.color);
    if (!rgb) continue;
    for (const id of g.labels) if (id > 0) colour.set(id, rgb);
  }
  for (let i = 1; i < cells.length; i++) {
    const rgb = colour.get(cells[i]!);
    if (rgb) data.set([rgb[0], rgb[1], rgb[2], fill], i * 4);
    else data.set([...others, othersFill], i * 4);
  }
  mirrorOutlinePlane(
    data,
    width,
    fillRows,
    outline,
    Math.round(255 * (groups.length ? OUTLINE.behindGroups : OUTLINE.alpha)),
    "shared",
  );
  return { data, width, height };
}

type Texture = { destroy(): void };

type LayerLike = {
  constructor: { layerName?: string };
  props: {
    cellVolume?: CellVolume | null;
    cellColoring?: CellColoring | null;
    showImage?: boolean;
    imageMode?: "additive" | "mip";
    labelMode?: "additive" | "mip";
    onCellsBound?: (cells: CellVolume | null) => void;
    onImageBound?: (format: ImageFormat | null) => void;
    imagePalette?: ImagePalette | null;
    render?: RenderSettings | null;
    cutFrac?: number[] | null;
    channelData?: { data?: unknown[] } | null;
  };
  state: {
    model?: {
      setBindings(b: Record<string, unknown>): void;
      shaderInputs: { setProps(p: Record<string, unknown>): void };
    } | null;
    cellLutTexture?: Texture | null;
    cellLutFor?: { cells: CellVolume | null; coloring: CellColoring | null } | null;
    boundCells?: CellVolume | null;
    boundImage?: ImageFormat | null;
    textures?: { volume0?: unknown } | null;
    noCellsTexture?: Texture | null;
    paletteTexture?: Texture | null;
  };
  context: { device: Device };
  setState(patch: Record<string, unknown>): void;
};

function isRaycaster(layer: LayerLike): boolean {
  return layer.constructor.layerName === "CubeXR3DLayer";
}

const NEAREST = {
  minFilter: "nearest",
  magFilter: "nearest",
  addressModeU: "clamp-to-edge",
  addressModeV: "clamp-to-edge",
  addressModeW: "clamp-to-edge",
};

function lookupTexture(layer: LayerLike, lut: CellLut | ImagePalette): Texture {
  return layer.context.device.createTexture({
    dimension: "3d",
    width: lut.width,
    height: lut.height,
    depth: 1,
    format: "rgba8unorm",
    data: lut.data,
    mipmaps: false,
    sampler: NEAREST,
  });
}

function bindCells(layer: LayerLike): CellVolume | null {
  const drawn = vivVolumeImage(layer.props.channelData?.data?.[0]);
  const next = layer.props.cellVolume ?? null;
  const bound = layer.state.boundCells ?? null;
  let want: CellVolume | null = null;
  if (next && !next.destroyed && next.image === drawn) want = next;
  else if (bound && !bound.destroyed && bound.image === drawn) want = bound;
  if (want !== bound) {
    want?.use();
    bound?.unuse();
    layer.state.boundCells = want;
    layer.props.onCellsBound?.(want);
  }
  return want;
}

class CubeCutOutlineExtension extends ColorPalette3DExtensions.BaseExtension {
  static componentName = "CubeCutOutlineExtension";
  static extensionName = "CubeCutOutlineExtension";
  rendering = RENDERING_CUT;

  getVivShaderTemplates() {
    return { modules: [cubeRenderModuleCut] };
  }

  updateState(update: { props: object; oldProps: object }) {
    const layer = this as unknown as LayerLike;
    const { props, oldProps } = update as { props: LayerLike["props"]; oldProps: LayerLike["props"] };
    if (!isRaycaster(layer)) return;
    if (!layer.state.paletteTexture || props.imagePalette !== oldProps.imagePalette) {
      layer.state.paletteTexture?.destroy();
      const palette = props.imagePalette ?? paletteLut(props.render?.palette ?? DEFAULT_RENDER.palette);
      layer.setState({ paletteTexture: lookupTexture(layer, palette) });
    }
    if (!layer.state.noCellsTexture) {
      const noCells = layer.context.device.createTexture({
        dimension: "3d",
        width: 1,
        height: 1,
        depth: 1,
        format: "rg8unorm",
        data: new Uint8Array(2),
        mipmaps: false,
        sampler: NEAREST,
      });
      layer.setState({ noCellsTexture: noCells });
    }
  }

  draw() {
    const layer = this as unknown as LayerLike;
    if (!isRaycaster(layer)) return;
    const { model, paletteTexture, noCellsTexture } = layer.state;
    if (!model || !paletteTexture || !noCellsTexture) return;
    const cells = bindCells(layer);
    const coloring = layer.props.cellColoring ?? null;
    const lutFor = layer.state.cellLutFor;
    if (!layer.state.cellLutTexture || !lutFor || lutFor.cells !== cells || lutFor.coloring !== coloring) {
      layer.state.cellLutTexture?.destroy();
      const lut =
        cells && coloring ? buildCellLutWithCutOutlines(coloring, cells.cells) : EMPTY_CELL_LUT;
      layer.state.cellLutTexture = lookupTexture(layer, lut);
      layer.state.cellLutFor = { cells, coloring };
    }
    const labelVolume = cells?.texture(layer.context.device) ?? null;
    const cellsOn = labelVolume && coloring ? 1 : 0;
    model.setBindings({
      labelVolume: labelVolume ?? noCellsTexture,
      cellLut: layer.state.cellLutTexture,
      imagePalette: paletteTexture,
    });
    const imageOn = layer.props.showImage === false ? 0 : 1;
    const image = imageTextureInfo(layer.state.textures?.volume0);
    const imageFormat = image?.format ?? null;
    if (imageFormat !== (layer.state.boundImage ?? null)) {
      layer.state.boundImage = imageFormat;
      layer.props.onImageBound?.(imageFormat);
    }
    const frac = layer.props.cutFrac;
    const uniforms: CubeUniforms = {
      ...(layer.props.render ?? DEFAULT_RENDER),
      cellsOn,
      imageOn,
      imageScale: image?.scale ?? 1,
      imageMip: layer.props.imageMode === "mip" ? 1 : 0,
      cellMip: layer.props.labelMode === "mip" ? 1 : 0,
      cutX0: frac?.[0] ?? 0,
      cutX1: frac?.[1] ?? 1,
      cutY0: frac?.[2] ?? 0,
      cutY1: frac?.[3] ?? 1,
      cutZ0: frac?.[4] ?? 0,
      cutZ1: frac?.[5] ?? 1,
    };
    model.shaderInputs.setProps({ cubeRender: uniforms });
  }

  finalizeState() {
    const layer = this as unknown as LayerLike;
    if (!isRaycaster(layer)) return;
    layer.state.boundCells?.unuse();
    layer.state.boundCells = null;
    layer.state.cellLutTexture?.destroy();
    layer.state.noCellsTexture?.destroy();
    layer.state.paletteTexture?.destroy();
  }
}

export function cutOutlineShaderActive(
  cutFrac: number[] | null | undefined,
  render: RenderSettings | null | undefined,
): boolean {
  if (!cutFrac || (render?.cellOutlineOn ?? DEFAULT_RENDER.cellOutlineOn) < 0.5) return false;
  return (
    cutFrac[1]! - cutFrac[0]! < 0.999 ||
    cutFrac[3]! - cutFrac[2]! < 0.999 ||
    cutFrac[5]! - cutFrac[4]! < 0.999
  );
}

export const CUBE_EXTENSIONS_CUT_OUTLINE: unknown[] = [new CubeCutOutlineExtension()];
