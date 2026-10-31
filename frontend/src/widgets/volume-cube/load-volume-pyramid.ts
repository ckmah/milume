import { loadOmeZarr, loadOmeZarrFromStore } from "@hms-dbmi/viv";

import type { VolumeCommClient } from "./volume-comm";
import { isCommVolumeUrl } from "./volume-url";
import type { ZarrSource } from "./window-source";

function absoluteUrl(url: string): string {
  if (!url) return url;
  return new URL(url, window.location.href).href;
}

/** Load OME-Zarr multiscale levels for the map backdrop or Inspect cube. */
export async function loadVolumePyramid(
  url: string,
  volumeComm: VolumeCommClient | null | undefined,
): Promise<ZarrSource[]> {
  if (isCommVolumeUrl(url)) {
    if (!volumeComm) throw new Error("Volume comm is not available");
    const loaded = await loadOmeZarrFromStore(volumeComm.createStore(url));
    return loaded.data as unknown as ZarrSource[];
  }
  const loaded = await loadOmeZarr(absoluteUrl(url), { type: "multiscales" });
  return loaded.data as unknown as ZarrSource[];
}
