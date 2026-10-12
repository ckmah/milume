import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PERIOD_Z, Z_TILES } from "../landing/hero/constants.ts";
import {
  HERO_BAKED_BASE_COUNT,
  HERO_EXPORT_BASE_COUNT,
  heroSubsampleIndices,
} from "../landing/hero/subsample.ts";
import {
  maxProjectedLogicalRadius,
  maxProjectionStatsForField,
} from "../landing/hero/projection.ts";
import { relocateBasePointsClearOfCameraPath } from "../landing/hero/tube-clearance.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const binPath = join(root, "landing/assets/hero-points.bin");

type BaseField = {
  n: number;
  basePos: Float32Array;
  baseCat: Uint8Array;
  baseRad: Float32Array;
};

function readBaseField(buf: Buffer): BaseField {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const n = view.getUint32(0, true);
  const basePos = new Float32Array(n * 3);
  const baseCat = new Uint8Array(n);
  const baseRad = new Float32Array(n);

  let o = 4;
  for (let i = 0; i < n; i++) {
    const p = i * 3;
    basePos[p] = view.getFloat32(o, true);
    o += 4;
    basePos[p + 1] = view.getFloat32(o, true);
    o += 4;
    basePos[p + 2] = view.getFloat32(o, true);
    o += 4;
    baseCat[i] = view.getUint8(o);
    o += 1;
    baseRad[i] = view.getFloat32(o, true);
    o += 4;
  }
  return { n, basePos, baseCat, baseRad };
}

function subsampleBaseField(field: BaseField): BaseField {
  const { n } = field;
  if (n === HERO_BAKED_BASE_COUNT) {
    return field;
  }
  if (n !== HERO_EXPORT_BASE_COUNT) {
    throw new Error(
      `hero bake: expected ${HERO_EXPORT_BASE_COUNT} export points or ${HERO_BAKED_BASE_COUNT} baked, got ${n}`,
    );
  }

  const kept = heroSubsampleIndices(n, HERO_BAKED_BASE_COUNT);
  const m = kept.length;
  const basePos = new Float32Array(m * 3);
  const baseCat = new Uint8Array(m);
  const baseRad = new Float32Array(m);
  for (let j = 0; j < m; j++) {
    const i = kept[j]!;
    const src = i * 3;
    const dst = j * 3;
    basePos[dst] = field.basePos[src]!;
    basePos[dst + 1] = field.basePos[src + 1]!;
    basePos[dst + 2] = field.basePos[src + 2]!;
    baseCat[j] = field.baseCat[i]!;
    baseRad[j] = field.baseRad[i]!;
  }
  return { n: m, basePos, baseCat, baseRad };
}

function writeBaseField(path: string, field: BaseField): void {
  const { n, basePos, baseCat, baseRad } = field;
  const out = Buffer.alloc(4 + n * (12 + 1 + 4));
  out.writeUInt32LE(n, 0);
  let w = 4;
  for (let i = 0; i < n; i++) {
    const p = i * 3;
    out.writeFloatLE(basePos[p]!, w);
    w += 4;
    out.writeFloatLE(basePos[p + 1]!, w);
    w += 4;
    out.writeFloatLE(basePos[p + 2]!, w);
    w += 4;
    out.writeUInt8(baseCat[i]!, w);
    w += 1;
    out.writeFloatLE(baseRad[i]!, w);
    w += 4;
  }
  writeFileSync(path, out);
}

const buf = readFileSync(binPath);
let field = readBaseField(buf);
field = subsampleBaseField(field);
const { n, basePos, baseRad } = field;

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

writeBaseField(binPath, field);
console.log(
  `baked ${binPath} (base=${n} instances=${count} maxPr=${stats.maxPr.toFixed(2)} cap=${cap.toFixed(2)})`,
);
