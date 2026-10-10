import { PERIOD_Z, Z_TILES } from "./constants.ts";
import type { CellPoint } from "./types.ts";

export async function loadField(assetUrl: string): Promise<CellPoint[]> {
  const res = await fetch(assetUrl);
  if (!res.ok) throw new Error(`hero points: ${res.status}`);
  const buf = await res.arrayBuffer();
  const view = new DataView(buf);
  const n = view.getUint32(0, true);
  const cells: CellPoint[] = [];
  let o = 4;
  for (let i = 0; i < n; i++) {
    const x = view.getFloat32(o, true);
    o += 4;
    const y = view.getFloat32(o, true);
    o += 4;
    const z = view.getFloat32(o, true);
    o += 4;
    const cat = view.getUint8(o);
    o += 1;
    const rad = view.getFloat32(o, true);
    o += 4;
    cells.push({ x, y, z, cat, rad });
  }

  const tiled: CellPoint[] = [];
  for (const k of Z_TILES) {
    const dz = k * PERIOD_Z;
    for (const c of cells) {
      tiled.push({ x: c.x, y: c.y, z: c.z + dz, cat: c.cat, rad: c.rad });
    }
  }
  return tiled;
}
