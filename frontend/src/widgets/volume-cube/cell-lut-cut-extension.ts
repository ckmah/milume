import { ColorPalette3DExtensions } from "@hms-dbmi/viv";

import {
  buildCellLut,
  CELL_LUT_WIDTH,
  EMPTY_CELL_LUT,
  type CellColoring,
  type CellLut,
  type ImagePalette,
} from "./cell-lut-extension";
import { buildCellOutlineLut, buildCutRimMask, cutRimCacheKey } from "./cut-rim-mask";
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

// Cut outlines: main fill LUT + CPU-precomputed cutRimMask (one tap on cut voxels only).
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
uniform highp sampler3D cutRimMask;

vec3 srgbToLinear(vec3 c) { return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c)); }

float cover(float a, float steps) {
  return 1.0 - pow(clamp(1.0 - a, 0.0, 1.0), steps);
}

vec4 imageSample(float v) {
  float g = pow(clamp(v, 0.0, 1.0), cubeRender.imageGamma);
  vec3 c = srgbToLinear(texelFetch(imagePalette, ivec3(int(g * 255.0 + 0.5), 0, 0), 0).rgb);
  return vec4(c, g * cubeRender.imageAlpha * cubeRender.imageOn);
}

bool onCutFace(vec3 p, float xLo, float xHi, float yLo, float yHi, float zLo, float zHi) {
  float e = 0.004;
  if (cubeRender.cutX0 > 0.001 && abs(p.x - xLo) < e) return true;
  if (cubeRender.cutX1 < 0.999 && abs(p.x - xHi) < e) return true;
  if (cubeRender.cutY0 > 0.001 && abs(p.y - yLo) < e) return true;
  if (cubeRender.cutY1 < 0.999 && abs(p.y - yHi) < e) return true;
  if (cubeRender.cutZ0 > 0.001 && abs(p.z - zLo) < e) return true;
  if (cubeRender.cutZ1 < 0.999 && abs(p.z - zHi) < e) return true;
  return false;
}

