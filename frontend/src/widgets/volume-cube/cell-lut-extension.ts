import { ColorPalette3DExtensions } from "@hms-dbmi/viv";

import { type CellVolume, type Device, vivVolumeImage } from "./cell-volume";
import { type ImageFormat, imageTextureInfo } from "./image-volume";
import { DEFAULT_RENDER, type RenderSettings, paletteLut } from "./palettes";

/**
 * Viv volume rendering for an image, plus the window's cells from a second,
 * compact texture.
 *
 * Viv raycasts the image alone (`volume0`, at its own dtype: image-volume.ts),
 * coloured through a 256-texel palette (`imagePalette`) with alpha and gamma
 * from the `render` prop; with `showImage` false the image adds nothing (a
 * uniform, no refetch). Once labels load, `labelVolume` (an RG8 3D texture on
 * the same grid, see `cell-volume.ts`) holds each voxel's local cell index and
 * a surface flag. Cells draw as shells: only surface voxels contribute, and
 * interiors stay clear. A small RGBA lookup texture (`cellLut`) maps local
 * index -> shell colour and alpha for a highlighted cell; texel 0 is the colour
 * and alpha of the shells that are not highlighted.
 *
 * Showing, hiding or recolouring cells rewrites only the lookup texture (a few
 * KB), never the volume textures, so the Labels switch and a new highlight are
 * one redraw instead of a refetch and re-upload of the window.
 *
 * The label texture is sampled at the same ray position as the image, so it
 * shares the volume's model matrix (and pan) by construction. It is read with
 * texelFetch: filtering would blend neighbouring indices into unrelated cells.
 */

/**
 * Width of the lookup texture; indices wrap onto rows. It is a 3D texture, and
 * desktop GPUs cap each 3D axis at 2048.
 */
export const CELL_LUT_WIDTH = 2048;

export type CellLut = { data: Uint8Array; width: number; height: number };

/** Nothing drawn for any cell: used while Labels is off or no labels are bound. */
export const EMPTY_CELL_LUT: CellLut = { data: new Uint8Array(4), width: 1, height: 1 };

// Defined beside the palettes so chrome can use them without importing Viv.
export { DEFAULT_RENDER, type RenderSettings } from "./palettes";

/** A 256-texel image colour map from `paletteLut`. */
export type ImagePalette = { data: Uint8Array; width: number; height: number };

type CubeUniforms = Partial<RenderSettings> & {
  cellsOn?: number;
  imageOn?: number;
  imageScale?: number;
  imageMip?: number;
  cellMip?: number;
};

