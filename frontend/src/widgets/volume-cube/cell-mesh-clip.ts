/**
 * The cut as a box in the meshes' window-relative µm. x and y always clip to the shown
 * cut (within the window, so cells never spill past the frame); z clips only on a side
 * that is cut, so an uncut stack keeps the half step the loft adds past its end slices.
 */
export type ClipBox = { lo: [number, number, number]; hi: [number, number, number] };

const OPEN = 1e9;
/** Slack (µm) so a cut exactly on a slice plane keeps that plane's surface. */
const CLIP_EPS_UM = 1e-3;

/** `cut`: x0, x1, y0, y1, z0, z1 in µm, already clamped to the window and the stack. */
export function cellMeshClipBox(
  cut: readonly [number, number, number, number, number, number],
  stackZ: readonly [number, number],
  [ox, oy, oz]: readonly [number, number, number],
): ClipBox {
  return {
    lo: [cut[0] - ox, cut[2] - oy, cut[4] > stackZ[0] + CLIP_EPS_UM ? cut[4] - oz : -OPEN],
    hi: [cut[1] - ox, cut[3] - oy, cut[5] < stackZ[1] - CLIP_EPS_UM ? cut[5] - oz : OPEN],
  };
}

const BLOCK = `uniform cellMeshClipUniforms {
  vec3 lo;
  vec3 hi;
  float flipFacing;
  float frontMin;
  float backMin;
} cellMeshClip;`;

export const cellMeshClipModule = {
  name: "cellMeshClip",
  uniformTypes: { lo: "vec3<f32>", hi: "vec3<f32>", flipFacing: "f32", frontMin: "f32", backMin: "f32" },
  defaultUniforms: { lo: [-OPEN, -OPEN, -OPEN], hi: [OPEN, OPEN, OPEN], flipFacing: 0, frontMin: 1, backMin: 1 },
  vs: BLOCK,
  fs: `${BLOCK}
bool cellMeshClipped(vec3 p) {
  return any(lessThan(p, cellMeshClip.lo - ${CLIP_EPS_UM.toExponential()})) || any(greaterThan(p, cellMeshClip.hi + ${CLIP_EPS_UM.toExponential()}));
}`,
} as const;
