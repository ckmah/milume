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
    const bright = Math.max(fog * 0.9, glow * Math.min(0.95, fog * 3));
    const r = col[0] * bright + BG[0] * (1 - bright);
    const g = col[1] * bright + BG[1] * (1 - bright);
    const b = col[2] * bright + BG[2] * (1 - bright);

    const alpha =
      smoothstep(Z_NEAR0, Z_NEAR1, z) * (1 - smoothstep(Z_FAR0, Z_FAR1, z));
    const coc = Math.min(40, 40 * Math.abs(1 / z - 1 / zf) * zf);

    if (pr < 0.35 || alpha < 0.01) continue;
    if (sx < -pr || sx > LOGICAL_W + pr || sy < -pr || sy > LOGICAL_H + pr) continue;

    scratch.push({
      sx,
      sy,
      z,
      rad: pr * (1 + coc * 0.04),
      rad0: pr,
      cr: r,
      cg: g,
      cb: b,
      alpha,
      glow,
      coc,
    });
  }

  scratch.sort((a, b) => b.z - a.z);
  return scratch;
}