// The module must not share a sampler's name: luma.gl keys a module's
// uniforms by module name and would set that sampler's texture unit from them.
const cubeRenderModule = {
  name: "cubeRender",
  uniformTypes: {
    imageAlpha: "f32",
    imageGamma: "f32",
    cellAlpha: "f32",
    cellsOn: "f32",
    imageOn: "f32",
    imageScale: "f32",
    imageMip: "f32",
    cellMip: "f32",
  },
  defaultUniforms: {
    imageAlpha: 1,
    imageGamma: 1,
    cellAlpha: DEFAULT_RENDER.cellAlpha,
    cellsOn: 0,
    imageOn: 1,
    imageScale: 1,
    imageMip: 0,
    cellMip: 0,
  },
  // Only the numbers reach the uniform block; the palette is a texture.
  getUniforms: (render: CubeUniforms = {}) => ({
    imageAlpha: render.imageAlpha ?? DEFAULT_RENDER.imageAlpha,
    imageGamma: render.imageGamma ?? DEFAULT_RENDER.imageGamma,
    cellAlpha: render.cellAlpha ?? DEFAULT_RENDER.cellAlpha,
    cellsOn: render.cellsOn ?? 0,
    imageOn: render.imageOn ?? 1,
    imageScale: render.imageScale ?? 1,
    imageMip: render.imageMip ?? 0,
    cellMip: render.cellMip ?? 0,
  }),
  // Viv's contrast ramp on the raw value: a unorm image texture (r8unorm,
  // r16unorm) samples as value / max, and imageScale (max; 1 for float)
  // undoes that first, so contrast limits mean what they did at float32.
  // Defined here, the hook replaces Viv's default ramp (XR3DLayer.getShaders).
  inject: {
    "fs:DECKGL_PROCESS_INTENSITY":
      "intensity = apply_contrast_limits(intensity * cubeRender.imageScale, contrastLimits);",
  },
  fs: `\
uniform cubeRenderUniforms {
  float imageAlpha;
  float imageGamma;
  float cellAlpha;
  float cellsOn;
  float imageOn;
  float imageScale;
  float imageMip;
  float cellMip;
} cubeRender;

// All 3D textures, the lookups one texel deep: luma.gl validates the program
// before it assigns texture units, and a sampler2D beside Viv's sampler3Ds (all
// on unit 0 then) fails that validation.
uniform highp sampler3D imagePalette;
uniform highp sampler3D cellLut;
// RG8 per voxel: local cell index r + 256 * (g & 127), surface flag g & 128.
uniform highp sampler3D labelVolume;

vec3 srgbToLinear(vec3 c) { return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c)); }

// Image value after contrast -> (linear rgb, per-sample alpha); clear with the image off.
vec4 imageSample(float v) {
  float g = pow(clamp(v, 0.0, 1.0), cubeRender.imageGamma);
  vec3 c = srgbToLinear(texelFetch(imagePalette, ivec3(int(g * 255.0 + 0.5), 0, 0), 0).rgb);
  return vec4(c, g * cubeRender.imageAlpha * cubeRender.imageOn);
}

// Colour (linear RGB) and per-sample alpha of the label voxel at texel q.
vec4 cellColor(ivec3 q) {
  ivec2 b = ivec2(texelFetch(labelVolume, q, 0).rg * 255.0 + 0.5);
  int idx = b.x + 256 * (b.y & 127);
  if (idx == 0) return vec4(0.0);
  // Cells are shells: interior voxels draw nothing.
  if (b.y < 128) return vec4(0.0);
  ivec2 size = textureSize(cellLut, 0).xy;
  vec4 own = vec4(0.0);
  if (idx < size.x * size.y) own = texelFetch(cellLut, ivec3(idx % size.x, idx / size.x, 0), 0);
  // A highlighted cell's shell in its own colour, otherwise the shared outline.
  vec4 c = own.a > 0.0 ? own : texelFetch(cellLut, ivec3(0), 0);
  return vec4(c.rgb, c.a * cubeRender.cellAlpha);
}
`,
};

// No channel placeholders anywhere, so Viv does not repeat these lines per
// channel. With no labels bound, or Labels off, cellsOn skips the label fetch.
const CELL_SETUP = `
  ivec3 cellSize = textureSize(labelVolume, 0);
  bool cellsOn = cubeRender.cellsOn > 0.5;`;

const CELL_SAMPLE = `
    vec4 cell = canShow * cellColor(clamp(ivec3(p * vec3(cellSize)), ivec3(0), cellSize - 1));`;

// One loop for every combination of the two projections (uniforms, so a
// toggle needs no recompile). The image accumulates samples (Additive) or keeps
// the maximum (MIP); the labels accumulate shells front to back (Additive) or
// keep the strongest shell (MIP). Labels composite over the image either way.
// Viv steps \`p\` after _RENDER, so _RENDER may break but must not continue.
const RENDERING = {
  _BEFORE_RENDER: `${CELL_SETUP}
  vec4 acc = vec4(0.0);
  float maxImage = -1.0;
  vec4 cells = vec4(0.0);
  float cellMax = 0.0;
  vec3 cellMaxRgb = vec3(0.0);`,
  _RENDER: `
    if (cubeRender.imageMip > 0.5) {
      maxImage = max(maxImage, intensityValue0);
    } else {
      vec4 im = imageSample(intensityValue0);
      acc.rgb += (1.0 - acc.a) * im.a * im.rgb;
      acc.a += (1.0 - acc.a) * im.a;
    }
    if (cellsOn) {
      ${CELL_SAMPLE}
      if (cubeRender.cellMip > 0.5) {
        if (cell.a > cellMax) {
          cellMax = cell.a;
          cellMaxRgb = cell.rgb;
        }
      } else if (cells.a < 0.95) {
        cells.rgb += (1.0 - cells.a) * cell.a * cell.rgb;
        cells.a += (1.0 - cells.a) * cell.a;
      }
    }
    bool imageDone = cubeRender.imageMip < 0.5 && acc.a >= 0.95;
    bool cellsDone = !cellsOn || (cubeRender.cellMip < 0.5 && cells.a >= 0.95);
    if (imageDone && cellsDone) {
      break;
    }`,
  _AFTER_RENDER: `
  // The image: opaque maximum projection, or the accumulated samples.
  // The projection is opaque: weighting it by the sample alpha (g) as well
  // would square the ramp and darken everything below full intensity. With
  // the image off only the labels remain, at their own alpha.
  vec4 imageOut = acc;
  if (cubeRender.imageMip > 0.5) {
    vec4 im = imageSample(maxImage);
    imageOut = vec4(im.rgb * cubeRender.imageAlpha * cubeRender.imageOn, cubeRender.imageOn);
  }
  // The labels: the strongest shell along the ray, or the accumulated shells.
  vec4 cellsOut = cubeRender.cellMip > 0.5 ? vec4(cellMaxRgb, cellMax) : cells;
  // Labels over the image.
  color = vec4(
    cellsOut.rgb + (1.0 - cellsOut.a) * imageOut.rgb,
    cellsOut.a + (1.0 - cellsOut.a) * imageOut.a
  );`,
};

