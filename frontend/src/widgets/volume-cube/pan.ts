import { cameraDirection } from "./axis-legend";

/** Below this the data XY plane is seen edge-on and y cannot follow the pointer. */
const MIN_DET = 0.1;

/**
 * How far the window centre moves (data µm, +x right on the map, +y down) for a
 * pointer drag of (dx, dy) screen px (+dy down), so the tissue follows the pointer.
 * `view` is the camera; `umPerWorldUnit` is the shown level's X voxel (µm).
 *
 * Data +x is world [1, 0, 0] and data +y world [0, 0, 1] (see axis-legend.tsx).
 * A data displacement (a, b) world units moves content on screen by
 * right = s·(a·exx + b·eyx), up = s·(a·exy + b·eyy), with s = 2^zoom px per world
 * unit at the target. Solve for the content to follow the pointer and move the
 * window the opposite way.
 */
export function dragToWindowDelta(
  dx: number,
  dy: number,
  view: { zoom: number; rotationX: number; rotationOrbit: number },
  umPerWorldUnit: number,
): { x: number; y: number } {
  const s = 2 ** view.zoom;
  const [exx, exy] = cameraDirection([1, 0, 0], view.rotationX, view.rotationOrbit);
  const [eyx, eyy] = cameraDirection([0, 0, 1], view.rotationX, view.rotationOrbit);
  const right = dx;
  const up = -dy;
  const det = exx * eyy - eyx * exy;
  let a: number;
  let b: number;
  if (Math.abs(det) >= MIN_DET) {
    a = (right * eyy - up * eyx) / (s * det);
    b = (up * exx - right * exy) / (s * det);
  } else {
    // Edge-on (side view): data y points at the viewer; only x can follow the pointer.
    a = Math.abs(exx) > MIN_DET ? right / (s * exx) : 0;
    b = 0;
  }
  return { x: -a * umPerWorldUnit, y: -b * umPerWorldUnit };
}
