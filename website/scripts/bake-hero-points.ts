import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { relocateBasePointsClearOfCameraPath } from "../landing/hero/tube-clearance.ts";
import {
  maxProjectedLogicalRadius,
  maxProjectionStatsForField,
} from "../landing/hero/projection.ts";
import { PERIOD_Z, Z_TILES } from "../landing/hero/constants.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const binPath = join(root, "landing/assets/hero-points.bin");

const buf = readFileSync(binPath);
const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
const n = view.getUint32(0, true);
const basePos = new Float32Array(n * 3);
const baseRad = new Float32Array(n);

let o = 4;
for (let i = 0; i < n; i++) {
  basePos[i * 3] = view.getFloat32(o, true);
  o += 4;
  basePos[i * 3 + 1] = view.getFloat32(o, true);
  o += 4;
  basePos[i * 3 + 2] = view.getFloat32(o, true);
  o += 4;
  o += 1;
  baseRad[i] = view.getFloat32(o, true);
  o += 4;
}

relocateBasePointsClearOfCameraPath(basePos, baseRad, n);

const tileCount = Z_TILES.length;
const count = n * tileCount;
const pos = new Float32Array(count * 3);
const rad = new Float32Array(count);
let dst = 0;
for (let i = 0; i < n; i++) {
  const p = i * 3;
  const x = basePos[p]!;
  const y = basePos[p + 1]!;
  const z = basePos[p + 2]!;
  const r = baseRad[i]!;
  for (const k of Z_TILES) {
    const d = dst * 3;
    pos[d] = x;
    pos[d + 1] = y;
    pos[d + 2] = z + k * PERIOD_Z;
    rad[dst] = r;
    dst++;
  }
}

const stats = maxProjectionStatsForField(pos, rad, count);
const cap = maxProjectedLogicalRadius();
if (stats.minDepth <= 0 || stats.maxPr > cap * 1.001) {
  throw new Error(
    `hero tube bake failed: minDepth=${stats.minDepth} maxPr=${stats.maxPr} cap=${cap}`,
  );
}

const out = Buffer.alloc(4 + n * (12 + 1 + 4));
out.writeUInt32LE(n, 0);
let w = 4;
let ro = 4;
for (let i = 0; i < n; i++) {
  const p = i * 3;
  out.writeFloatLE(basePos[p]!, w);
  w += 4;
  out.writeFloatLE(basePos[p + 1]!, w);
  w += 4;
  out.writeFloatLE(basePos[p + 2]!, w);
  w += 4;
  const cat = view.getUint8(ro + 12);
  out.writeUInt8(cat, w);
  w += 1;
  out.writeFloatLE(baseRad[i]!, w);
  w += 4;
  ro += 17;
}
writeFileSync(binPath, out);
console.log(`baked ${binPath} (maxPr=${stats.maxPr.toFixed(2)} cap=${cap.toFixed(2)})`);
