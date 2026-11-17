export const LOGICAL_W = 1600;
export const LOGICAL_H = 900;

/** Designer reference loop (seconds). */
export const LOOP_SEC = 10;

export const SPEED = 0.45;
export const PERIOD_Z = SPEED * LOOP_SEC;

export const HERO_POINT_COUNT = 650;
export const HERO_TILE_COUNT = 3;

export const FIELD_X_EXTENT = 5.2;
export const FIELD_Y_EXTENT = 3.0;

export const HERO_RNG_SEED = 20261010;

export const FOCUS = 3.6;
export const FOV = 1.1;

export const TILT_Y = (40 * Math.PI) / 180;
export const TILT_X = (8 * Math.PI) / 180;

export const SCHEIMPFLUG_BAND = 0.7;
export const SCHEIMPFLUG_BLUR = 55;

export const DEPTH_NEAR_CULL = 0.15;
export const DEPTH_FAR_CULL = 12;

export const REDUCED_MOTION_TIME = 1.5;

/** Focal length in logical pixels (reference: `(H/2) / tan(FOV/2)`). */
export function focalLengthPx(): number {
  return LOGICAL_H / 2 / Math.tan(FOV / 2);
}
