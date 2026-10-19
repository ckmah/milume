/**
 * Cells as lit meshes inside the Inspect cube. A worker lofts each cell's per-slice
 * polygons (cell-loft/) and returns one buffer per window, vertices in window-relative
 * µm. One affine model matrix places them in the cube's pre-model world, the same
 * placement the scatter points use, so panning only changes a matrix. Colour comes
 * from a LUT texture indexed by per-vertex texCoords, one texel per cell, so a recolour
 * swaps a texture and never rebuilds geometry.
 *
 * The meshes never draw to the screen. Each frame they render offscreen, before the
 * image raycast, into a `MeshTarget`: the nearest front face and the nearest back face
 * per pixel, each as colour + alpha and depth. The raycast (cell-lut-extension.ts)
 * composites both surfaces at their distance along the ray, so image in front of a
 * cell stays in front and image behind it is covered by the cell's alpha.
 */
import { AmbientLight, COORDINATE_SYSTEM, DirectionalLight, LightingEffect } from "@deck.gl/core";
import { SimpleMeshLayer } from "@deck.gl/mesh-layers";
import { Matrix4 } from "@math.gl/core";

import { type CellColoring, buildCellLut } from "./cell-lut-extension";
import { type ClipBox, cellMeshClipModule } from "./cell-mesh-clip";
import { vivTag } from "./overlay-layers";

export type CellMeshData = {
  originUm: [number, number, number];
  positions: Float32Array;
  normals: Float32Array;
  /** Per vertex: the index of its cell in `ids`. */
  cells: Uint32Array;
  indices: Uint32Array;
  /** Per cell: its table row + 1 (0 when the table has none), the id colourings use. */
  ids: Int32Array;
};

/**
 * How the meshes draw over the image, beside their peak opacity (`render.cellAlpha`).
 * Every field is a uniform or a layer prop, so a change redraws and never rebuilds geometry.
 * - fresnelMin: alpha of a face seen head-on (at most the peak); 0 turns the view-angle fade off.
 * - shine: specular strength, 0 (matte) to 1.
 * - flat: shading flatness, 0 (ambient 0.55, diffuse 0.65) to 1 (nearly unlit).
 * - imgBoost: contrast boost on the image under the meshes, 0 (off) to 1.
 */
export type MeshLook = { fresnelMin: number; shine: number; flat: number; imgBoost: number };
export const DEFAULT_MESH_LOOK: MeshLook = { fresnelMin: 0.35, shine: 0, flat: 0.6, imgBoost: 0.75 };

function meshMaterial(look: MeshLook) {
  const f = Math.min(1, Math.max(0, look.flat)), s = Math.min(1, Math.max(0, look.shine));
  const spec = Math.round(255 * 0.5 * s);
  return { ambient: 0.55 + 0.45 * f, diffuse: 0.65 * (1 - 0.7 * f), shininess: s > 0 ? 4 + 28 * s : 1, specularColor: [spec, spec, spec] };
}

/**
 * The image under the meshes, from the active contrast window and gamma: the window
 * narrows (lo up 20%, hi down 30% of its width at boost 1) and gamma rises (×1.6), so
 * nuclei brighten and the dim background thins out behind the cells.
 */
export function boostedImage(contrast: [number, number], gamma: number, boost: number): { contrast: [number, number]; gamma: number } {
  const b = Math.min(1, Math.max(0, boost));
  const w = contrast[1] - contrast[0];
  return { contrast: [contrast[0] + 0.2 * b * w, contrast[1] - 0.3 * b * w], gamma: gamma * (1 + 0.6 * b) };
}

const LUT_W = 256;

function lutTexCoords(mesh: CellMeshData): Float32Array {
  const h = Math.ceil((mesh.ids.length + 1) / LUT_W);
  const out = new Float32Array(mesh.cells.length * 2);
  for (let i = 0; i < mesh.cells.length; i++) {
    const t = mesh.cells[i]! + 1;
    out[2 * i] = ((t % LUT_W) + 0.5) / LUT_W;
    out[2 * i + 1] = (Math.floor(t / LUT_W) + 0.5) / h;
  }
  return out;
}

