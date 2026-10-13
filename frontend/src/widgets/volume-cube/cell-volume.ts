import type { WindowPixelSource, ZarrSource } from "./window-source";

/**
 * The labels of one shown window as a compact GPU texture.
 *
 * Global label ids are mapped to local indices 1..N per window (0 is
 * background) and stored as two bytes per voxel, RG8: `idx = r + 256 * (g & 127)`,
 * with `g & 128` set on an outline voxel when its (x,y) column lies on the
 * 2D footprint boundary of that label (union over z), not on per-z terraces.
 * The cube shader decodes that and
 * colours each cell from a per-window lookup (`buildCellLut`) keyed by the
 * local index, so the image goes to Viv alone at its own dtype.
 */

/** Local indices a window may hold: 15 bits (the high bit of G is the surface flag). */
export const MAX_WINDOW_CELLS = 32767;
export const TOO_MANY_CELLS = "Too many cells in this window for labels";

type Ids = ArrayLike<number> | ArrayLike<bigint>;

/**
 * Where Viv's VolumeLayer puts raster rows (`getVolume` in @vivjs/layers): it
 * fills texel `plane - 1 - r` from raster voxel `(W - r - 1) % W + W * floor(r / W)`
 * (JS `%`, whose sign follows the dividend). That keeps each column but reverses
 * the rows, and for every column but the first it is one row off: texel row `t`
 * of column 0 holds raster row `H - 1 - t`; of the other columns, raster row
 * `H - 2 - t` (and the last texel row repeats raster row 0).
 */
function vivRow(t: number, x: number, height: number): number {
  if (x === 0) return height - 1 - t;
  return t === height - 1 ? 0 : height - 2 - t;
}

/**
 * RG8 texels of a labels window of `width` x `height` planes, laid out as Viv
 * lays out the image (`vivRow`), so both textures share one grid voxel for
 * voxel. Surfaces are found in the raster, as before.
 *
 * `cells[i]` is the global id of local index i (`cells[0]` is 0). Throws
 * `TOO_MANY_CELLS` past `MAX_WINDOW_CELLS`.
 */
/** Footprint boundary columns for one local cell index (1..N). */
function footprintOutlineColumns(voxIdx: Uint16Array, idx: number, width: number, height: number, plane: number): Uint8Array {
  const foot = new Uint8Array(plane);
  for (let s = 0; s < voxIdx.length; s++) {
    if (voxIdx[s] === idx) foot[s % plane] = 1;
  }
  const edge = new Uint8Array(plane);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const col = y * width + x;
      if (!foot[col]) continue;
      if (
        (x > 0 && !foot[col - 1]) ||
        (x < width - 1 && !foot[col + 1]) ||
        (y > 0 && !foot[col - width]) ||
        (y < height - 1 && !foot[col + width])
      ) {
        edge[col] = 1;
      }
    }
  }
  return edge;
}

export function encodeLabels(ids: Ids, width: number, height: number): { data: Uint8Array; cells: number[] } {
  const src = ids as ArrayLike<number>;
  const plane = width * height;
  const depth = Math.floor(src.length / plane);
  const voxIdx = new Uint16Array(plane * depth);
  const local = new Map<number, number>();
  const cells = [0];
  let lastId = 0;
  let lastIdx = 0;
  for (let z = 0; z < depth; z++) {
    const base = z * plane;
    for (let t = 0; t < height; t++) {
      const first = vivRow(t, 0, height);
      const rest = vivRow(t, 1, height);
      for (let x = 0; x < width; x++) {
        const y = x === 0 ? first : rest;
        const s = base + y * width + x;
        const id = src[s]!;
        if (!id) continue;
        let idx = lastIdx;
        if (id !== lastId) {
          const known = local.get(id);
          if (known === undefined) {
            idx = cells.length;
            if (idx > MAX_WINDOW_CELLS) throw new Error(TOO_MANY_CELLS);
            local.set(id, idx);
            cells.push(Number(id));
          } else idx = known;
          lastId = id;
          lastIdx = idx;
        }
        voxIdx[s] = idx;
      }
    }
  }
  const outlineByIdx: Uint8Array[] = [];
  for (let idx = 1; idx < cells.length; idx++) {
    outlineByIdx[idx] = footprintOutlineColumns(voxIdx, idx, width, height, plane);
  }
  const data = new Uint8Array(plane * depth * 2);
  for (let z = 0; z < depth; z++) {
    const base = z * plane;
    for (let t = 0; t < height; t++) {
      const out = 2 * (base + t * width);
      const first = vivRow(t, 0, height);
      const rest = vivRow(t, 1, height);
      for (let x = 0; x < width; x++) {
        const y = x === 0 ? first : rest;
        const s = base + y * width + x;
        const idx = voxIdx[s];
        if (!idx) continue;
        const col = y * width + x;
        const surface = outlineByIdx[idx]![col] !== 0;
        data[out + 2 * x] = idx & 255;
        data[out + 2 * x + 1] = (idx >> 8) | (surface ? 128 : 0);
      }
    }
  }
  return { data, cells };
}