type Texture = { destroy(): void };

type LayerLike = {
  constructor: { layerName?: string };
  props: {
    /** The shown window's labels, or null. */
    cellVolume?: CellVolume | null;
    /** Highlight groups while Labels is on; null hides every cell. */
    cellGroups?: readonly HighlightGroup[] | null;
    /** Default true; false: the image adds nothing to the ray (labels still draw). */
    showImage?: boolean;
    /** Default "additive": accumulate the image's samples; "mip": its maximum along the ray. */
    imageMode?: "additive" | "mip";
    /** Default "additive": accumulate the shells front to back; "mip": the strongest shell along the ray. */
    labelMode?: "additive" | "mip";
    /** Called when the labels this layer draws change (null: none). */
    onCellsBound?: (cells: CellVolume | null) => void;
    /** Called when the format of the image texture this layer draws changes (null: none yet). */
    onImageBound?: (format: ImageFormat | null) => void;
    imagePalette?: ImagePalette | null;
    render?: RenderSettings | null;
    /** Set by Viv's VolumeLayer: `data[0]` is the image volume being drawn. */
    channelData?: { data?: unknown[] } | null;
  };
  state: {
    model?: {
      setBindings(b: Record<string, unknown>): void;
      shaderInputs: { setProps(p: Record<string, unknown>): void };
    } | null;
    cellLutTexture?: Texture | null;
    /** What `cellLutTexture` was built for. */
    cellLutFor?: { cells: CellVolume | null; groups: readonly HighlightGroup[] | null } | null;
    boundCells?: CellVolume | null;
    /** Format of the image texture last drawn. */
    boundImage?: ImageFormat | null;
    /** Set by Viv's XR3DLayer: `volume0` is the image texture it draws. */
    textures?: { volume0?: unknown } | null;
    noCellsTexture?: Texture | null;
    paletteTexture?: Texture | null;
  };
  context: { device: Device };
  setState(patch: Record<string, unknown>): void;
};

/** Only the cube's XR3DLayer (image-volume.ts) draws; its VolumeLayer parent shares the extension. */
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

/** A one-deep, unfiltered RGBA8 3D texture (see the module's sampler note). */
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

/**
 * The labels to draw with the image Viv draws now: the shown window's once
 * Viv's image is that window's; until then, the labels already bound (Viv
 * copies a new window for a while after it is handed over, and draws the old
 * one meanwhile).
 */
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
    // Plain state: set while drawing, so it must not ask for a layer update.
    layer.state.boundCells = want;
    layer.props.onCellsBound?.(want);
  }
  return want;
}

/** The cube's raycast, with or without labels, each layer in its own projection. */
class CubeExtension extends ColorPalette3DExtensions.BaseExtension {
  static componentName = "CubeExtension";
  static extensionName = "CubeExtension";
  rendering = RENDERING;

  getVivShaderTemplates() {
    return { modules: [cubeRenderModule] };
  }