function linearToSrgb(b: number): number {
  const c = b / 255;
  const s = c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055;
  return Math.round(Math.min(1, Math.max(0, s)) * 255);
}

/** The window's cell colours as an sRGB image, texel k + 1 for cell k; cells the colouring leaves out take texel 0's. */
export function cellMeshLut(mesh: CellMeshData, coloring: CellColoring): ImageData {
  const ids = [0, ...mesh.ids];
  const lut = buildCellLut(coloring, ids);
  const img = new ImageData(LUT_W, Math.ceil(ids.length / LUT_W));
  const bg = lut.data.subarray(0, 4);
  for (let i = 1; i < ids.length; i++) {
    const own = lut.data.subarray(i * 4, i * 4 + 4);
    const c = own[3]! > 0 ? own : bg;
    img.data.set([linearToSrgb(c[0]!), linearToSrgb(c[1]!), linearToSrgb(c[2]!), c[3]!], i * 4);
  }
  return img;
}

/** Affine µm -> cube pre-model world, mirroring `toWorldXY` / `scatterZAt` in VolumeCube. */
export function cellMeshMatrix(args: {
  volumeMatrix: Matrix4;
  originUm: [number, number, number];
  ox: number;
  oy: number;
  oz: number;
  lvx: number;
  lvy: number;
  lvz: number;
  ry: number;
  panX0: number;
  panY1: number;
  zSlice: [number, number];
  depth: number;
}): Matrix4 {
  const { originUm: [mx, my, mz], ox, oy, oz, lvx, lvy, lvz, ry, panX0, panY1, zSlice, depth } = args;
  const span = zSlice[1] - zSlice[0] || 1;
  const a = new Matrix4([
    1 / lvx, 0, 0, 0,
    0, -ry / lvy, 0, 0,
    0, 0, depth / (span * lvz), 0,
    (mx - ox) / lvx - panX0, (panY1 - (my - oy) / lvy) * ry, ((mz - oz) / lvz - zSlice[0]) * (depth / span), 1,
  ]);
  return new Matrix4(args.volumeMatrix).multiplyRight(a);
}

export type CellMeshGeometry = {
  attributes: Record<string, { value: ArrayLike<number>; size: number }>;
  indices: { value: Uint32Array; size: 1 };
};

export function cellMeshGeometry(m: CellMeshData): CellMeshGeometry {
  return {
    attributes: {
      positions: { value: m.positions, size: 3 },
      normals: { value: m.normals, size: 3 },
      texCoords: { value: lutTexCoords(m), size: 2 },
    },
    indices: { value: m.indices, size: 1 },
  };
}

export type PlacedCellMesh = {
  mesh: CellMeshGeometry;
  lut: ImageData;
  modelMatrix: Matrix4;
  /** The cut in window-relative µm; the shader keeps what lies inside. */
  clip: ClipBox;
  opacity: number;
  look: MeshLook;
};

/**
 * SimpleMeshLayer's fragment shader with the cut and the view-angle alpha, writing the
 * offscreen target (no blending). Fragments outside the clip box are discarded. The
 * front pass keeps front faces, lit, with alpha from `fresnelMin` head-on to the peak at
 * the silhouette; the back pass keeps back faces (the far wall, and what a cut opens),
 * unlit at a higher floor. Depth goes out packed in RGB, A marking a surface.
 */
