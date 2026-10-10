import { LOOP_SEC, PERIOD_Z, SEL, TEAL } from "./constants.ts";
import type { Vec3 } from "./types.ts";

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

export function cam(t: number): { c: Vec3; roll: number } {
  const u = (t / LOOP_SEC) % 1;
  const z = (u * PERIOD_Z) % PERIOD_Z;
  return {
    c: [0.45 * Math.sin(2 * Math.PI * u), 0.25 * Math.sin(4 * Math.PI * u), z],
    roll: 0.0125 * Math.cos(2 * Math.PI * u),
  };
}

export type Pulse = { s: number; a: number };

export function pulse(t: number): Pulse | null {
  if (t < 0.6 || t > 9.6) return null;
  const s = t - 0.6;
  const a = smoothstep(0, 1, s) * (1 - smoothstep(6, 9, s));
  return { s, a };
}

export function dist3(a: Vec3, b: readonly [number, number, number]): number {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  const dz = a[2] - b[2];
  return Math.hypot(dx, dy, dz);
}

export function mixTeal(
  col: [number, number, number],
  passed: number,
  glow: number,
): [number, number, number] {
  let r = col[0];
  let g = col[1];
  let b = col[2];
  const p = passed;
  r = r * (1 - 0.08 * p) + TEAL[0] * 0.08 * p;
  g = g * (1 - 0.08 * p) + TEAL[1] * 0.08 * p;
  b = b * (1 - 0.08 * p) + TEAL[2] * 0.08 * p;
  r = r * (1 - glow) + TEAL[0] * glow;
  g = g * (1 - glow) + TEAL[1] * glow;
  b = b * (1 - glow) + TEAL[2] * glow;
  return [r, g, b];
}

export function focusZ(t: number, camZ: number, pulse: Pulse | null): number {
  let zf = 11;
  if (pulse) {
    zf = 11 + pulse.a * ((SEL[2] - camZ) - 11);
  }
  return zf;
}
