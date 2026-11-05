/**
 * Orbit screen projection for issue395 e2e (math.gl only — safe in Playwright Node bundle).
 */
import { Matrix4, Vector3 } from "@math.gl/core";
import { fovyToAltitude, worldToPixels } from "@math.gl/web-mercator";

export const ISSUE395_CUBE_FOVY = 50;

const DEGREES_TO_RADIANS = Math.PI / 180;
const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

/** `Z_UP` (rotateX -90°): pre-model [x, y, z] becomes [x, z, -y]. */
export function postModel([x, y, z]: [number, number, number]): [number, number, number] {
  return [x, z, -y];
}

export type Range = [number, number];

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

export function preY(dataFraction: number, span: number): number {
  return (1 - dataFraction) * span;
}

type Camera = { zoom: number; rotationX: number; rotationOrbit: number };

/** Deck OrbitViewport (orbitAxis Y, fovy 50) pixel projection matrix. */
function deckOrbitPixelProjectionMatrix(
  view: Camera,
  target: readonly number[],
  rect: { width: number; height: number },
): number[] {
  const height = rect.height || 1;
  const width = rect.width || 1;
  const focalDistance = fovyToAltitude(ISSUE395_CUBE_FOVY);
  const up: [number, number, number] = [0, 1, 0];
  const eye: [number, number, number] = [0, 0, focalDistance];
  const viewMatrixUncentered = new Matrix4().lookAt({ eye, up });
  viewMatrixUncentered.rotateX(view.rotationX * DEGREES_TO_RADIANS);
  viewMatrixUncentered.rotateY(view.rotationOrbit * DEGREES_TO_RADIANS);
  const projectionScale = 2 ** view.zoom / height;
  viewMatrixUncentered.scale(projectionScale);

  const center = new Vector3(target as [number, number, number]);
  const viewMatrix = new Matrix4()
    .multiplyRight(viewMatrixUncentered)
    .translate(center.clone().negate());

  const aspect = width / height;
  const projectionMatrix = new Matrix4().perspective({
    fovy: ISSUE395_CUBE_FOVY * DEGREES_TO_RADIANS,
    aspect,
    near: 0.1,
    far: 1000,
  });

  const viewProjectionMatrix = new Matrix4().multiplyRight(projectionMatrix).multiplyRight(viewMatrix);

  const viewportMatrix = new Matrix4()
    .scale([width / 2, -height / 2, 1])
    .translate([1, -1, 0]);

  return viewportMatrix.clone().multiplyRight(viewProjectionMatrix).toArray();
}

/** Screen position (top-left origin) for a point in pre-model units. */
export function projectPreModelToViewPixel(
  pre: [number, number, number],
  view: Camera,
  target: readonly number[],
  rect: { width: number; height: number },
): { x: number; y: number } {
  const world = postModel(pre);
  const pixelProjectionMatrix = deckOrbitPixelProjectionMatrix(view, target, rect);
  void IDENTITY;
  const [x, y] = worldToPixels(world, pixelProjectionMatrix);
  return { x, y };
}
