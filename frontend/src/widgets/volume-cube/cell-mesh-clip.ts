/**
 * Prototype (branch proto-cell-mesh): the cut box for cell meshes.
 *
 * Mesh vertices sit in window-relative µm (`originUm` subtracted), so the clip
 * is an axis-aligned box in that space: the fragment shader discards anything
 * outside it, on every axis and both sides. x and y always clip to the shown
 * window (cut ∩ window, so cells no longer spill past the frame); z clips only
 * on a side that is actually cut, so an uncut stack keeps the half slice the
 * loft adds above the top plane and below the bottom one.
 *
 * `clipKeeps` is the shader's test in JS (cell-mesh-clip.test.mjs).
 */
export type CubeCutUm = readonly [number, number, number, number, number, number];
export type ClipBox = {
  lo: [number, number, number];
  hi: [number, number, number];
  /** Sides that are real cuts (a slice plane is drawn there): x, y, z at lo, then at hi. */
  activeLo: [boolean, boolean, boolean];
  activeHi: [boolean, boolean, boolean];
};
export type Vec3 = readonly [number, number, number];

/** Far enough that no vertex reaches it; a side that is not cut. */
export const OPEN = 1e9;
/** Slack (µm) so a cut exactly on a slice plane keeps that plane's surface. */
export const CLIP_EPS_UM = 1e-3;

export function cellMeshClipBox(args: {
  /** The shown cut in µm, already clamped to the window and the stack (VolumeCube `shownCut`). */
  cut: CubeCutUm;
  /** The loaded stack's z range in µm; a z side at its bound is not cut. */
  stackZ: readonly [number, number];
  /** Mesh origin in µm (x, y, z), from the mesh header. */
  originUm: readonly [number, number, number];
  /** The window in µm; an x or y side at its edge is the window's, not a cut. Omitted: no x/y side is a cut. */
  window?: { x: readonly [number, number]; y: readonly [number, number] };
}): ClipBox {
  const { cut, stackZ, originUm: [ox, oy, oz], window: win } = args;
  const zCutLo = cut[4] > stackZ[0] + CLIP_EPS_UM;
  const zCutHi = cut[5] < stackZ[1] - CLIP_EPS_UM;
  return {
    lo: [cut[0] - ox, cut[2] - oy, zCutLo ? cut[4] - oz : -OPEN],
    hi: [cut[1] - ox, cut[3] - oy, zCutHi ? cut[5] - oz : OPEN],
    activeLo: [Boolean(win && cut[0] > win.x[0] + CLIP_EPS_UM), Boolean(win && cut[2] > win.y[0] + CLIP_EPS_UM), zCutLo],
    activeHi: [Boolean(win && cut[1] < win.x[1] - CLIP_EPS_UM), Boolean(win && cut[3] < win.y[1] - CLIP_EPS_UM), zCutHi],
  };
}

/**
 * Where the ray from `eye` to `p` enters the clip box: the axis and side of
 * that face, and whether it is a cut (an opaque slice plane sits there). The
 * mesh shader's `cellMeshBehindSlice` and the raycast's slice use this test.
 */
export function sliceEntry(eye: Vec3, p: Vec3, box: ClipBox): { axis: 0 | 1 | 2; side: "lo" | "hi"; t: number; active: boolean } | null {
  let tEnter = -Infinity;
  let tExit = Infinity;
  let axis: 0 | 1 | 2 = 0;
  for (const a of [0, 1, 2] as const) {
    const d = p[a] - eye[a];
    if (Math.abs(d) < 1e-12) {
      if (eye[a] < box.lo[a] || eye[a] > box.hi[a]) return null;
      continue;
    }
    const t0 = (box.lo[a] - eye[a]) / d;
    const t1 = (box.hi[a] - eye[a]) / d;
    const tn = Math.min(t0, t1);
    if (tn > tEnter) {
      tEnter = tn;
      axis = a;
    }
    tExit = Math.min(tExit, Math.max(t0, t1));
  }
  if (!(tEnter < tExit) || tEnter <= 0) return null;
  const side = p[axis] - eye[axis] > 0 ? "lo" : "hi";
  return { axis, side, t: tEnter, active: side === "lo" ? box.activeLo[axis] : box.activeHi[axis] };
}