const CELL_MESH_FS = `#version 300 es
#define SHADER_NAME cell-mesh-layer-fs
precision highp float;
uniform sampler2D sampler;
in vec2 vTexCoord;
in vec3 cameraPosition;
in vec3 normals_commonspace;
in vec4 position_commonspace;
in vec4 vColor;
in vec3 vMeshUm;
layout(location = 0) out vec4 fragColor;
layout(location = 1) out vec4 fragDepth;
vec3 packDepth(float d) {
  vec3 e = fract(d * vec3(1.0, 255.0, 65025.0));
  return e - e.yzz * vec3(1.0 / 255.0, 1.0 / 255.0, 0.0);
}
void main(void) {
  if (cellMeshClipped(vMeshUm)) discard;
  bool back = gl_FrontFacing == (cellMeshClip.flipFacing > 0.5);
  if (back != (cellMeshClip.backPass > 0.5)) discard;
  geometry.uv = vTexCoord;
  vec3 normal = normals_commonspace;
  vec4 color = simpleMesh.hasTexture ? texture(sampler, vTexCoord) : vColor;
  DECKGL_FILTER_COLOR(color, geometry);
  float ndv = abs(dot(normalize(normal), normalize(cameraPosition - position_commonspace.xyz)));
  float rim = (1.0 - ndv) * (1.0 - ndv);
  fragDepth = vec4(packDepth(gl_FragCoord.z), 1.0);
  if (back) {
    fragColor = vec4(color.rgb, color.a * mix(cellMeshClip.backMin, layer.opacity, rim));
    return;
  }
  vec3 lightColor = lighting_getLightColor(color.rgb, cameraPosition, position_commonspace.xyz, normal);
  fragColor = vec4(lightColor, color.a * mix(cellMeshClip.frontMin, layer.opacity, rim));
}
`;

type GlTexture = { handle: WebGLTexture; destroy(): void };
type GlFramebuffer = { destroy(): void };
type GlRenderPass = { end(): void };
type GlDevice = {
  gl: WebGL2RenderingContext;
  createTexture(props: Record<string, unknown>): GlTexture;
  createFramebuffer(props: Record<string, unknown>): GlFramebuffer;
  beginRenderPass(props: Record<string, unknown>): GlRenderPass;
  withParametersWebGL?(p: Record<number, unknown>, fn: () => void): void;
};

const NEAREST = {
  minFilter: "nearest",
  magFilter: "nearest",
  addressModeU: "clamp-to-edge",
  addressModeV: "clamp-to-edge",
  addressModeW: "clamp-to-edge",
};

/** One surface per pixel: colour (sRGB, straight alpha) and packed depth. */
type Surface = { framebuffer: GlFramebuffer; color: GlTexture; depth: GlTexture };

/**
 * The meshes' offscreen surfaces for one view, read by the image raycast in the same
 * frame. Textures are one deep and 3D: the raycast's samplers must all be sampler3D
 * (see the sampler note in cell-lut-extension.ts).
 */
export class MeshTarget {
  front: Surface | null = null;
  back: Surface | null = null;
  /** Set when the meshes drew this frame; the raycast reads and clears it. */
  drawn = false;
  private device: GlDevice | null = null;
  private size = [0, 0];

  private surface(device: GlDevice, width: number, height: number): Surface {
    const tex = () => device.createTexture({ dimension: "3d", width, height, depth: 1, format: "rgba8unorm", mipmaps: false, sampler: NEAREST });
    const color = tex();
    const depth = tex();
    const framebuffer = device.createFramebuffer({ width, height, colorAttachments: [color, depth], depthStencilAttachment: "depth24plus" });
    return { framebuffer, color, depth };
  }

  /** Surfaces the size of the drawing buffer, made again when it changes. */
  ensure(device: GlDevice): void {
    const { gl } = device;
    const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
    if (this.device === device && this.front && this.size[0] === w && this.size[1] === h) return;
    this.release();
    this.device = device;
    this.size = [w, h];
    this.front = this.surface(device, w, h);
    this.back = this.surface(device, w, h);
  }

  release(): void {
    for (const s of [this.front, this.back]) {
      if (!s) continue;
      s.framebuffer.destroy();
      s.color.destroy();
      s.depth.destroy();
    }
    this.front = this.back = null;
    this.device = null;
    this.drawn = false;
  }
}

/** Each surface steps inward along its normal by this much (µm), so a neighbour's wall no longer pokes through a cut face. */
const SHRINK_UM = 0.2;

class CellMeshLayer extends SimpleMeshLayer {
  static layerName = "CellMeshLayer";

  getShaders() {
    const s = super.getShaders() as { vs: string; modules: unknown[] };
    return {
      ...s,
      fs: CELL_MESH_FS,
      modules: [...s.modules, cellMeshClipModule],
      vs: s.vs
        .replace("in vec3 positions;", "in vec3 positions;\nout vec3 vMeshUm;")
        .replace("void main(void) {", `void main(void) {\nvec3 insetPos = positions - normals * ${SHRINK_UM.toFixed(2)};\nvMeshUm = insetPos;`)
        .replace("(instanceModelMatrix * positions)", "(instanceModelMatrix * insetPos)"),
    };
  }