// Same fill path as main cell-lut-extension; cutRimMask overrides on cut-face voxels only.
vec4 cellColor(ivec3 q, vec3 p, float xLo, float xHi, float yLo, float yHi, float zLo, float zHi) {
  if (cubeRender.cellOutlineOn > 0.5 && onCutFace(p, xLo, xHi, yLo, yHi, zLo, zHi)) {
    vec4 rim = texelFetch(cutRimMask, q, 0);
    if (rim.a > 1.0 / 255.0) return rim;
  }
  ivec2 b = ivec2(texelFetch(labelVolume, q, 0).rg * 255.0 + 0.5);
  int idx = b.x + 256 * (b.y & 127);
  if (idx == 0) return vec4(0.0);
  ivec2 size = textureSize(cellLut, 0).xy;
  vec4 own = vec4(0.0);
  if (idx < size.x * size.y) own = texelFetch(cellLut, ivec3(idx % size.x, idx / size.x, 0), 0);
  vec4 c = own.a > 0.0 ? own : texelFetch(cellLut, ivec3(0), 0);
  return c;
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
  bool ghosting = cubeRender.cutX1 - cubeRender.cutX0 < 0.999
    || cubeRender.cutY1 - cubeRender.cutY0 < 0.999
    || cubeRender.cutZ1 - cubeRender.cutZ0 < 0.999;
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
        ${CELL_SAMPLE_CUT}
        if (cubeRender.cellMip > 0.5) {
          if (cell.a > cellMax) {
            cellMax = cell.a;
            cellMaxRgb = cell.rgb;
          }
        } else {
          float a = cover(cell.a, stepScale);
          cells.rgb += (1.0 - cells.a) * a * cell.rgb;
          cells.a += (1.0 - cells.a) * a;
        }
      }
    }
    bool imageDone = cubeRender.imageMip < 0.5 && acc.a >= 0.95;
    bool cellsDone = !cellsOn || (cubeRender.cellMip < 0.5 && cells.a >= 0.95);
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
  cellsOut *= cubeRender.cellAlpha;
  color = vec4(
    cellsOut.rgb + (1.0 - cellsOut.a) * imageOut.rgb,
    cellsOut.a + (1.0 - cellsOut.a) * imageOut.a
  );`,
};

const VIV_SHADER_TEMPLATES_CUT = { modules: [cubeRenderModuleCut] };

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
    emptyRimTexture?: Texture | null;
    paletteTexture?: Texture | null;
    outlineLut?: Uint8Array | null;
    outlineLutFor?: { cells: CellVolume | null; coloring: CellColoring | null } | null;
    rimMaskTexture?: Texture | null;
    rimMaskFor?: {
      cutKey: string;
      cells: CellVolume | null;
      coloring: CellColoring | null;
    } | null;
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

function rimMaskTexture(layer: LayerLike, mask: { data: Uint8Array; width: number; height: number; depth: number }): Texture {
  return layer.context.device.createTexture({
    dimension: "3d",
    width: mask.width,
    height: mask.height,
    depth: mask.depth,
    format: "rgba8unorm",
    data: mask.data,
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
    return VIV_SHADER_TEMPLATES_CUT;
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
    if (!layer.state.emptyRimTexture) {
      const emptyRim = layer.context.device.createTexture({
        dimension: "3d",
        width: 1,
        height: 1,
        depth: 1,
        format: "rgba8unorm",
        data: new Uint8Array(4),
        mipmaps: false,
        sampler: NEAREST,
      });
      layer.setState({ emptyRimTexture: emptyRim });
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
    let lutWidth = 1;
    if (!layer.state.cellLutTexture || !lutFor || lutFor.cells !== cells || lutFor.coloring !== coloring) {
      layer.state.cellLutTexture?.destroy();
      const lut = cells && coloring ? buildCellLut(coloring, cells.cells) : EMPTY_CELL_LUT;
      lutWidth = lut.width;
      layer.state.cellLutTexture = lookupTexture(layer, lut);
      layer.state.cellLutFor = { cells, coloring };
      layer.state.outlineLut = null;
      layer.state.outlineLutFor = null;
      layer.state.rimMaskFor = null;
      layer.state.rimMaskTexture?.destroy();
      layer.state.rimMaskTexture = null;
    } else if (cells && coloring) {
      lutWidth = Math.min(CELL_LUT_WIDTH, cells.cells.length);
    }
    const outlineFor = layer.state.outlineLutFor;
    if (cells && coloring && (!outlineFor || outlineFor.cells !== cells || outlineFor.coloring !== coloring)) {
      layer.state.outlineLut = buildCellOutlineLut(coloring, cells.cells);
      layer.state.outlineLutFor = { cells, coloring };
      layer.state.rimMaskFor = null;
      layer.state.rimMaskTexture?.destroy();
      layer.state.rimMaskTexture = null;
    }
    const frac = layer.props.cutFrac;
    const outlineOn = (layer.props.render?.cellOutlineOn ?? DEFAULT_RENDER.cellOutlineOn) > 0.5;
    const cutKey = cutRimCacheKey(frac, cells?.cells.length ?? 0);
    const rimFor = layer.state.rimMaskFor;
    let rimTex = layer.state.emptyRimTexture;
    if (cells && coloring && outlineOn && frac && layer.state.outlineLut) {
      if (
        !layer.state.rimMaskTexture ||
        !rimFor ||
        rimFor.cutKey !== cutKey ||
        rimFor.cells !== cells ||
        rimFor.coloring !== coloring
      ) {
        const mask = buildCutRimMask(
          cells.labelRg8,
          cells.labelWidth,
          cells.labelHeight,
          cells.labelDepth,
          frac,
          layer.state.outlineLut,
          lutWidth,
        );
        layer.state.rimMaskTexture?.destroy();
        layer.state.rimMaskTexture = rimMaskTexture(layer, mask);
        layer.state.rimMaskFor = { cutKey, cells, coloring };
      }
      rimTex = layer.state.rimMaskTexture ?? rimTex;
    }
    const labelVolume = cells?.texture(layer.context.device) ?? null;
    const cellsOn = labelVolume && coloring ? 1 : 0;
    model.setBindings({
      labelVolume: labelVolume ?? noCellsTexture,
      cellLut: layer.state.cellLutTexture,
      cutRimMask: rimTex,
      imagePalette: paletteTexture,
    });
    const imageOn = layer.props.showImage === false ? 0 : 1;
    const image = imageTextureInfo(layer.state.textures?.volume0);
    const imageFormat = image?.format ?? null;
    if (imageFormat !== (layer.state.boundImage ?? null)) {
      layer.state.boundImage = imageFormat;
      layer.props.onImageBound?.(imageFormat);
    }
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
    layer.state.rimMaskTexture?.destroy();
    layer.state.noCellsTexture?.destroy();
    layer.state.emptyRimTexture?.destroy();
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
