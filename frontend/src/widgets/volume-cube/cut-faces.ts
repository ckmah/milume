import { OrbitViewport } from "@deck.gl/core";

import type { CubeCut } from "./VolumeCube";
import { cameraDirection } from "./axis-legend";

/** Matches VolumeCube and deck's OrbitView default. */
export const CUBE_FOVY = 50;

/**
 * Screen px around a cut face's outline that starts a drag, together with the
 * face interior. A press on the plate cuts; orbit stays off the grabbable faces.
 */
export const CUT_RIM_PX = 16;

/** Screen px outside the outline that lights the plate before the pointer is on it. */
export const CUT_NEAR_PX = 40;

/** A sample point in the near band: past the rim, short of the band's far edge. */
const NEAR_SAMPLE_PX = (CUT_RIM_PX + CUT_NEAR_PX) / 2;

const FACE_ON_NORMAL = 0.25;

/** Edge-on faces project to a line. The plate is at least this thick, in screen px. */
const MIN_PLATE_PX = 12;

function faceOn(screenNormalLength: number): boolean {
  return screenNormalLength < FACE_ON_NORMAL;
}

export type CutAxis = "x" | "y" | "z";
export type CutFace = { axis: CutAxis; edge: 0 | 1 };

type Range = [number, number];
type Vec3 = [number, number, number];
type Pt = { x: number; y: number };

export type PreBox = { lo: Vec3; hi: Vec3 };

type Camera = { zoom: number; rotationX: number; rotationOrbit: number };

/** `Z_UP` (rotateX -90°): pre-model [x, y, z] becomes [x, z, -y]. */
export function postModel([x, y, z]: Vec3): Vec3 {
  return [x, z, -y];
}

function preY(dataFraction: number, span: number): number {
  return (1 - dataFraction) * span;
}

/**
 * The cut box in the frame's pre-model units.
 * Data +y runs toward pre-model -y (the frame's map-down axis).
 */
/** Z from µm through the same slice mapping the volume ray march uses. */
export type CutZMap = { ozUm: number; stepZ: number; zSlice: Range };

/** Map absolute z (µm) to pre-model height along the cube box, matching Viv `zSlice` + ray `p.z`. */
export function umZToWorldHeight(
  zUm: number,
  ozUm: number,
  stepZ: number,
  zSlice: Range,
  depth: number,
): number {
  const span = zSlice[1] - zSlice[0] || 1;
  const tz = (zUm - ozUm) / stepZ;
  return ((tz - zSlice[0]) / span) * depth;
}

