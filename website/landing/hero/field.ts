import { assertUniqueNormalizedXy, jitterDuplicateNormalizedXy } from "./field-xy.ts";

export type GpuField = {
  count: number;
  /** xyz world position per instance */
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
  const count = view.getUint32(0, true);
  const pos = new Float32Array(count * 3);
  const cat = new Uint8Array(count);
  const rad = new Float32Array(count);

  let o = 4;
  for (let i = 0; i < count; i++) {
    const p = i * 3;
    pos[p] = view.getFloat32(o, true);
    o += 4;
    pos[p + 1] = view.getFloat32(o, true);
    o += 4;
    pos[p + 2] = view.getFloat32(o, true);
    o += 4;
    cat[i] = view.getUint8(o);
    o += 1;
    rad[i] = view.getFloat32(o, true);
    o += 4;
  }

  assertUniqueNormalizedXy(pos, count);
  return { count, pos, cat, rad };
}

export function prepareFieldPositions(pos: Float32Array, count: number): void {
  jitterDuplicateNormalizedXy(pos, count);
  assertUniqueNormalizedXy(pos, count);
}
