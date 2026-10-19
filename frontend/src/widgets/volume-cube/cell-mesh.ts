/**
 * Cells as lit meshes inside the Inspect cube. A worker lofts each cell's per-slice
 * polygons (cell-loft/) and returns one buffer per window, vertices in window-relative
 * µm. One affine model matrix places them in the cube's pre-model world, the same
 * placement the scatter points use, so panning only changes a matrix. Colour comes
 * from a LUT texture indexed by per-vertex texCoords, one texel per cell, so a recolour
 * swaps a texture and never rebuilds geometry.
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
export const DEFAULT_MESH_LOOK: MeshLook = { fresnelMin: 0.15, shine: 0, flat: 0.6, imgBoost: 0.75 };

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
 * SimpleMeshLayer's fragment shader with the cut and the view-angle alpha. Fragments
 * outside the clip box are discarded. Alpha runs from `fresnelMin` on a face seen head-on
 * to the peak at the silhouette, so the image shows through the middle of a cell. Back
 * faces, which show where a cut opened a cell, draw unlit at a higher floor so the cut
 * cell keeps its colour.
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
out vec4 fragColor;
void main(void) {
  if (cellMeshClipped(vMeshUm)) discard;
  geometry.uv = vTexCoord;
  vec3 normal = normals_commonspace;
  vec4 color = simpleMesh.hasTexture ? texture(sampler, vTexCoord) : vColor;
  DECKGL_FILTER_COLOR(color, geometry);
  float ndv = abs(dot(normalize(normal), normalize(cameraPosition - position_commonspace.xyz)));
  float rim = (1.0 - ndv) * (1.0 - ndv);
  if (gl_FrontFacing == (cellMeshClip.flipFacing > 0.5)) {
    fragColor = vec4(color.rgb, color.a * mix(cellMeshClip.backMin, layer.opacity, rim));
    return;
  }
  vec3 lightColor = lighting_getLightColor(color.rgb, cameraPosition, position_commonspace.xyz, normal);
  fragColor = vec4(lightColor, color.a * mix(cellMeshClip.frontMin, layer.opacity, rim));
}
`;

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
    if (!model) return;
    const { clip, fresnelMin, modelMatrix, opacity } = this.props as unknown as { clip: ClipBox; fresnelMin: number; modelMatrix: Matrix4; opacity: number };
    const front = fresnelMin > 0 ? Math.min(fresnelMin, opacity) : opacity;
    model.shaderInputs.setProps({
      cellMeshClip: {
        lo: clip.lo,
        hi: clip.hi,
        // The model matrix flips y (texture rows run down), which turns the winding over.
        flipFacing: modelMatrix.determinant() < 0 ? 1 : 0,
        frontMin: front,
        backMin: (front + opacity) / 2,
      },
    });
    const device = this.context.device as unknown as { withParametersWebGL?(p: Record<number, unknown>, fn: () => void): void };
    if (device.withParametersWebGL) device.withParametersWebGL({ [GL_DEPTH_TEST]: true }, () => super.draw(opts));
    else super.draw(opts);
  }
}

// Viv's XR3DLayer draws with WebGL-style `[GL.DEPTH_TEST]: false`, which stays set for
// the layers after it; luma's `depthCompare` does not turn the test back on. The mesh
// draw switches it on around itself only, so the layers after it keep their state.
const GL_DEPTH_TEST = 0x0b71;

export function cellMeshLayers(placed: PlacedCellMesh | null | undefined, viewId = "3d") {
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
      coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
      opacity: placed.opacity,
      pickable: false,
      material: meshMaterial(placed.look),
      parameters: { depthCompare: "less-equal", depthWriteEnabled: placed.opacity >= 0.999, cullMode: "none" },
    } as never),
  ];
}

export const CELL_MESH_LIGHTING = new LightingEffect({
  ambient: new AmbientLight({ color: [255, 255, 255], intensity: 0.45 }),
  key: new DirectionalLight({ color: [255, 255, 255], intensity: 0.9, direction: [1, -1, -1.5] }),
  fill: new DirectionalLight({ color: [255, 255, 255], intensity: 0.25, direction: [-0.5, 1, -0.5] }),
});
