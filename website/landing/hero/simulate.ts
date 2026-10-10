import {
  BG,
  CAT,
  FOCAL,
  LOGICAL_H,
  LOGICAL_W,
  SEL,
  Z_FAR0,
  Z_FAR1,
  Z_NEAR0,
  Z_NEAR1,
} from "./constants.ts";
import { cam, dist3, focusZ, mixTeal, pulse, smoothstep } from "./math.ts";
import type { CellPoint, DrawPoint } from "./types.ts";

const SIG = [0, 0.6, 1.3, 2.3, 3.6, 5.2, 7.2, 9.6, 12.5, 16.0];

function blurRadius(coc: number): number {
  const half = coc * 0.5;
  let lo = 0;
  for (let i = 0; i < SIG.length - 1; i++) {
    if (half <= SIG[i + 1]) {
      const t = (half - SIG[i]) / (SIG[i + 1] - SIG[i]);
      return SIG[i] * (1 - t) + SIG[i + 1] * t;
    }
    lo = i;
  }
  return SIG[SIG.length - 1];
}

const scratch: DrawPoint[] = [];

export function framePoints(cells: CellPoint[], t: number): DrawPoint[] {
  const { c, roll } = cam(t);
  const cr = Math.cos(roll);
  const sr = Math.sin(roll);
  const p = pulse(t);
  const zf = focusZ(t, c[2], p);

  scratch.length = 0;
  const halfW = LOGICAL_W / 2;
  const halfH = LOGICAL_H / 2;

  for (const cell of cells) {
    const dz = cell.z - c[2];
    if (dz <= Z_NEAR0 || dz >= Z_FAR1) continue;

    const dx = cell.x - c[0];
    const dy = cell.y - c[1];
    const x = dx * cr - dy * sr;
    const y = dx * sr + dy * cr;
    const z = dz;
    const sx = halfW + (FOCAL * x) / z;
    const sy = halfH + (FOCAL * y) / z;
    const pr = (FOCAL * cell.rad) / z;

    let glow = 0;
    const base = CAT[cell.cat] ?? CAT[0];
    let col: [number, number, number] = [base[0], base[1], base[2]];

    if (p) {
      const q: [number, number, number] = [cell.x, cell.y, cell.z];
      const ds = dist3(q, SEL);
      const core = 0.85 * Math.exp(-Math.pow(ds / 3, 2)) * smoothstep(0, 1, p.s);
      const ring =
        Math.exp(-Math.pow((ds - 2.5 - p.s * 1.4) / 2, 2)) * smoothstep(0.3, 1.3, p.s);
      glow = Math.min(1, Math.max(0, core + 0.4 * ring)) * p.a;
      const passed = Math.min(1, Math.max(0, ((2.5 + p.s * 1.4 - ds) / 2) * p.a));
      col = mixTeal(col, passed, glow);
    }

    const fog = Math.pow(Math.max(0, Math.min(1, 1 - (z - 1) / (Z_FAR1 - 1))), 1.8);
    let bright = Math.max(fog * 0.97, glow * Math.min(0.98, fog * 3.2));
    if (p) bright = Math.min(1, bright * (1 + 0.14 * p.a));
    const nearLift = z < 10 ? 1 + (10 - z) * 0.022 : 1;
    const chroma = 1.1;
    const r = col[0] * chroma * bright * nearLift + BG[0] * (1 - bright);
    const g = col[1] * chroma * bright * nearLift + BG[1] * (1 - bright);
    const b = col[2] * chroma * bright * nearLift + BG[2] * (1 - bright);

    const alpha =
      smoothstep(Z_NEAR0, Z_NEAR1, z) * (1 - smoothstep(Z_FAR0, Z_FAR1, z));
    const coc = Math.min(40, 40 * Math.abs(1 / z - 1 / zf) * zf);
    const blur = blurRadius(coc);
    const rad = pr + blur * 0.82;
    const coverage = Math.min(1, (pr / Math.max(1, rad)) ** 2);

    if (rad < 0.12 || alpha < 0.006) continue;
    if (sx < -rad || sx > LOGICAL_W + rad || sy < -rad || sy > LOGICAL_H + rad) continue;

    scratch.push({
      sx,
      sy,
      z,
      rad,
      rad0: pr,
      cr: r,
      cg: g,
      cb: b,
      alpha,
      coverage,
      glow,
      coc,
    });
  }

  scratch.sort((a, b) => b.z - a.z);
  return scratch;
}
