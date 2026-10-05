import type { CubeCut } from "./VolumeCube";
import { cameraDirection } from "./axis-legend";

/**
 * Screen px around a cut face's outline that starts a drag.
 * The face interior stays an orbit, so a plain drag on the tissue still turns the cube.
 */
export const CUT_RIM_PX = 16;

/** A face-on normal has no screen direction to drag along. */
const MIN_SCREEN_NORMAL = 0.25;

export type CutAxis = "x" | "y" | "z";
export type CutFace = { axis: CutAxis; edge: 0 | 1 };

type Range = [number, number];
type Vec3 = [number, number, number];
type Pt = { x: number; y: number };

export type PreBox = { lo: Vec3; hi: Vec3 };

type Camera = { zoom: number; rotationX: number; rotationOrbit: number };

/** Data +axis in post-model space. Z_UP is rotateX(-90°), so +y data is +z and +z data is +y. */
const AXIS_WORLD: Record<CutAxis, Vec3> = {
  x: [1, 0, 0],
  y: [0, 0, 1],
  z: [0, 1, 0],
};

/** `Z_UP` (rotateX -90°): pre-model [x, y, z] becomes [x, z, -y]. */
export function postModel([x, y, z]: Vec3): Vec3 {
  return [x, z, -y];
}

/**
 * The cut box in the frame's pre-model units.
 * Data +y runs toward pre-model -y (the frame's map-down axis).
 */
export function cutBoxPre(
  cut: CubeCut,
  winX: Range,
  winY: Range,
  stackZ: Range,
  size: Vec3,
): PreBox {
  const [w, h, d] = size;
  const sx = winX[1] - winX[0] || 1;
  const sy = winY[1] - winY[0] || 1;
  const sz = stackZ[1] - stackZ[0] || 1;
  const x0 = ((cut[0] - winX[0]) / sx) * w;
  const x1 = ((cut[1] - winX[0]) / sx) * w;
  const py0 = (1 - (cut[2] - winY[0]) / sy) * h;
  const py1 = (1 - (cut[3] - winY[0]) / sy) * h;
  const z0 = ((cut[4] - stackZ[0]) / sz) * d;
  const z1 = ((cut[5] - stackZ[0]) / sz) * d;
  return {
    lo: [Math.min(x0, x1), Math.min(py0, py1), Math.min(z0, z1)],
    hi: [Math.max(x0, x1), Math.max(py0, py1), Math.max(z0, z1)],
  };
}

/** True when every cut edge sits on the window or the stack. */
export function cutIsOpen(cut: CubeCut, winX: Range, winY: Range, stackZ: Range, eps = 0.5): boolean {
  return (
    cut[0] <= winX[0] + eps &&
    cut[1] >= winX[1] - eps &&
    cut[2] <= winY[0] + eps &&
    cut[3] >= winY[1] - eps &&
    cut[4] <= stackZ[0] + eps &&
    cut[5] >= stackZ[1] - eps
  );
}

/**
 * Cut edges as fractions of the ray box Viv marches (the window).
 * Y is flipped: texture row 0 is the window's high data-y edge.
 */
export function cutFractions(cut: CubeCut, winX: Range, winY: Range, stackZ: Range): number[] {
  const sx = winX[1] - winX[0] || 1;
  const sy = winY[1] - winY[0] || 1;
  const sz = stackZ[1] - stackZ[0] || 1;
  const x0 = (cut[0] - winX[0]) / sx;
  const x1 = (cut[1] - winX[0]) / sx;
  const y0 = (winY[1] - cut[3]) / sy;
  const y1 = (winY[1] - cut[2]) / sy;
  const z0 = (cut[4] - stackZ[0]) / sz;
  const z1 = (cut[5] - stackZ[0]) / sz;
  return [x0, x1, y0, y1, z0, z1].map((v) => Math.min(1, Math.max(0, v)));
}

function faceCorners(box: PreBox, face: CutFace): Vec3[] {
  const { lo, hi } = box;
  const fixed = face.edge === 0 ? lo : hi;
  const at = (varyA: number, varyB: number): Vec3 => {
    const p: Vec3 = [0, 0, 0];
    const axes: CutAxis[] = ["x", "y", "z"];
    const vary = axes.filter((a) => a !== face.axis);
    for (const a of axes) {
      const i = a === "x" ? 0 : a === "y" ? 1 : 2;
      if (a === face.axis) p[i] = fixed[i];
      else if (a === vary[0]) p[i] = varyA === 0 ? lo[i] : hi[i];
      else p[i] = varyB === 0 ? lo[i] : hi[i];
    }
    return p;
  };
  return [at(0, 0), at(1, 0), at(1, 1), at(0, 1)];
}

const FACES: CutFace[] = (
  [
    ["x", 0],
    ["x", 1],
    ["y", 0],
    ["y", 1],
    ["z", 0],
    ["z", 1],
  ] as const
).map(([axis, edge]) => ({ axis, edge }));

