import type { ImageChannelRow } from "@/widgets/landmarks/use-landmarks-model";

import { axisSize, type ZarrSource } from "./window-source";
import { defaultChannelTint } from "./tint-palette";

export const MAX_CUBE_IMAGE_CHANNELS = 4;

export type CubeImageChannel = {
  name: string;
  index: number;
  visible: boolean;
  contrast: [number, number];
  tint: string;
};

export function channelAxisIndex(source: ZarrSource): number {
  return source.labels.indexOf("c");
}

export function resolveChannelIndex(source: ZarrSource, name: string, entries: ImageChannelRow[]): number {
  const names = entries.map((e) => e.name);
  const idx = names.indexOf(name);
  if (idx >= 0) return idx;
  return channelAxisIndex(source) >= 0 ? 0 : 0;
}

export function cubeImageChannels(
  entries: ImageChannelRow[],
  source: ZarrSource | null,
  fallbackContrast: [number, number],
): CubeImageChannel[] {
  if (!entries.length) return [];
  const ci = source ? channelAxisIndex(source) : -1;
  const fromSource = source && ci >= 0 ? axisSize(source, "c") : 0;
  const channelCount = Math.max(fromSource, Math.min(entries.length, MAX_CUBE_IMAGE_CHANNELS));
  const out: CubeImageChannel[] = [];
  entries.forEach((row, i) => {
    if (!row.visible || row.constant_zero) return;
    const index = source ? resolveChannelIndex(source, row.name, entries) : i;
    if (index < 0 || index >= channelCount) return;
    out.push({
      name: row.name,
      index,
      visible: true,
      contrast: row.contrast_limits ?? fallbackContrast,
      tint: row.color ?? defaultChannelTint(i),
    });
  });
  return out.slice(0, MAX_CUBE_IMAGE_CHANNELS);
}
