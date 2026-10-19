/**
 * Prototype (branch proto-cell-mesh): cell labels as lit meshes.
 *
 * Python lofts each cell's stacked polygons (milume/cell_mesh.py) and serves one
 * binary buffer per Inspect window, over the volume comm (`cellmesh/x0,y0,x1,y1.bin`)
 * or HTTP in the dev harness. Vertices stay in window-relative µm; one affine
 * model matrix places them in the cube's pre-model world, the same placement
 * the scatter points use, so panning only changes a matrix.
 *
 * Colour comes from a small LUT texture indexed by per-vertex texCoords (one
 * texel per cell), so recolouring swaps a texture and never rebuilds geometry.
 */
import { AmbientLight, COORDINATE_SYSTEM, DirectionalLight, LightingEffect } from "@deck.gl/core";
import { SimpleMeshLayer } from "@deck.gl/mesh-layers";
import { Matrix4 } from "@math.gl/core";

import { bytesFromCommBuffer } from "./comm-buffer";
import { type CellColoring, buildCellLut } from "./cell-lut-extension";
import { type ClipBox, cellMeshClipModule } from "./cell-mesh-clip";
import { vivTag } from "./overlay-layers";
import type { VolumeCommClient } from "./volume-comm";

export type CellMeshData = {
  originUm: [number, number, number];
  positions: Float32Array;
  normals: Float32Array;
  cells: Uint16Array;
  indices: Uint32Array;
  labels: Int32Array;
  bytes: number;
};

const MAGIC = "MLMESH01";

export function decodeCellMesh(buf: Uint8Array): CellMeshData {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const magic = new TextDecoder().decode(buf.subarray(0, 8));
  if (magic !== MAGIC) throw new Error("not a cell mesh buffer");
  const hl = dv.getUint32(8, true);
  const header = JSON.parse(new TextDecoder().decode(buf.subarray(12, 12 + hl)));
  const base = buf.byteOffset + 12 + hl;
  const o = header.offsets;
  const nv = header.vertices as number;
  // Copy into an aligned buffer once (comm buffers may sit at any offset).
  const body = buf.slice(12 + hl);
  const b0 = body.buffer;
  void base;
  const n8 = new Int8Array(b0, o.normals, nv * 3);
  const normals = new Float32Array(nv * 3);
  for (let i = 0; i < n8.length; i++) normals[i] = n8[i]! / 127;
  return {
    originUm: header.origin_um,
    positions: new Float32Array(b0, o.positions, nv * 3),
    normals,
    cells: new Uint16Array(b0, o.cells, nv),
    indices: new Uint32Array(b0, o.indices, header.indices),
    labels: new Int32Array(b0, o.labels, header.cells),
    bytes: buf.byteLength,
  };
}

export function cellMeshKey(x0: number, y0: number, x1: number, y1: number): string {
  return [x0, y0, x1, y1].map((v) => v.toFixed(2)).join(",");
}

export async function fetchCellMesh(
  meshUrl: string,
  key: string,
  volumeComm: VolumeCommClient | null | undefined,
): Promise<CellMeshData | null> {
  const path = `${meshUrl}${key}.bin`;
  let bytes: Uint8Array | undefined;
  if (meshUrl.startsWith("/") || meshUrl.startsWith("http")) {
    const r = await fetch(path);
    if (!r.ok) return null;
    bytes = new Uint8Array(await r.arrayBuffer());
  } else {
    if (!volumeComm) return null;
    const got = await volumeComm.get(path);
    bytes = got ? bytesFromCommBuffer(got) ?? undefined : undefined;
  }
  return bytes?.byteLength ? decodeCellMesh(bytes) : null;
}

const LUT_W = 256;

