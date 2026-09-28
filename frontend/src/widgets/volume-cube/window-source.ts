import * as zarr from "zarrita";

/**
 * Windowed volume loading for Viv.
 *
 * Viv's VolumeLayer is not tiled: it reads every Z plane of its source at full
 * width and height into one 3D texture. Handing it a whole Region mosaic
 * would fetch gigabytes and exceed the GPU's 3D texture limit, so the cube
 * hands it a source that *is* the inspect window instead: a box cut from one
 * pyramid level, fetched with a single `zarr.get` so each Zarr chunk (or shard
 * chunk) is read once, then served to Viv plane by plane.
 */

/** The subset of Viv's ZarrPixelSource this module relies on. */
export type ZarrSource = {
  shape: number[];
  labels: string[];
  dtype: string;
  tileSize: number;
  _data: zarr.Array<zarr.DataType, zarr.Readable>;
};

/** Level-0 physical frame, (z, y, x): `coord = origin + voxel * size`. */
export type Frame = {
  voxelSize: [number, number, number];
  origin: [number, number, number];
};

/** Half-open voxel box in one level's index space. */
export type Box = { z0: number; z1: number; y0: number; y1: number; x0: number; x1: number };

export type Level = {
  index: number;
  source: ZarrSource;
  /** Per-axis downsample from level 0, (z, y, x). */
  factor: [number, number, number];
};

/** Voxels one window may load. 64 M uint8 voxels is 64 MB of texture. */
export const WINDOW_VOXEL_BUDGET = 64 * 1024 * 1024;
/** WebGL2 guarantees 256 per 3D texture axis; desktop GPUs report 2048. */
export const MAX_TEXTURE_AXIS = 2048;

export function axisSize(source: { shape: number[]; labels: string[] }, axis: string): number {
  const i = source.labels.indexOf(axis);
  return i >= 0 ? source.shape[i]! : 1;
}

export function pyramidLevels(pyramid: ZarrSource[]): Level[] {
  const base = pyramid[0]!;
  return pyramid.map((source, index) => ({
    index,
    source,
    factor: (["z", "y", "x"] as const).map(
      (axis) => axisSize(base, axis) / axisSize(source, axis),
    ) as [number, number, number],
  }));
}

/** Level-0 voxels spanned by a square window of `sizeUm` over the full depth. */
function windowVoxels0(base: ZarrSource, frame: Frame, sizeUm: number): [number, number, number] {
  return [
    axisSize(base, "z"),
    Math.min(axisSize(base, "y"), Math.ceil(sizeUm / frame.voxelSize[1])),
    Math.min(axisSize(base, "x"), Math.ceil(sizeUm / frame.voxelSize[2])),
  ];
}

/** Finest level whose window fits the voxel budget and the texture axis limit. */
export function pickLevel(levels: Level[], frame: Frame, sizeUm: number): Level {
  const [d0, h0, w0] = windowVoxels0(levels[0]!.source, frame, sizeUm);
  for (const level of levels) {
    const [fz, fy, fx] = level.factor;
    const d = Math.ceil(d0 / fz);
    const h = Math.ceil(h0 / fy);
    const w = Math.ceil(w0 / fx);
    if (d * h * w <= WINDOW_VOXEL_BUDGET && Math.max(d, h, w) <= MAX_TEXTURE_AXIS) {
      return level;
    }
  }
  return levels[levels.length - 1]!;
}

/** Window box in `level` voxels, clamped to the level; full depth in Z. */
export function windowBox(
  level: Level,
  frame: Frame,
  cx: number,
  cy: number,
  sizeUm: number,
): Box {
  const [, fy, fx] = level.factor;
  const [, sy, sx] = frame.voxelSize;
  const [, oy, ox] = frame.origin;
  const height = axisSize(level.source, "y");
  const width = axisSize(level.source, "x");
  const half = sizeUm / 2;
  const clamp = (v: number, limit: number) => Math.max(0, Math.min(limit, v));
  return {
    z0: 0,
    z1: axisSize(level.source, "z"),
    y0: clamp(Math.floor((cy - half - oy) / (sy * fy)), height),
    y1: clamp(Math.ceil((cy + half - oy) / (sy * fy)), height),
    x0: clamp(Math.floor((cx - half - ox) / (sx * fx)), width),
    x1: clamp(Math.ceil((cx + half - ox) / (sx * fx)), width),
  };
}

