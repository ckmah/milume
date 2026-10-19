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
 * Load the inspect minimap overview: lowest pyramid level, max intensity along Z.
 * Repaint only when this promise resolves or the URL changes.
 */
export async function loadInspectOverview(
  imageUrl: string,
  frame: Frame,
  contrast: [number, number],
  volumeComm: VolumeCommClient | null,
  chunkCache: ChunkCache | null,
): Promise<InspectOverview> {
  const pyramid = await loadVolumePyramid(imageUrl, volumeComm);
  pyramid.forEach((src, i) => chunkCache?.attach(src._data, `${imageUrl}#${i}`));
  const levels = pyramidLevels(pyramid);
  const level = levels[levels.length - 1]!;
  const box = levelBox(level);
  const chunk = await fetchBox(level.source, box);
  const data = chunk.data as ArrayLike<number>;
  const [lo, hi] = contrast;
  const { pixels, width, height } = zMaxProjection(data, box, lo, hi);
  const imageData = new ImageData(new Uint8ClampedArray(pixels), width, height);
  const bitmap = await createImageBitmap(imageData);
  const { x, y } = worldBounds(level, frame);
  return { bitmap, xBounds: x, yBounds: y, aspect: width / height };
}

export function frameFromVolume(volume: {
  voxel_size_um?: [number, number, number];
  origin_um?: [number, number, number];
}): Frame {
  const voxel = volume.voxel_size_um ?? [1, 1, 1];
  const origin = volume.origin_um ?? [0, 0, 0];
  return { voxelSize: voxel, origin };
}