export type Texture = { destroy(): void; copyImageData(options: { data: ArrayBufferView }): void };
export type Device = {
  createTexture(props: Record<string, unknown>): Texture;
  /** Sets WebGL parameters around `fn` and restores the previous values. */
  withParametersWebGL?(parameters: Record<number, unknown>, fn: () => void): void;
};

const GL_UNPACK_ALIGNMENT = 3317;

/**
 * One window's RG8 label texture and its local -> global id list.
 *
 * The texels stay on the CPU only until the first draw uploads them. Its owner
 * (`useShownWindow`) retires it when the window stops being shown; the GPU
 * texture is destroyed once it is retired and no layer still draws it (Viv
 * keeps drawing the old image until the new one is on the GPU, and the labels
 * must stay with it).
 */
export class CellVolume {
  /** Local index -> global label id; `cells[0]` is background. */
  readonly cells: readonly number[];
  /** CPU RG8 layout (same bytes as the GPU label volume). */
  readonly labelRg8: Uint8Array;
  readonly labelWidth: number;
  readonly labelHeight: number;
  readonly labelDepth: number;
  private texels: Uint8Array | null;
  private tex: Texture | null = null;
  private users = 0;
  private retired = false;
  private dead = false;

  constructor(
    /** The image window these labels sit on. */
    readonly image: WindowPixelSource,
    /** The labels level they were cut from. */
    readonly labels: ZarrSource,
    encoded: { data: Uint8Array; cells: number[] },
  ) {
    this.cells = encoded.cells;
    this.labelRg8 = encoded.data;
    this.labelWidth = image.width;
    this.labelHeight = image.height;
    this.labelDepth = encoded.data.length / 2 / (image.width * image.height);
    this.texels = encoded.data;
  }

  /** Cells in the window. */
  get count(): number {
    return this.cells.length - 1;
  }

  get destroyed(): boolean {
    return this.dead;
  }

  /** The RG8 3D texture, uploaded on first use; the CPU texels are dropped once it is on the GPU. */
  texture(device: Device): Texture | null {
    if (this.dead) return null;
    if (!this.tex && this.texels) {
      const { width, height } = this.image;
      const depth = this.texels.length / 2 / (width * height);
      const tex = device.createTexture({
        dimension: "3d",
        width,
        height,
        depth,
        format: "rg8unorm",
        mipmaps: false,
        sampler: {
          minFilter: "nearest",
          magFilter: "nearest",
          addressModeU: "clamp-to-edge",
          addressModeV: "clamp-to-edge",
          addressModeW: "clamp-to-edge",
        },
      });
      // Rows of an odd-width window (A2: 667 texels, 1334 bytes) are not 4-byte
      // aligned; the alignment is set for this upload only. Written after
      // creation (not as `data`), so luma.gl keeps no reference to the texels.
      const texels = this.texels;
      const upload = () => tex.copyImageData({ data: texels });
      if (device.withParametersWebGL) device.withParametersWebGL({ [GL_UNPACK_ALIGNMENT]: 1 }, upload);
      else upload();
      this.tex = tex;
      this.texels = null;
    }
    return this.tex;
  }

  /** A layer draws it. */
  use(): void {
    this.users++;
  }

  /** A layer stopped drawing it. */
  unuse(): void {
    this.users = Math.max(0, this.users - 1);
    if (this.retired && !this.users) this.destroy();
  }

  /** No longer the shown window's. */
  retire(): void {
    this.retired = true;
    if (!this.users) this.destroy();
  }

  private destroy(): void {
    this.dead = true;
    this.tex?.destroy();
    this.tex = null;
    this.texels = null;
  }
}

/** Viv's image volume data (the array it uploads) -> the window it was read from. */
const vivVolumes = new WeakMap<object, WindowPixelSource>();

/**
 * Record which window a volume Viv has just read belongs to (its layer's
 * `onViewportLoad`), so the cube shader binds the labels of the image it is
 * actually drawing, not of a newer window Viv is still copying.
 */
export function markVivVolume(data: unknown, image: WindowPixelSource): void {
  if (data && typeof data === "object") vivVolumes.set(data, image);
}

export function vivVolumeImage(data: unknown): WindowPixelSource | null {
  return data && typeof data === "object" ? (vivVolumes.get(data) ?? null) : null;
}