/** The slice planes to draw, in window-relative µm: one per cut side. */
export function slicePlanes(box: ClipBox): { axis: 0 | 1 | 2; side: "lo" | "hi"; at: number }[] {
  const out: { axis: 0 | 1 | 2; side: "lo" | "hi"; at: number }[] = [];
  for (const a of [0, 1, 2] as const) {
    if (box.activeLo[a]) out.push({ axis: a, side: "lo", at: box.lo[a] });
    if (box.activeHi[a]) out.push({ axis: a, side: "hi", at: box.hi[a] });
  }
  return out;
}

export function clipKeeps(p: readonly [number, number, number], box: ClipBox): boolean {
  for (let a = 0; a < 3; a++) {
    if (p[a]! < box.lo[a]! - CLIP_EPS_UM || p[a]! > box.hi[a]! + CLIP_EPS_UM) return false;
  }
  return true;
}

/** Vertices of a mesh (xyz-packed, window-relative µm) the clip keeps. */
export function keptVertexCount(positions: ArrayLike<number>, box: ClipBox): number {
  let n = 0;
  for (let i = 0; i + 2 < positions.length; i += 3) {
    if (clipKeeps([positions[i]!, positions[i + 1]!, positions[i + 2]!], box)) n++;
  }
  return n;
}

/** Shader module: `clipKeeps` and `sliceEntry` in GLSL, the cut face tint and the surface inset. */
const BLOCK = `uniform cellMeshClipUniforms {
  vec3 lo;
  vec3 hi;
  vec3 activeLo;
  vec3 activeHi;
  vec3 eye;
  float capAlpha;
  float flipFacing;
  float shrink;
  float colourPass;
  float fresnelMin;
  float fresnelPow;
  float backFresnelMin;
} cellMeshClip;`;

export const cellMeshClipModule = {
  name: "cellMeshClip",
  uniformTypes: {
    lo: "vec3<f32>",
    hi: "vec3<f32>",
    activeLo: "vec3<f32>",
    activeHi: "vec3<f32>",
    eye: "vec3<f32>",
    capAlpha: "f32",
    flipFacing: "f32",
    shrink: "f32",
    colourPass: "f32",
    fresnelMin: "f32",
    fresnelPow: "f32",
    backFresnelMin: "f32",
  },
  defaultUniforms: {
    lo: [-OPEN, -OPEN, -OPEN],
    hi: [OPEN, OPEN, OPEN],
    activeLo: [0, 0, 0],
    activeHi: [0, 0, 0],
    eye: [0, 0, OPEN],
    capAlpha: 0.4,
    flipFacing: 0,
    shrink: 0,
    colourPass: 1,
    fresnelMin: 1,
    fresnelPow: 2,
    backFresnelMin: 1,
  },
  vs: BLOCK,
  fs: `${BLOCK}
bool cellMeshClipped(vec3 p) {
  return any(lessThan(p, cellMeshClip.lo - ${CLIP_EPS_UM.toExponential()})) || any(greaterThan(p, cellMeshClip.hi + ${CLIP_EPS_UM.toExponential()}));
}
// True when the eye's ray to p enters the clip box through a cut side: an opaque slice plane is in front of p.
bool cellMeshBehindSlice(vec3 p) {
  vec3 e = cellMeshClip.eye;
  vec3 d = p - e;
  vec3 safe = mix(d, vec3(1e-12), lessThan(abs(d), vec3(1e-12)));
  vec3 t0 = (cellMeshClip.lo - e) / safe;
  vec3 t1 = (cellMeshClip.hi - e) / safe;
  vec3 tn = min(t0, t1);
  int axis = tn.x >= tn.y && tn.x >= tn.z ? 0 : (tn.y >= tn.z ? 1 : 2);
  float tEnter = tn[axis];
  if (tEnter <= 0.0 || tEnter >= 1.0) return false;
  return d[axis] > 0.0 ? cellMeshClip.activeLo[axis] > 0.5 : cellMeshClip.activeHi[axis] > 0.5;
}`,
} as const;