export function faceKey(face: CutFace): string {
  return `${face.axis}${face.edge}`;
}

function projectPoint(pre: Vec3, view: Camera, target: readonly number[], rect: { width: number; height: number }): Pt {
  const p = postModel(pre);
  const rel = [p[0] - target[0]!, p[1] - target[1]!, p[2] - target[2]!];
  const [cx, cy] = cameraDirection(rel, view.rotationX, view.rotationOrbit);
  const s = 2 ** view.zoom;
  return { x: rect.width / 2 + cx * s, y: rect.height / 2 - cy * s };
}

function screenNormal(face: CutFace, view: Camera): { x: number; y: number; len: number } {
  const n = AXIS_WORLD[face.axis];
  const sign = face.edge === 0 ? -1 : 1;
  const [x, y] = cameraDirection([n[0] * sign, n[1] * sign, n[2] * sign], view.rotationX, view.rotationOrbit);
  const len = Math.hypot(x, y);
  return { x, y, len };
}

function distToSegment(p: Pt, a: Pt, b: Pt): number {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const len2 = abx * abx + aby * aby;
  if (len2 < 1e-6) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.y - a.y) * aby) / len2));
  return Math.hypot(p.x - (a.x + t * abx), p.y - (a.y + t * aby));
}

function projectFaces(
  box: PreBox,
  view: Camera,
  target: readonly number[],
  rect: { width: number; height: number },
): { face: CutFace; corners: Pt[] }[] {
  return FACES.map((face) => ({
    face,
    corners: faceCorners(box, face).map((c) => projectPoint(c, view, target, rect)),
  }));
}

function rimDistance(point: Pt, corners: Pt[]): number {
  let rim = Infinity;
  for (let i = 0; i < corners.length; i++) rim = Math.min(rim, distToSegment(point, corners[i]!, corners[(i + 1) % corners.length]!));
  return rim;
}

/** The face whose outline is under `point` (view-local px), or null. */
export function pickCutFace(
  point: Pt,
  box: PreBox,
  view: Camera,
  target: readonly number[],
  rect: { width: number; height: number },
): CutFace | null {
  let best: { face: CutFace; score: number } | null = null;
  for (const face of FACES) {
    const normal = screenNormal(face, view).len;
    if (normal < MIN_SCREEN_NORMAL) continue;
    const corners = faceCorners(box, face).map((c) => projectPoint(c, view, target, rect));
    const dist = rimDistance(point, corners);
    if (dist > CUT_RIM_PX) continue;
    if (!best || dist < best.score) best = { face, score: dist };
  }
  return best?.face ?? null;
}

/** View-local handle point on each face outline: the midpoint of its longest screen edge. */
export function cutFaceAnchors(
  box: PreBox,
  view: Camera,
  target: readonly number[],
  rect: { width: number; height: number },
): string {
  const parts: string[] = [];
  for (const { face, corners } of projectFaces(box, view, target, rect)) {
    if (screenNormal(face, view).len < MIN_SCREEN_NORMAL) continue;
    let best = { len: -1, mid: corners[0]! };
    for (let i = 0; i < corners.length; i++) {
      const a = corners[i]!;
      const b = corners[(i + 1) % corners.length]!;
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      if (len > best.len) best = { len, mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
    }
    parts.push(`${faceKey(face)}:${best.mid.x.toFixed(1)},${best.mid.y.toFixed(1)}`);
  }
  return parts.join(" ");
}

/**
 * µm to add to the face's edge so it follows the pointer along the data axis.
 * `dx`/`dy` are screen px, +dy down.
 */
export function dragToFaceDelta(dx: number, dy: number, face: CutFace, view: Camera, umPerWorld: number): number {
  const n = screenNormal(face, view);
  if (n.len < MIN_SCREEN_NORMAL) return 0;
  const along = (dx * n.x + -dy * n.y) / n.len;
  const sign = face.edge === 0 ? -1 : 1;
  return (sign * along * umPerWorld) / 2 ** view.zoom;
}

const MIN_SPAN = 1;

/** Move one edge, clamped to `bounds` and kept at least 1 µm from the other edge. */
export function moveCutEdge(
  cut: CubeCut,
  face: CutFace,
  deltaUm: number,
  bounds: { x: Range; y: Range; z: Range },
): CubeCut {
  const next = [...cut] as CubeCut;
  const base = face.axis === "x" ? 0 : face.axis === "y" ? 2 : 4;
  const i = base + face.edge;
  const other = base + (face.edge === 0 ? 1 : 0);
  const [lo, hi] = bounds[face.axis];
  let v = Math.max(lo, Math.min(hi, next[i]! + deltaUm));
  if (face.edge === 0) v = Math.min(v, next[other]! - MIN_SPAN);
  else v = Math.max(v, next[other]! + MIN_SPAN);
  v = Math.max(lo, Math.min(hi, v));
  next[i] = v;
  return next;
}