/** Cut box in the inspect window's pre-model units (same space as the outer wireframe). */
export function cutBoxPre(
  cut: CubeCut,
  winX: Range,
  winY: Range,
  stackZ: Range,
  size: Vec3,
  zMap?: CutZMap,
  /** Z edges as fractions of the ray box (same as `cutFrac[4]` / `[5]`); keeps plates on the clip. */
  cutZFrac?: Range,
): PreBox {
  const [w, h, d] = size;
  const sx = winX[1] - winX[0] || 1;
  const sy = winY[1] - winY[0] || 1;
  const sz = stackZ[1] - stackZ[0] || 1;
  const x0 = ((cut[0] - winX[0]) / sx) * w;
  const x1 = ((cut[1] - winX[0]) / sx) * w;
  const py0 = preY((cut[2] - winY[0]) / sy, h);
  const py1 = preY((cut[3] - winY[0]) / sy, h);
  const mapZ = (um: number) => {
    if (!zMap) return ((um - stackZ[0]) / sz) * d;
    const tz = (um - zMap.ozUm) / zMap.stepZ;
    const zs = zMap.zSlice;
    const span = zs[1] - zs[0] || 1;
    return ((tz - zs[0]) / span) * d;
  };
  const z0 = cutZFrac ? cutZFrac[0] * d : mapZ(cut[4]!);
  const z1 = cutZFrac ? cutZFrac[1] * d : mapZ(cut[5]!);
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

/**
 * Cut edges as fractions of the Viv slice ranges the ray march uses.
 * Map µm with the same texture coords as `xSlice` / `ySlice` / `zSlice`.
 */
export function cutFractionsForSlices(
  cut: CubeCut,
  xSlice: Range,
  ySlice: Range,
  zSlice: Range,
  texX: (um: number) => number,
  texY: (um: number) => number,
  texZ: (um: number) => number,
): number[] {
  const sx = xSlice[1] - xSlice[0] || 1;
  const sy = ySlice[1] - ySlice[0] || 1;
  const sz = zSlice[1] - zSlice[0] || 1;
  const x0 = (texX(cut[0]!) - xSlice[0]) / sx;
  const x1 = (texX(cut[1]!) - xSlice[0]) / sx;
  const tyLo = texY(cut[2]!);
  const tyHi = texY(cut[3]!);
  const y0 = (Math.min(tyLo, tyHi) - ySlice[0]) / sy;
  const y1 = (Math.max(tyLo, tyHi) - ySlice[0]) / sy;
  const z0 = (texZ(cut[4]!) - zSlice[0]) / sz;
  const z1 = (texZ(cut[5]!) - zSlice[0]) / sz;
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

function orbitViewport(view: Camera, target: readonly number[], rect: { width: number; height: number }) {
  return new OrbitViewport({
    id: "3d",
    width: rect.width,
    height: rect.height,
    fovy: CUBE_FOVY,
    orbitAxis: "Y",
    target: [target[0]!, target[1]!, target[2]!],
    zoom: view.zoom,
    rotationOrbit: view.rotationOrbit,
    rotationX: view.rotationX,
  });
}

/** Screen position (top-left origin) for a cut-box corner in pre-model units. */
function projectPoint(pre: Vec3, view: Camera, target: readonly number[], rect: { width: number; height: number }): Pt {
  const world = postModel(pre);
  const [x, y] = orbitViewport(view, target, rect).project(world);
  return { x, y };
}

function dataAxisWorld(axis: CutAxis): Vec3 {
  const alongData: Vec3 = axis === "x" ? [1, 0, 0] : axis === "y" ? [0, preY(1, 1) - preY(0, 1), 0] : [0, 0, 1];
  return postModel(alongData);
}

function screenNormal(face: CutFace, view: Camera): { x: number; y: number; len: number; toward: number } {
  const n = dataAxisWorld(face.axis);
  const sign = face.edge === 0 ? -1 : 1;
  const [x, y, z] = cameraDirection([n[0] * sign, n[1] * sign, n[2] * sign], view.rotationX, view.rotationOrbit);
  const len = Math.hypot(x, y);
  return { x, y, len, toward: z };
}

const RESIZE_CURSORS = ["ew-resize", "nwse-resize", "ns-resize", "nesw-resize"] as const;
export type CutResizeCursor = (typeof RESIZE_CURSORS)[number];

/** CSS resize cursor along the face's on-screen drag direction (y down). */
export function cutResizeCursor(face: CutFace, view: Camera): CutResizeCursor {
  const n = screenNormal(face, view);
  const oct = Math.round(Math.atan2(-n.y, n.x) / (Math.PI / 4));
  return RESIZE_CURSORS[(((oct % 4) + 4) % 4)]!;
}

function distToSegment(p: Pt, a: Pt, b: Pt): number {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const len2 = abx * abx + aby * aby;
  if (len2 < 1e-6) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.y - a.y) * aby) / len2));
  return Math.hypot(p.x - (a.x + t * abx), p.y - (a.y + t * aby));
}

function rimDistance(point: Pt, corners: Pt[]): number {
  let rim = Infinity;
  for (let i = 0; i < corners.length; i++) rim = Math.min(rim, distToSegment(point, corners[i]!, corners[(i + 1) % corners.length]!));
  return rim;
}

