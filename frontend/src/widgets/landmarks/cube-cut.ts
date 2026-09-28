import type { CubeCut } from "@/widgets/volume-cube/VolumeCube";

type Range = [number, number];

/** µm from the window's low edge; `null` is open: it sits on the window edge and follows it. */
export type CutEdge = number | null;

/**
 * The cube's cut in client state. X and Y are window-relative, so moving the
 * inspect window never needs a write to stay correct; Z is absolute µm
 * (±Infinity when open), since the stack does not move.
 */
export type RelativeCut = { x: [CutEdge, CutEdge]; y: [CutEdge, CutEdge]; z: Range };

export const OPEN_CUT: RelativeCut = { x: [null, null], y: [null, null], z: [-Infinity, Infinity] };

/** The inspect window in µm, clamped to the volume once its extent is known. */
export type CutWindow = { x: Range; y: Range };

const EPS = 1e-6;

function clamp(lo: number, hi: number, [min, max]: Range): Range {
  const a = Math.max(min, Math.min(lo, hi));
  // A range wholly outside [min, max] collapses to empty rather than inverting.
  return [a, Math.max(a, Math.min(max, Math.max(lo, hi)))];
}

/**
 * The window around (cx, cy): clamped to the volume's XY extent when known,
 * otherwise only to its origin (the cube clamps the rest).
 */
export function cutWindow(
  cx: number,
  cy: number,
  size: number,
  origin: { x: number; y: number },
  volume: { x: Range; y: Range } | null,
): CutWindow {
  const half = size / 2;
  const x: Range = volume ? clamp(cx - half, cx + half, volume.x) : [Math.max(cx - half, origin.x), cx + half];
  const y: Range = volume ? clamp(cy - half, cy + half, volume.y) : [Math.max(cy - half, origin.y), cy + half];
  return { x, y };
}

function edgesOf(lo: number, hi: number, [w0, w1]: Range): [CutEdge, CutEdge] {
  return [lo <= w0 + EPS ? null : lo - w0, hi >= w1 - EPS ? null : hi - w0];
}

function edgesIn([lo, hi]: [CutEdge, CutEdge], win: Range): Range {
  return clamp(lo == null ? win[0] : win[0] + lo, hi == null ? win[1] : win[0] + hi, win);
}

/** An absolute cut (a slider value, or `volume_cut` from Python) against the window. */
export function toRelativeCut(cut: CubeCut, win: CutWindow): RelativeCut {
  return { x: edgesOf(cut[0], cut[1], win.x), y: edgesOf(cut[2], cut[3], win.y), z: [cut[4], cut[5]] };
}

/**
 * The cut the cube draws and the sliders show, inside the current window.
 * Z is clamped to the stack once it is known, so an open Z shows its edges.
 */
export function shownCut(rel: RelativeCut, win: CutWindow, stackZ: Range | null): CubeCut {
  const z = stackZ ? clamp(rel.z[0], rel.z[1], stackZ) : rel.z;
  return [...edgesIn(rel.x, win.x), ...edgesIn(rel.y, win.y), z[0], z[1]] as CubeCut;
}

/**
 * The absolute cut written to `volume_cut`: open edges are the volume's edges
 * (so a cut only in Z stays "whole in X and Y" for any window), others are
 * placed in the current window. Z open edges become the stack's.
 */
export function committedCut(
  rel: RelativeCut,
  win: CutWindow,
  volume: { x: Range; y: Range; z: Range },
): CubeCut {
  const edge = (e: CutEdge, w0: number, open: number) => (e == null ? open : w0 + e);
  const z = clamp(rel.z[0], rel.z[1], volume.z);
  return [
    edge(rel.x[0], win.x[0], volume.x[0]),
    edge(rel.x[1], win.x[0], volume.x[1]),
    edge(rel.y[0], win.y[0], volume.y[0]),
    edge(rel.y[1], win.y[0], volume.y[1]),
    z[0],
    z[1],
  ];
}
