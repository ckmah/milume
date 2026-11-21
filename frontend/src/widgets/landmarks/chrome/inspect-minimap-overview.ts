import { loadOmeZarr, loadOmeZarrFromStore } from "@hms-dbmi/viv";

import type { ChunkCache } from "@/widgets/volume-cube/chunk-cache";
import type { VolumeCommClient } from "@/widgets/volume-cube/volume-comm";
import { isCommVolumeUrl } from "@/widgets/volume-cube/volume-url";
import {
  type Box,
  type Frame,
  type Level,
  type ZarrSource,
  fetchBox,
  levelBox,
  pyramidLevels,
} from "@/widgets/volume-cube/window-source";

function absoluteUrl(url: string): string {
  if (!url) return url;
  return new URL(url, window.location.href).href;
}

async function loadVolumePyramid(url: string, volumeComm: VolumeCommClient | null | undefined) {
  if (isCommVolumeUrl(url)) {
    if (!volumeComm) throw new Error("Volume comm is not available");
    const loaded = await loadOmeZarrFromStore(volumeComm.createStore(url));
    return loaded.data as unknown as ZarrSource[];
  }
  const loaded = await loadOmeZarr(absoluteUrl(url), { type: "multiscales" });
  return loaded.data as unknown as ZarrSource[];
}

/** Z-max projection of the coarsest pyramid level into an 8-bit grayscale raster. */
function zMaxProjection(
  data: ArrayLike<number>,
  box: Box,
  lo: number,
  hi: number,
): { pixels: Uint8ClampedArray; width: number; height: number } {
  const width = box.x1 - box.x0;
  const height = box.y1 - box.y0;
  const depth = box.z1 - box.z0;
  const plane = width * height;
  const span = Math.max(hi - lo, 1);
  const gray = new Uint8Array(plane);
  for (let z = 0; z < depth; z++) {
    const base = z * plane;
    for (let i = 0; i < plane; i++) {
      const v = Number(data[base + i] ?? 0);
      const norm = Math.max(0, Math.min(1, (v - lo) / span));
      const byte = Math.round(norm * 255);
      if (byte > gray[i]) gray[i] = byte;
    }
  }
  const out = new Uint8ClampedArray(plane * 4);
  for (let i = 0; i < plane; i++) {
    const g = gray[i];
    const j = i * 4;
    out[j] = g;
    out[j + 1] = g;
    out[j + 2] = g;
    out[j + 3] = 255;
  }
  return { pixels: out, width, height };
}

export type InspectOverview = {
  bitmap: ImageBitmap;
  xBounds: [number, number];
  yBounds: [number, number];
  aspect: number;
};

/** Coarsest level, kept so a contrast change can reproject without another volume_get. */
export type InspectOverviewSource = {
  data: ArrayLike<number>;
  box: Box;
  xBounds: [number, number];
  yBounds: [number, number];
};

function worldBounds(level: Level, frame: Frame): { x: [number, number]; y: [number, number] } {
  const box = levelBox(level);
  const [, fy, fx] = level.factor;
  const [, sy, sx] = frame.voxelSize;
  const [, oy, ox] = frame.origin;
  return {
    x: [ox, ox + (box.x1 - box.x0) * sx * fx],
    y: [oy, oy + (box.y1 - box.y0) * sy * fy],
  };
}

/**
 * Load the inspect minimap source: lowest pyramid level. Contrast is not an
 * input, so a later limit change reprojects this chunk and does not fetch.
 */
export async function loadInspectOverviewSource(
  imageUrl: string,
  frame: Frame,
  volumeComm: VolumeCommClient | null,
  chunkCache: ChunkCache | null,
): Promise<InspectOverviewSource> {
  const pyramid = await loadVolumePyramid(imageUrl, volumeComm);
  pyramid.forEach((src, i) => chunkCache?.attach(src._data, `${imageUrl}#${i}`));
  const levels = pyramidLevels(pyramid);
  const level = levels[levels.length - 1]!;
  const box = levelBox(level);
  const chunk = await fetchBox(level.source, box);
  const { x, y } = worldBounds(level, frame);
  return { data: chunk.data as ArrayLike<number>, box, xBounds: x, yBounds: y };
}

/** Z-max overview at `contrast` from a source already loaded. */
export async function inspectOverviewFromSource(
  source: InspectOverviewSource,
  contrast: [number, number],
): Promise<InspectOverview> {
  const [lo, hi] = contrast;
  const { pixels, width, height } = zMaxProjection(source.data, source.box, lo, hi);
  const imageData = new ImageData(new Uint8ClampedArray(pixels), width, height);
  const bitmap = await createImageBitmap(imageData);
  return {
    bitmap,
    xBounds: source.xBounds,
    yBounds: source.yBounds,
    aspect: width / height,
  };
}

export function frameFromVolume(volume: {
  voxel_size_um?: [number, number, number];
  origin_um?: [number, number, number];
}): Frame {
  const voxel = volume.voxel_size_um ?? [1, 1, 1];
  const origin = volume.origin_um ?? [0, 0, 0];
  return { voxelSize: voxel, origin };
}
