import { PERIOD_Z, Z_TILES } from "./constants.ts";

export type GpuField = {
  count: number;
  /** xyz per instance (tiled world positions) */
  pos: Float32Array;
  /** category 0..3 per instance */
  cat: Uint8Array;
  /** base radius per instance */
  rad: Float32Array;
};

export async function loadGpuField(assetUrl: string): Promise<GpuField> {
  const res = await fetch(assetUrl);
  if (!res.ok) throw new Error(`hero points: ${res.status}`);
  const buf = await res.arrayBuffer();
  const view = new DataView(buf);
  const n = view.getUint32(0, true);
  const tileCount = Z_TILES.length;
  const count = n * tileCount;
  const pos = new Float32Array(count * 3);
  const cat = new Uint8Array(count);
  const rad = new Float32Array(count);

  let dst = 0;
  let o = 4;
  for (let i = 0; i < n; i++) {
    const x = view.getFloat32(o, true);
    o += 4;
    const y = view.getFloat32(o, true);
    o += 4;
    const z = view.getFloat32(o, true);
    o += 4;
    const c = view.getUint8(o);
    o += 1;
    const r = view.getFloat32(o, true);
    o += 4;
    for (const k of Z_TILES) {
      const p = dst * 3;
      pos[p] = x;
      pos[p + 1] = y;
      pos[p + 2] = z + k * PERIOD_Z;
      cat[dst] = c;
      rad[dst] = r;
      dst++;
    }
  }
  return { count, pos, cat, rad };
}