  draw(opts: Parameters<SimpleMeshLayer["draw"]>[0]) {
    const model = (this.state as { model?: { shaderInputs: { setProps(p: Record<string, unknown>): void } } }).model;
    const { clip, fresnelMin, modelMatrix, opacity, target } = this.props as unknown as {
      clip: ClipBox;
      fresnelMin: number;
      modelMatrix: Matrix4;
      opacity: number;
      target: MeshTarget;
    };
    if (!model || !target) return;
    const device = this.context.device as unknown as GlDevice;
    target.ensure(device);
    const front = fresnelMin > 0 ? Math.min(fresnelMin, opacity) : opacity;
    const uniforms = {
      lo: clip.lo,
      hi: clip.hi,
      // The model matrix flips y (texture rows run down), which turns the winding over.
      flipFacing: modelMatrix.determinant() < 0 ? 1 : 0,
      frontMin: front,
      backMin: (front + opacity) / 2,
    };
    // The view's viewport, so a mesh lands on the pixel the ray of that pixel reads.
    const viewport = Array.from(device.gl.getParameter(device.gl.VIEWPORT) as Int32Array);
    const context = this.context as unknown as { renderPass: unknown };
    const screen = context.renderPass;
    const draw = () => super.draw(opts);
    for (const [surface, backPass] of [[target.front!, 0], [target.back!, 1]] as const) {
      const pass = device.beginRenderPass({ framebuffer: surface.framebuffer, clearColor: [0, 0, 0, 0], clearDepth: 1, parameters: { viewport } });
      context.renderPass = pass;
      try {
        model.shaderInputs.setProps({ cellMeshClip: { ...uniforms, backPass } });
        if (device.withParametersWebGL) device.withParametersWebGL({ [GL_DEPTH_TEST]: true }, draw);
        else draw();
      } finally {
        pass.end();
        context.renderPass = screen;
      }
    }
    target.drawn = true;
  }

  finalizeState(context: Parameters<SimpleMeshLayer["finalizeState"]>[0]) {
    (this.props as unknown as { target?: MeshTarget }).target?.release();
    super.finalizeState(context);
  }
}

// Viv's XR3DLayer draws with WebGL-style `[GL.DEPTH_TEST]: false`, which stays set for
// the layers after it; luma's `depthCompare` does not turn the test back on. The mesh
// passes switch it on around themselves only, so the layers after keep their state.
const GL_DEPTH_TEST = 0x0b71;

/** The meshes' offscreen pass for `target`; draw it before the image raycast that reads it. */
export function cellMeshLayers(placed: PlacedCellMesh | null | undefined, target: MeshTarget, viewId = "3d") {
  if (!placed) return [];
  return [
    new CellMeshLayer({
      id: `cube-cell-mesh${vivTag(viewId)}`,
      data: [0],
      mesh: placed.mesh as never,
      texture: placed.lut as never,
      textureParameters: { minFilter: "nearest", magFilter: "nearest", mipmapFilter: "none" } as never,
      getPosition: () => [0, 0, 0],
      getColor: [255, 255, 255, 255],
      modelMatrix: placed.modelMatrix,
      clip: placed.clip,
      fresnelMin: placed.look.fresnelMin,
      target,
      coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
      opacity: placed.opacity,
      pickable: false,
      material: meshMaterial(placed.look),
      parameters: { depthCompare: "less", depthWriteEnabled: true, cullMode: "none", blend: false },
    } as never),
  ];
}

export const CELL_MESH_LIGHTING = new LightingEffect({
  ambient: new AmbientLight({ color: [255, 255, 255], intensity: 0.45 }),
  key: new DirectionalLight({ color: [255, 255, 255], intensity: 0.9, direction: [1, -1, -1.5] }),
  fill: new DirectionalLight({ color: [255, 255, 255], intensity: 0.25, direction: [-0.5, 1, -0.5] }),
});
