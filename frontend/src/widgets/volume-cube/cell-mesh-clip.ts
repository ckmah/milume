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
export type ClipBox = { lo: [number, number, number]; hi: [number, number, number] };

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
}): ClipBox {
  const { cut, stackZ, originUm: [ox, oy, oz] } = args;
  const zCutLo = cut[4] > stackZ[0] + CLIP_EPS_UM;
  const zCutHi = cut[5] < stackZ[1] - CLIP_EPS_UM;
  return {
    lo: [cut[0] - ox, cut[2] - oy, zCutLo ? cut[4] - oz : -OPEN],
    hi: [cut[1] - ox, cut[3] - oy, zCutHi ? cut[5] - oz : OPEN],
  };
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

/** Shader module: the same test as `clipKeeps`, plus the cut-face (back face) tint alpha. */
export const cellMeshClipModule = {
  name: "cellMeshClip",
  uniformTypes: { lo: "vec3<f32>", hi: "vec3<f32>", capAlpha: "f32", flipFacing: "f32" },
  defaultUniforms: { lo: [-OPEN, -OPEN, -OPEN], hi: [OPEN, OPEN, OPEN], capAlpha: 0.4, flipFacing: 0 },
  fs: `uniform cellMeshClipUniforms { vec3 lo; vec3 hi; float capAlpha; float flipFacing; } cellMeshClip;
bool cellMeshClipped(vec3 p) {
  return any(lessThan(p, cellMeshClip.lo - ${CLIP_EPS_UM.toExponential()})) || any(greaterThan(p, cellMeshClip.hi + ${CLIP_EPS_UM.toExponential()}));
}`,
} as const;
