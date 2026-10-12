import { PERIOD_Z, Z_TILES } from "./constants.ts";

export type GpuField = {
  count: number;
  /** xyz per instance (tiled world positions) */
  pos: Float32Array;
  /** baked palette slot 0..4 per instance (see `palette.ts`) */
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
  const basePos = new Float32Array(n * 3);
  const baseCat = new Uint8Array(n);
  const baseRad = new Float32Array(n);

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
    const p = i * 3;
    basePos[p] = x;
    basePos[p + 1] = y;
    basePos[p + 2] = z;
    baseCat[i] = c;
    baseRad[i] = r;
  }

  const pos = new Float32Array(count * 3);
  const cat = new Uint8Array(count);
  const rad = new Float32Array(count);

  let dst = 0;
  for (let i = 0; i < n; i++) {
    const p = i * 3;
    const x = basePos[p]!;
    const y = basePos[p + 1]!;
    const z = basePos[p + 2]!;
    const c = baseCat[i]!;
    const r = baseRad[i]!;
    for (const k of Z_TILES) {
      const d = dst * 3;
      pos[d] = x;
      pos[d + 1] = y;
      pos[d + 2] = z + k * PERIOD_Z;
      cat[dst] = c;
      rad[dst] = r;
      dst++;
    }
  }
  return { count, pos, cat, rad };
}
