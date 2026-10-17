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
  key: string;
};

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
 * SimpleMeshLayer with a depth pre-pass when translucent: the first draw writes
 * only depth, the second blends colour where it matches, so each pixel shows the
 * nearest cell surface once at the label opacity. Without it every back face and
 * every cell behind stacks another 0.4 layer, and the cells turn muddy and dark
 * over the image. Geometry and the colour LUT are shared by both draws.
 */
class CellMeshLayer extends SimpleMeshLayer {
  static layerName = "CellMeshLayer";

  draw(opts: Parameters<SimpleMeshLayer["draw"]>[0]) {
    const model = (this.state as { model?: { parameters: Record<string, unknown>; setParameters(p: Record<string, unknown>): void } }).model;
    if (!model || (this.props as { opacity: number }).opacity >= 0.999) return super.draw(opts);
    const base = model.parameters;
    model.setParameters({ ...base, depthCompare: "less-equal", depthWriteEnabled: true, colorMask: 0 });
    super.draw(opts);
    model.setParameters({ ...base, depthCompare: "less-equal", depthWriteEnabled: false, colorMask: 0xf });
    super.draw(opts);
    model.setParameters(base);
  }
}

export function cellMeshLayers(placed: PlacedCellMesh | null | undefined, viewId = "3d") {
  if (!placed) return [];
  const opaque = placed.opacity >= 0.999;
  return [
    new CellMeshLayer({
      id: `cube-cell-mesh-${placed.key}${vivTag(viewId)}`,
      data: [0],
      mesh: placed.mesh as never,
      texture: placed.lut as never,
      textureParameters: { minFilter: "nearest", magFilter: "nearest", mipmapFilter: "none" } as never,
      getPosition: () => [0, 0, 0],
      getColor: [255, 255, 255, 255],
      modelMatrix: placed.modelMatrix,
      coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
      opacity: placed.opacity,
      pickable: false,
      // Matte: soft diffuse, no specular shine (Designer's look notes).
      material: { ambient: 0.55, diffuse: 0.65, shininess: 1, specularColor: [0, 0, 0] },
      parameters: opaque
        ? { depthCompare: "less-equal", depthWriteEnabled: true, cullMode: "none" }
        : { depthCompare: "less-equal", depthWriteEnabled: false, cullMode: "none" },
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