export function boxIsEmpty(box: Box): boolean {
  return box.x1 <= box.x0 || box.y1 <= box.y0 || box.z1 <= box.z0;
}

type Raster = { data: ArrayLike<number> & { subarray(a: number, b: number): unknown }; width: number; height: number };

/**
 * A Viv pixel source over one window of one pyramid level.
 *
 * Shape and labels match the level except that Y, X and Z are the box extent,
 * so Viv's VolumeLayer loads exactly the window. `meta.physicalSizes` keeps the
 * voxel aspect (e.g. 0.45 um XY against 0.5 um Z) in the rendered cube.
 */
export class WindowPixelSource {
  readonly labels: string[];
  readonly tileSize: number;
  readonly meta: { physicalSizes: Record<"x" | "y" | "z", { size: number; unit: string }> };
  private readonly blocks = new Map<string, Promise<zarr.Chunk<zarr.DataType>>>();

  constructor(
    private readonly base: ZarrSource,
    readonly box: Box,
    voxelSize: [number, number, number],
  ) {
    this.labels = base.labels;
    this.tileSize = base.tileSize;
    const [sz, sy, sx] = voxelSize;
    this.meta = {
      physicalSizes: {
        x: { size: sx, unit: "µm" },
        y: { size: sy, unit: "µm" },
        z: { size: sz, unit: "µm" },
      },
    };
  }

  get shape(): number[] {
    const extent: Record<string, number> = {
      z: this.box.z1 - this.box.z0,
      y: this.box.y1 - this.box.y0,
      x: this.box.x1 - this.box.x0,
    };
    return this.base.shape.map((n, i) => extent[this.labels[i]!] ?? n);
  }

  get dtype(): string {
    return this.base.dtype;
  }

  get width(): number {
    return this.box.x1 - this.box.x0;
  }

  get height(): number {
    return this.box.y1 - this.box.y0;
  }

  /** The whole window for one (t, c), fetched once and shared by every plane. */
  fetchBlock(selection: Record<string, number>): Promise<zarr.Chunk<zarr.DataType>> {
    const key = this.labels
      .filter((l) => l !== "z" && l !== "y" && l !== "x")
      .map((l) => selection[l] ?? 0)
      .join("/");
    let pending = this.blocks.get(key);
    if (!pending) {
      const { z0, z1, y0, y1, x0, x1 } = this.box;
      const index = this.labels.map((label) => {
        if (label === "z") return zarr.slice(z0, z1);
        if (label === "y") return zarr.slice(y0, y1);
        if (label === "x") return zarr.slice(x0, x1);
        return selection[label] ?? 0;
      });
      pending = zarr.get(this.base._data, index) as Promise<zarr.Chunk<zarr.DataType>>;
      // A failed fetch must not poison later retries of the same window.
      pending.catch(() => this.blocks.delete(key));
      this.blocks.set(key, pending);
    }
    return pending;
  }

  async getRaster({ selection }: { selection: Record<string, number>; signal?: AbortSignal }): Promise<Raster> {
    const block = await this.fetchBlock(selection);
    const plane = this.width * this.height;
    const z = selection.z ?? 0;
    const data = block.data as unknown as Raster["data"];
    return {
      data: data.subarray(z * plane, (z + 1) * plane) as Raster["data"],
      width: this.width,
      height: this.height,
    };
  }

  async getTile(): Promise<never> {
    throw new Error("WindowPixelSource serves whole planes only (VolumeViewer)");
  }