  // deck.gl calls these with `this` bound to the layer.
  updateState(update: { props: object; oldProps: object }) {
    const layer = this as unknown as LayerLike;
    const { props, oldProps } = update as { props: LayerLike["props"]; oldProps: LayerLike["props"] };
    if (!isRaycaster(layer)) return;
    if (!layer.state.paletteTexture || props.imagePalette !== oldProps.imagePalette) {
      layer.state.paletteTexture?.destroy();
      const palette = props.imagePalette ?? paletteLut(props.render?.palette ?? DEFAULT_RENDER.palette);
      layer.setState({ paletteTexture: lookupTexture(layer, palette) });
    }
    // Bound in place of a window's labels when there are none: every sampler must be.
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
    const groups = layer.props.cellGroups ?? null;
    // The lookup follows the labels actually bound, so a window Viv is still
    // replacing keeps its own colours.
    const lutFor = layer.state.cellLutFor;
    if (!layer.state.cellLutTexture || !lutFor || lutFor.cells !== cells || lutFor.groups !== groups) {
      layer.state.cellLutTexture?.destroy();
      const lut = cells && groups ? buildCellLut(groups, cells.cells) : EMPTY_CELL_LUT;
      layer.state.cellLutTexture = lookupTexture(layer, lut);
      layer.state.cellLutFor = { cells, groups };
    }
    const labelVolume = cells?.texture(layer.context.device) ?? null;
    const cellsOn = labelVolume && groups ? 1 : 0;
    model.setBindings({
      labelVolume: labelVolume ?? noCellsTexture,
      cellLut: layer.state.cellLutTexture,
      imagePalette: paletteTexture,
    });
    const imageOn = layer.props.showImage === false ? 0 : 1;
    // The image texture Viv binds for this draw: the one it last loaded.
    const image = imageTextureInfo(layer.state.textures?.volume0);
    const imageFormat = image?.format ?? null;
    if (imageFormat !== (layer.state.boundImage ?? null)) {
      // Plain state, as for boundCells.
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

/** One instance: the projections are uniforms, so the program never changes with them. */
export const CUBE_EXTENSIONS: unknown[] = [new CubeExtension()];

function srgbToLinear(c: number): number {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function hexToLinear(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = Number.parseInt(m[1]!, 16);
  // Viv converts the blended colour to sRGB at the end; stored linear, an
  // opaque cell comes out in exactly the Landmarks colour.
  return [
    Math.round(srgbToLinear((n >> 16) & 255) * 255),
    Math.round(srgbToLinear((n >> 8) & 255) * 255),
    Math.round(srgbToLinear(n & 255) * 255),
  ];
}

export type HighlightGroup = { name: string; color: string; labels: number[] };

/** Per-sample alpha of a highlighted cell's shell, before the Labels alpha slider (default 0.6, see `DEFAULT_RENDER`). */
const HIGHLIGHT_ALPHA = 0.9;
/** Shells of other cells: the orange default with nothing highlighted, faint behind highlights. */
const OUTLINE = { color: "#f97316", alpha: 0.4, behindHighlight: 0.12 };

/**
 * Lookup texture for one window's cells (`cells[i]`: the global id of local
 * index i) under the given highlight groups. Texel 0: the shared outline;
 * texel i: cell i's shell colour, or clear when it is in no group (a later
 * group wins).
 */
export function buildCellLut(groups: readonly HighlightGroup[], cells: readonly number[]): CellLut {
  const n = Math.max(1, cells.length);
  const width = Math.min(CELL_LUT_WIDTH, n);
  const height = Math.ceil(n / width);
  const data = new Uint8Array(width * height * 4);
  const outline = hexToLinear(OUTLINE.color)!;
  data.set([...outline, Math.round(255 * (groups.length ? OUTLINE.behindHighlight : OUTLINE.alpha))], 0);
  const shell = Math.round(255 * HIGHLIGHT_ALPHA);
  const colour = new Map<number, [number, number, number]>();
  for (const g of groups) {
    const rgb = hexToLinear(g.color);
    if (!rgb) continue;
    for (const id of g.labels) if (id > 0) colour.set(id, rgb);
  }
  for (let i = 1; i < cells.length; i++) {
    const rgb = colour.get(cells[i]!);
    if (rgb) data.set([rgb[0], rgb[1], rgb[2], shell], i * 4);
  }
  return { data, width, height };
}