/** texCoords per vertex: the centre of its cell's LUT texel (texel k+1 for local cell k). */
export function lutTexCoords(mesh: CellMeshData): Float32Array {
  const n = mesh.labels.length + 1;
  const h = Math.ceil(n / LUT_W);
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

/** The cube's label colours (same LUT as the raycast) as an sRGB RGBA image, one texel per cell. */
export function cellMeshLut(mesh: CellMeshData, coloring: CellColoring): ImageData {
  const ids = [0, ...mesh.labels];
  const lut = buildCellLut(coloring, ids);
  const h = Math.ceil(ids.length / LUT_W);
  const img = new ImageData(LUT_W, h);
  const bg = lut.data.subarray(0, 4);
  for (let i = 1; i < ids.length; i++) {
    const s = lut.data.subarray(i * 4, i * 4 + 4);
    const src = s[3]! > 0 ? s : bg;
    // Cells the colouring leaves out (alpha 0 with a clear background) stay hidden.
    const a = s[3]! > 0 ? 255 : bg[3]! > 0 ? Math.round(255 * Math.min(1, bg[3]! / 255 / 0.4)) : 0;
    img.data.set([linearToSrgb(src[0]!), linearToSrgb(src[1]!), linearToSrgb(src[2]!), a], i * 4);
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
  const ax = 1 / lvx;
  const bx = (mx - ox) / lvx - panX0;
  const ay = -ry / lvy;
  const by = (panY1 - (my - oy) / lvy) * ry;
  const az = depth / (span * lvz);
  const bz = ((mz - oz) / lvz - zSlice[0]) * (depth / span);
  // Column-major 4x4.
  const a = new Matrix4([ax, 0, 0, 0, 0, ay, 0, 0, 0, 0, az, 0, bx, by, bz, 1]);
  return new Matrix4(args.volumeMatrix).multiplyRight(a);
}

export type PlacedCellMesh = {
  mesh: { attributes: Record<string, { value: ArrayLike<number>; size: number }>; indices: { value: Uint32Array; size: 1 } };
  lut: ImageData;
  modelMatrix: Matrix4;
  opacity: number;
  /** Window-relative µm box the shader keeps (cell-mesh-clip.ts); null: no clip. */
  clip: ClipBox | null;
  /** Alpha of the cut face tint (the label opacity, also when the meshes are opaque). */
  capAlpha: number;
  /** Surface inset (µm); default CELL_MESH_SHRINK_UM. */
  shrinkUm?: number;
  /** View-angle alpha and shading (MeshLook, resolved). */
  look?: MeshLook;
  /** Depth-only pass first (nearest surface wins). Off by default: the 0.2 µm inset already removes the speckles, and the pass doubles the mesh on the GPU. */
  depthPrepass?: boolean;
  key: string;
};

/**
 * How the meshes draw over the image (proto-cell-mesh-ts, Oct 18 PM). All of it is uniforms or
 * layer props: changing any field redraws, never rebuilds geometry.
 * - opacity: peak alpha (the silhouette).
 * - fresnelMin: alpha of a face seen head-on (clamped to <= opacity); 0 = fresnel off.
 *   alpha = mix(fresnelMin, opacity, (1 - |n.v|)^2).
 * - shine: specular strength 0..1 (0 = none, matte).
 * - flat: shading flatness 0..1 (0 = the earlier ambient 0.55 / diffuse 0.65; 1 = nearly unlit).
 * - imgBoost: mesh-mode image contrast boost 0..1 (0 = off), applied on top of the active contrast.
 */
export type MeshLook = { opacity: number; fresnelMin: number; shine: number; flat: number; imgBoost: number };
export const DEFAULT_MESH_LOOK: MeshLook = { opacity: 0.6, fresnelMin: 0.15, shine: 0, flat: 0.6, imgBoost: 0.75 };

/** Material for a look: flatter = more ambient, less diffuse; shine adds a soft specular. */
export function meshMaterial(look: Pick<MeshLook, "shine" | "flat">) {
  const f = Math.min(1, Math.max(0, look.flat)), s = Math.min(1, Math.max(0, look.shine));
  const spec = Math.round(255 * 0.5 * s);
  return { ambient: 0.55 + 0.45 * f, diffuse: 0.65 * (1 - 0.7 * f), shininess: s > 0 ? 4 + 28 * s : 1, specularColor: [spec, spec, spec] };
}

/**
 * Mesh-mode image modifier over the active contrast window and gamma: the window narrows
 * (lo up 20%, hi down 30% of its width at boost 1) and gamma rises (x1.6), so nuclei brighten and
 * the dim background darkens and thins under the meshes. 0 returns the inputs unchanged.
 */
export function boostedImage(contrast: [number, number], gamma: number, boost: number): { contrast: [number, number]; gamma: number } {
  const b = Math.min(1, Math.max(0, boost));
  if (!b) return { contrast, gamma };
  const w = contrast[1] - contrast[0];
  return { contrast: [contrast[0] + 0.2 * b * w, contrast[1] - 0.3 * b * w], gamma: gamma * (1 + 0.6 * b) };
}

export function placedCellMeshGeometry(m: CellMeshData): PlacedCellMesh["mesh"] {
  return {
    attributes: {
      positions: { value: m.positions, size: 3 },
      normals: { value: m.normals, size: 3 },
      texCoords: { value: lutTexCoords(m), size: 2 },
    },
    indices: { value: m.indices, size: 1 },
  };
}

/**
 * SimpleMeshLayer's fragment shader plus the cut: fragments outside the clip box
 * are discarded, and a back face (only visible where the cut opened a cell)
 * draws unlit in the cell colour at the label opacity, so the cut face reads as
 * the image slice (drawn first by the raycast, clipped to the same cut) under a
 * 0.4 tint, as the raycast shows it, rather than a hollow shell.
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
  vec3 normal;
  if (simpleMesh.flatShading) {
    normal = normalize(cross(dFdx(position_commonspace.xyz), dFdy(position_commonspace.xyz)));
  } else {
    normal = normals_commonspace;
  }
  vec4 color = simpleMesh.hasTexture ? texture(sampler, vTexCoord) : vColor;
  DECKGL_FILTER_COLOR(color, geometry);
  bool back = gl_FrontFacing == (cellMeshClip.flipFacing > 0.5);
  // Behind a slice plane only cross-sections show: the depth pre-pass keeps
  // every surface, so a back face wins only where it is the nearest one (the
  // cell holds the plane point), and front faces draw nothing (the slice covers them).
  if (cellMeshClip.colourPass > 0.5 && !back && cellMeshBehindSlice(vMeshUm)) discard;
  // View-angle (fresnel) alpha: head-on faces thin out to fresnelMin, silhouettes keep the peak.
  float ndv = abs(dot(normalize(normal), normalize(cameraPosition - position_commonspace.xyz)));
  float rim = pow(1.0 - ndv, cellMeshClip.fresnelPow);
  if (back) {
    // Back faces stay (a cut cell keeps its colour inside), with their own, higher floor.
    fragColor = vec4(color.rgb, color.a * mix(cellMeshClip.backFresnelMin, cellMeshClip.capAlpha, rim));
    return;
  }
  vec3 lightColor = lighting_getLightColor(color.rgb, cameraPosition, position_commonspace.xyz, normal);
  fragColor = vec4(lightColor, color.a * mix(cellMeshClip.fresnelMin, layer.opacity, rim));
}
`;

/**
 * Head-on alpha floors. 0 = fresnel off (floor = peak). Back faces get a floor halfway between the
 * front floor and the cap alpha, so the inside of a cut cell keeps most of its colour.
 */
export function fresnelFloors(min: number, peak: number, capAlpha: number): { front: number; back: number } {
  if (!(min > 0)) return { front: peak, back: capAlpha };
  const front = Math.min(min, peak);
  return { front, back: Math.min(capAlpha, (front + capAlpha) / 2) };
}

type ClipProps = { clip: ClipBox | null; capAlpha: number; flipFacing: boolean; shrinkUm: number };

/** Inset of every cell surface along its normal (µm, under half a 0.46 µm voxel). */
export const CELL_MESH_SHRINK_UM = 0.2;

class CellMeshLayer extends SimpleMeshLayer {
  static layerName = "CellMeshLayer";

  getShaders() {
    const s = super.getShaders() as { modules: unknown[]; inject?: Record<string, string> };
    return {
      ...s,
      fs: CELL_MESH_FS,
      modules: [...s.modules, cellMeshClipModule],
      // Each surface steps inward along its normal by `shrink` µm, so a neighbour's
      // wall no longer pokes through a cut face (the loft's cells overlap by a hair).
      vs: (s as unknown as { vs: string }).vs
        .replace("in vec3 positions;", "in vec3 positions;\nout vec3 vMeshUm;")
        .replace("void main(void) {", "void main(void) {\nvec3 insetPos = positions - normals * cellMeshClip.shrink;\nvMeshUm = insetPos;")
        .replace("(instanceModelMatrix * positions)", "(instanceModelMatrix * insetPos)"),
    };
  }

  draw(opts: Parameters<SimpleMeshLayer["draw"]>[0]) {
    const model = (this.state as { model?: { parameters: Record<string, unknown>; setParameters(p: Record<string, unknown>): void; shaderInputs: { setProps(p: Record<string, unknown>): void } } }).model;
    if (!model) return;
    const { clip, capAlpha, flipFacing, shrinkUm, modelMatrix } = this.props as unknown as ClipProps & { modelMatrix: Matrix4 };
    // The eye in the mesh's µm, as Viv finds its own (viewMatrixInverse's translation, then the inverse model).
    const vmi = (this.context.viewport as unknown as { viewMatrixInverse: number[] }).viewMatrixInverse;
    const eye = new Matrix4(modelMatrix).invert().transformAsPoint([vmi[12]!, vmi[13]!, vmi[14]!]);
    const { colourPass, depthPrepass, fresnelMin } = this.props as unknown as { colourPass: boolean; depthPrepass?: boolean; fresnelMin?: number };
    const peak = (this.props as { opacity: number }).opacity;
    const fres = fresnelFloors(fresnelMin ?? 0, peak, capAlpha);
    model.shaderInputs.setProps({
      cellMeshClip: {
        lo: clip?.lo ?? [-1e9, -1e9, -1e9],
        hi: clip?.hi ?? [1e9, 1e9, 1e9],
        activeLo: (clip?.activeLo ?? [false, false, false]).map(Number),
        activeHi: (clip?.activeHi ?? [false, false, false]).map(Number),
        eye,
        capAlpha,
        flipFacing: flipFacing ? 1 : 0,
        shrink: shrinkUm,
        // The slice-era "front face behind the cut plane" discard only belongs with the depth pre-pass look.
        colourPass: colourPass && depthPrepass ? 1 : 0,
        fresnelMin: fres.front,
        fresnelPow: 2,
        backFresnelMin: fres.back,
      },
    });
    const write = !colourPass || (this.props as { opacity: number }).opacity >= 0.999;
    const device = this.context.device as unknown as { withParametersWebGL?(p: Record<number, unknown>, fn: () => void): void };
    const gl = {
      [GL_DEPTH_TEST]: true,
      [GL_DEPTH_FUNC]: GL_LEQUAL,
      [GL_DEPTH_WRITEMASK]: write,
      [GL_COLOR_WRITEMASK]: colourPass ? [true, true, true, true] : [false, false, false, false],
    };
    if (device.withParametersWebGL) device.withParametersWebGL(gl, () => super.draw(opts));
    else super.draw(opts);
  }
}

// Viv's XR3DLayer draws with WebGL-style `[GL.DEPTH_TEST]: false`, which stays
// set for the layers after it; luma's `depthCompare` does not turn the test back
// on. The mesh draws switch it on around themselves only, so the frame and
// overlay layers after them keep the state they were written against.
const GL_DEPTH_TEST = 0x0b71;
const GL_DEPTH_FUNC = 0x0b74;
const GL_DEPTH_WRITEMASK = 0x0b72;
const GL_COLOR_WRITEMASK = 0x0c23;
const GL_LEQUAL = 0x0203;

export function cellMeshLayers(placed: PlacedCellMesh | null | undefined, viewId = "3d") {
  if (!placed) return [];
  const opaque = placed.opacity >= 0.999;
  const common = {
    data: [0],
    mesh: placed.mesh as never,
    texture: placed.lut as never,
    textureParameters: { minFilter: "nearest", magFilter: "nearest", mipmapFilter: "none" } as never,
    getPosition: () => [0, 0, 0],
    getColor: [255, 255, 255, 255],
    modelMatrix: placed.modelMatrix,
    clip: placed.clip,
    capAlpha: placed.capAlpha,
    shrinkUm: placed.shrinkUm ?? CELL_MESH_SHRINK_UM,
    depthPrepass: Boolean(placed.depthPrepass),
    // The model matrix flips y (texture rows run down), which turns the winding over.
    flipFacing: placed.modelMatrix.determinant() < 0,
    coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
    opacity: placed.opacity,
    pickable: false,
    // Matte and flat by default (Clarence, Oct 18 PM): see MeshLook.
    material: meshMaterial(placed.look ?? DEFAULT_MESH_LOOK),
    fresnelMin: (placed.look ?? DEFAULT_MESH_LOOK).fresnelMin,
  };
  // Depth first (every surface inside the clip), then colour where it matches,
  // so each pixel shows the nearest surface once. Two layers on one mesh object:
  // luma keeps one uniform block per model, so a pass flag cannot change
  // between two draws of the same model.
  const colour = new CellMeshLayer({
    ...common,
    id: `cube-cell-mesh-${placed.key}${vivTag(viewId)}`,
    colourPass: true,
    parameters: { depthCompare: "less-equal", depthWriteEnabled: opaque, cullMode: "none" },
  } as never);
  if (!placed.depthPrepass) return [colour];
  return [
    new CellMeshLayer({
      ...common,
      id: `cube-cell-mesh-depth-${placed.key}${vivTag(viewId)}`,
      colourPass: false,
      parameters: { depthCompare: "less-equal", depthWriteEnabled: true, cullMode: "none" },
    } as never),
    new CellMeshLayer({
      ...common,
      id: `cube-cell-mesh-${placed.key}${vivTag(viewId)}`,
      colourPass: true,
      parameters: { depthCompare: "less-equal", depthWriteEnabled: opaque, cullMode: "none" },
    } as never),
  ];
}

/** Soft key light from the upper left plus ambient ~0.4. */
export const CELL_MESH_LIGHTING = new LightingEffect({
  ambient: new AmbientLight({ color: [255, 255, 255], intensity: 0.45 }),
  key: new DirectionalLight({ color: [255, 255, 255], intensity: 0.9, direction: [1, -1, -1.5] }),
  fill: new DirectionalLight({ color: [255, 255, 255], intensity: 0.25, direction: [-0.5, 1, -0.5] }),
});

/** Distinct visible colours in a mesh LUT (texel 0 is the background and is skipped). */
export function distinctLutColours(lut: ImageData): number {
  const seen = new Set<number>();
  for (let i = 4; i < lut.data.length; i += 4) {
    if (lut.data[i + 3]! > 0) seen.add((lut.data[i]! << 16) | (lut.data[i + 1]! << 8) | lut.data[i + 2]!);
  }
  return seen.size;
}