  onTileError(err: Error): void {
    throw err;
  }
}

type Volume = Float32Array;

/**
 * Signed label ids of a labels window: `id` inside a cell, `-id` on its surface
 * (a voxel with a differently labelled 6-neighbour, another cell or background).
 */
export function signedLabelVolume(ids: ArrayLike<number>, width: number, height: number): Float32Array {
  const plane = width * height;
  const depth = Math.floor(ids.length / plane);
  const out = new Float32Array(ids.length);
  for (let z = 0; z < depth; z++) {
    for (let y = 0; y < height; y++) {
      const row = z * plane + y * width;
      for (let x = 0; x < width; x++) {
        const i = row + x;
        const id = ids[i]!;
        if (!id) continue;
        const surface =
          (x > 0 && ids[i - 1] !== id) ||
          (x < width - 1 && ids[i + 1] !== id) ||
          (y > 0 && ids[i - width] !== id) ||
          (y < height - 1 && ids[i + width] !== id) ||
          (z > 0 && ids[i - plane] !== id) ||
          (z < depth - 1 && ids[i + plane] !== id);
        out[i] = surface ? -id : id;
      }
    }
  }
  return out;
}

/**
 * The image window plus the labels window on the same grid, as one two-channel
 * source so Viv raycasts both together: channel 0 the image, channel 1 signed
 * label ids (see `signedLabelVolume`). Float32, so ids up to 2^24 are exact.
 *
 * Which cells show, and in what colour, is decided on the GPU from a lookup
 * texture (`cell-lut-extension.ts`), so this source, and the textures Viv builds
 * from it, depend only on the window.
 */
export class LabelVolumeSource {
  readonly labels: string[];
  readonly tileSize: number;
  readonly meta: WindowPixelSource["meta"];
  private signed: Promise<Volume> | null = null;
  private readonly imageHasC: boolean;

  constructor(
    private readonly image: WindowPixelSource,
    private readonly cells: WindowPixelSource,
  ) {
    this.imageHasC = image.labels.includes("c");
    this.labels = this.imageHasC ? image.labels : ["c", ...image.labels];
    this.tileSize = image.tileSize;
    this.meta = image.meta;
  }

  get shape(): number[] {
    const shape = this.image.shape;
    if (!this.imageHasC) return [2, ...shape];
    return shape.map((s, i) => (this.image.labels[i] === "c" ? 2 : s));
  }

  get dtype(): string {
    return "Float32";
  }

  private volume(): Promise<Volume> {
    if (!this.signed) {
      const pending = this.cells
        .fetchBlock({})
        .then((block) => signedLabelVolume(block.data as unknown as ArrayLike<number>, this.image.width, this.image.height));
      pending.catch(() => {
        this.signed = null;
      });
      this.signed = pending;
    }
    return this.signed;
  }

  async getRaster({ selection, signal }: { selection: Record<string, number>; signal?: AbortSignal }) {
    const { c = 0, ...rest } = selection;
    if (c === 0) {
      return this.image.getRaster({ selection: this.imageHasC ? { ...rest, c: 0 } : rest, signal });
    }
    const volume = await this.volume();
    const plane = this.image.width * this.image.height;
    const z = rest.z ?? 0;
    return {
      data: volume.subarray(z * plane, (z + 1) * plane),
      width: this.image.width,
      height: this.image.height,
    };
  }

  async getTile(): Promise<never> {
    throw new Error("LabelVolumeSource serves whole planes only (VolumeViewer)");
  }

  onTileError(err: Error): void {
    throw err;
  }
}

/** The labels level on exactly the image level's (z, y, x) grid, if any. */
export function matchingLevel(pyramid: ZarrSource[], level: Level): ZarrSource | null {
  const want = ["z", "y", "x"].map((a) => axisSize(level.source, a)).join(",");
  return pyramid.find((s) => ["z", "y", "x"].map((a) => axisSize(s, a)).join(",") === want) ?? null;
}