function pointInPoly(point: Pt, corners: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = corners.length - 1; i < corners.length; j = i++) {
    const a = corners[i]!;
    const b = corners[j]!;
    if ((a.y > point.y) !== (b.y > point.y) && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

function centroid(corners: Pt[]): Pt {
  const c = corners.reduce((s, p) => ({ x: s.x + p.x, y: s.y + p.y }), { x: 0, y: 0 });
  return { x: c.x / corners.length, y: c.y / corners.length };
}

/** A grabbable cut face in view-local px (y down). Faces that face the camera are omitted. */
export type ProjectedCutFace = {
  face: CutFace;
  corners: Pt[];
  center: Pt;
  /** Unit vector of the outward drag, y down. */
  dir: Pt;
  toward: number;
};

export function projectCutFaces(
  box: PreBox,
  view: Camera,
  target: readonly number[],
  rect: { width: number; height: number },
): ProjectedCutFace[] {
  const plates: ProjectedCutFace[] = [];
  for (const face of FACES) {
    const normal = screenNormal(face, view);
    if (faceOn(normal.len)) continue;
    const corners = visibleCorners(faceCorners(box, face).map((c) => projectPoint(c, view, target, rect)));
    const len = normal.len || 1;
    plates.push({
      face,
      corners,
      center: centroid(corners),
      dir: { x: normal.x / len, y: -normal.y / len },
      toward: normal.toward,
    });
  }
  return plates;
}

type Scored = { face: CutFace; score: number; toward: number };

function prefer(best: Scored | null, next: Scored): boolean {
  if (!best) return true;
  if (next.score < best.score - 0.5) return true;
  if (next.score > best.score + 0.5) return false;
  return next.toward > best.toward;
}

/**
 * The plate under `point`, and the nearest plate in the near band when the
 * pointer is not on one. The plate is the face interior or the `CUT_RIM_PX` outline.
 */
function plateDragDir(
  face: CutFace,
  box: PreBox,
  view: Camera,
  target: readonly number[],
  rect: { width: number; height: number },
): Pt | null {
  for (const plate of projectCutFaces(box, view, target, rect)) {
    if (plate.face.axis === face.axis && plate.face.edge === face.edge) return plate.dir;
  }
  return null;
}

export function cutPointerTarget(
  point: Pt,
  box: PreBox,
  view: Camera,
  target: readonly number[],
  rect: { width: number; height: number },
): { face: CutFace | null; near: CutFace | null; dragDir: Pt | null } {
  let hover: Scored | null = null;
  let near: Scored | null = null;
  const plates = projectCutFaces(box, view, target, rect).sort((a, b) => b.toward - a.toward);
  for (const plate of plates) {
    const inside = pointInPoly(point, plate.corners);
    const rim = rimDistance(point, plate.corners);
    if (inside || rim <= CUT_RIM_PX) {
      const next = { face: plate.face, score: inside ? 0 : rim, toward: plate.toward };
      if (prefer(hover, next)) hover = next;
    } else if (rim <= CUT_NEAR_PX) {
      const next = { face: plate.face, score: rim, toward: plate.toward };
      if (prefer(near, next)) near = next;
    }
  }
  const face = hover?.face ?? null;
  return {
    face,
    near: hover ? null : (near?.face ?? null),
    dragDir: face ? plateDragDir(face, box, view, target, rect) : null,
  };
}

/** The face whose plate is under `point` (view-local px), or null. */
export function pickCutFace(
  point: Pt,
  box: PreBox,
  view: Camera,
  target: readonly number[],
  rect: { width: number; height: number },
): CutFace | null {
  return cutPointerTarget(point, box, view, target, rect).face;
}

function longestEdge(corners: Pt[]): { a: Pt; b: Pt; mid: Pt; out: Pt } {
  let best = { len: -1, a: corners[0]!, b: corners[1]! };
  for (let i = 0; i < corners.length; i++) {
    const a = corners[i]!;
    const b = corners[(i + 1) % corners.length]!;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len > best.len) best = { len, a, b };
  }
  const mid = { x: (best.a.x + best.b.x) / 2, y: (best.a.y + best.b.y) / 2 };
  let px = -(best.b.y - best.a.y);
  let py = best.b.x - best.a.x;
  const pl = Math.hypot(px, py) || 1;
  px /= pl;
  py /= pl;
  const center = centroid(corners);
  if ((mid.x - center.x) * px + (mid.y - center.y) * py < 0) {
    px = -px;
    py = -py;
  }
  return { a: best.a, b: best.b, mid, out: { x: px, y: py } };
}

/** A face aimed edge-on is a strip along its outline, so the plate still reads. */
function visibleCorners(corners: Pt[]): Pt[] {
  const edge = longestEdge(corners);
  const proj = corners.map((p) => (p.x - edge.mid.x) * edge.out.x + (p.y - edge.mid.y) * edge.out.y);
  const span = Math.max(...proj) - Math.min(...proj);
  if (span >= MIN_PLATE_PX) return corners;
  const half = MIN_PLATE_PX / 2;
  const { a, b, out } = edge;
  return [
    { x: a.x + out.x * half, y: a.y + out.y * half },
    { x: b.x + out.x * half, y: b.y + out.y * half },
    { x: b.x - out.x * half, y: b.y - out.y * half },
    { x: a.x - out.x * half, y: a.y - out.y * half },
  ];
}

/** A point just outside one edge, in the near band and off every plate. */
function nearSample(plate: ProjectedCutFace, plates: ProjectedCutFace[]): Pt {
  const { mid, out } = longestEdge(plate.corners);
  const fallback = { x: mid.x + out.x * NEAR_SAMPLE_PX, y: mid.y + out.y * NEAR_SAMPLE_PX };
  for (let i = 0; i < plate.corners.length; i++) {
    const a = plate.corners[i]!;
    const b = plate.corners[(i + 1) % plate.corners.length]!;
    const edgeMid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    let px = -(b.y - a.y);
    let py = b.x - a.x;
    const pl = Math.hypot(px, py) || 1;
    px /= pl;
    py /= pl;
    if ((edgeMid.x - plate.center.x) * px + (edgeMid.y - plate.center.y) * py < 0) {
      px = -px;
      py = -py;
    }
    for (const dist of [NEAR_SAMPLE_PX, 24, 34]) {
      const p = { x: edgeMid.x + px * dist, y: edgeMid.y + py * dist };
      const rim = rimDistance(p, plate.corners);
      if (rim <= CUT_RIM_PX + 2 || rim > CUT_NEAR_PX - 2) continue;
      const blocked = plates.some(
        (other) => pointInPoly(p, other.corners) || rimDistance(p, other.corners) <= CUT_RIM_PX,
      );
      if (!blocked) return p;
    }
  }
  return fallback;
}

function mark(face: CutFace, point: Pt): string {
  return `${faceKey(face)}:${point.x.toFixed(1)},${point.y.toFixed(1)}`;
}

/**
 * View-local points on each grabbable face: the outline midpoint (`anchors`),
 * the plate centre, and a point in the near band.
 */
export function cutFaceMarks(
  box: PreBox,
  view: Camera,
  target: readonly number[],
  rect: { width: number; height: number },
): { anchors: string; centers: string; near: string } {
  const plates = projectCutFaces(box, view, target, rect);
  const anchors: string[] = [];
  const centers: string[] = [];
  const near: string[] = [];
  for (const plate of plates) {
    anchors.push(mark(plate.face, longestEdge(plate.corners).mid));
    centers.push(mark(plate.face, plate.center));
    near.push(mark(plate.face, nearSample(plate, plates)));
  }
  return { anchors: anchors.join(" "), centers: centers.join(" "), near: near.join(" ") };
}

/** View-local handle point on each face outline: the midpoint of its longest screen edge. */
export function cutFaceAnchors(
  box: PreBox,
  view: Camera,
  target: readonly number[],
  rect: { width: number; height: number },
): string {
  return cutFaceMarks(box, view, target, rect).anchors;
}

/**
 * µm to add to the face's edge so it follows the pointer along the data axis.
 * `dx`/`dy` are screen px, +dy down.
 */
/** Pre-model Y runs opposite data Y, so cut indices 2/3 swap against y0/y1 faces. */
function cutEdgeIndex(face: CutFace): 0 | 1 {
  return face.axis === "y" ? ((face.edge ^ 1) as 0 | 1) : face.edge;
}

/** Screen drag along the plate's outward axis → µm delta on the matching cut edge. */
function dragSignForDataEdge(face: CutFace): number {
  // Y plates use visual edge; moveCutEdge still maps y0/y1 → cut indices via cutEdgeIndex.
  const edge = face.axis === "y" ? face.edge : cutEdgeIndex(face);
  return edge === 0 ? -1 : 1;
}

export function dragToFaceDelta(
  dx: number,
  dy: number,
  face: CutFace,
  view: Camera,
  umPerWorld: number,
  screenOutward?: Pt,
): number {
  const scale = umPerWorld / 2 ** view.zoom;
  const sign = dragSignForDataEdge(face);
  if (screenOutward) return sign * (dx * screenOutward.x + dy * screenOutward.y) * scale;
  const n = screenNormal(face, view);
  if (faceOn(n.len)) return 0;
  const along = (dx * n.x + -dy * n.y) / n.len;
  return sign * along * scale;
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
  const edge = cutEdgeIndex(face);
  const i = base + edge;
  const other = base + (edge === 0 ? 1 : 0);
  const [lo, hi] = bounds[face.axis];
  let v = Math.max(lo, Math.min(hi, next[i]! + deltaUm));
  if (edge === 0) v = Math.min(v, next[other]! - MIN_SPAN);
  else v = Math.max(v, next[other]! + MIN_SPAN);
  v = Math.max(lo, Math.min(hi, v));
  next[i] = v;
  return next;
}
