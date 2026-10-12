import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PERIOD_Z, Z_TILES } from "../landing/hero/constants.ts";
import {
  countVisibleDiscsAtTimeStrict,
  visibleDiscStatsAcrossLoop,
} from "../landing/hero/visible-discs.ts";
import {
  HERO_EXPORT_BASE_COUNT,
  heroSubsampleIndices,
} from "../landing/hero/subsample.ts";
import { assignBakedPointPalette } from "../landing/hero/palette.ts";
import { relocateBasePointsClearOfCameraPath } from "../landing/hero/tube-clearance.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const binPath = join(root, "landing/assets/hero-points.bin");

function loadExportField(): {
  basePos: Float32Array;
  baseRad: Float32Array;
  baseCat: Uint8Array;
} {
  const buf = readFileSync(binPath);
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let n = view.getUint32(0, true);
  if (n !== HERO_EXPORT_BASE_COUNT) {
    throw new Error(`bench needs export bin with ${HERO_EXPORT_BASE_COUNT} points, got ${n}`);
  }
  const basePos = new Float32Array(n * 3);
  const baseRad = new Float32Array(n);
  const baseCat = new Uint8Array(n);
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
  return { basePos, baseRad, baseCat };
}

function tileField(basePos: Float32Array, baseRad: Float32Array, n: number) {
  const count = n * Z_TILES.length;
  const pos = new Float32Array(count * 3);
  const rad = new Float32Array(count);
  let dst = 0;
  for (let i = 0; i < n; i++) {
    const p = i * 3;
    for (const k of Z_TILES) {
      const d = dst * 3;
      pos[d] = basePos[p]!;
      pos[d + 1] = basePos[p + 1]!;
      pos[d + 2] = basePos[p + 2]! + k * PERIOD_Z;
      rad[dst] = baseRad[i]!;
      dst++;
    }
  }
  return { pos, rad, count };
}

function benchKeep(keep: number) {
  const { basePos, baseRad, baseCat } = loadExportField();
  const kept = heroSubsampleIndices(HERO_EXPORT_BASE_COUNT, keep);
  const pos = new Float32Array(keep * 3);
  const rad = new Float32Array(keep);
  const cat = new Uint8Array(keep);
  for (let j = 0; j < keep; j++) {
    const i = kept[j]!;
    const src = i * 3;
    const dst = j * 3;
    pos[dst] = basePos[src]!;
    pos[dst + 1] = basePos[src + 1]!;
    pos[dst + 2] = basePos[src + 2]!;
    rad[j] = baseRad[i]!;
    cat[j] = baseCat[i]!;
  }
  relocateBasePointsClearOfCameraPath(pos, rad, keep);
  assignBakedPointPalette(cat, keep);
  const tiled = tileField(pos, rad, keep);
  const layout = { logicalW: 1024, logicalH: 576 };
  const intersect = visibleDiscStatsAcrossLoop(tiled.pos, tiled.rad, tiled.count, 32, layout);
  const center = visibleDiscStatsAcrossLoop(
    tiled.pos,
    tiled.rad,
    tiled.count,
    32,
    layout,
    countVisibleDiscsAtTimeStrict,
  );
  return { keep, instances: tiled.count, intersect, center };
}

const tries = [80, 100, 120, 150, 180, 220, 280, 360, 450, 650];
for (const k of tries) {
  try {
    const s = benchKeep(k);
    console.log(
      `keep=${k} intersect mean=${s.intersect.mean.toFixed(0)} center mean=${s.center.mean.toFixed(0)}`,
    );
  } catch (e) {
    console.log(`keep=${k} error`, e);
  }
}
