import { formatSliderReadout } from "./slider-readout";

/** Layers diameter slider when a micrometre scale is known. */
export const DIAMETER_UM_MIN = 1;
export const DIAMETER_UM_MAX = 50;
export const DIAMETER_UM_STEP = 0.5;

export type CellSizeControl = {
  unit: "µm" | "px";
  caption: string;
  min: number;
  max: number;
  step: number;
  value: number;
  readout: string;
  toPointSize: (slider: number) => number;
};

/** Positive micrometres per data unit, or null when the map stays in raw units. */
export function knownUmPerUnit(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null;
  return value;
}

/** Today's raw-unit slider span, from the tissue width. */
export function pointSizeRange(
  bounds: number[] | undefined,
  pointSize: number,
): { min: number; max: number } {
  const x0 = bounds?.[0] ?? 0;
  const x1 = bounds?.[1] ?? 100;
  const span = Math.max(x1 - x0, 1);
  const base = pointSize || span * 0.04;
  return { min: Math.max(0.5, span * 0.005), max: Math.max(base * 4, span * 0.15) };
}

/**
 * Slider over dot diameter in µm, or over the raw radius when no scale is known.
 * `point_size` is always the radius in data units.
 */
export function cellSizeControl(
  pointSize: number,
  umPerUnit: number | null,
  bounds: number[] | undefined,
): CellSizeControl {
  if (umPerUnit != null) {
    const diameter = pointSize * 2 * umPerUnit;
    const value = Math.min(DIAMETER_UM_MAX, Math.max(DIAMETER_UM_MIN, diameter));
    return {
      unit: "µm",
      caption: "Diameter",
      min: DIAMETER_UM_MIN,
      max: DIAMETER_UM_MAX,
      step: DIAMETER_UM_STEP,
      value,
      readout: `${formatSliderReadout(value, DIAMETER_UM_STEP)} µm`,
      toPointSize: (slider) => slider / 2 / umPerUnit,
    };
  }
  const range = pointSizeRange(bounds, pointSize);
  const step = 0.25;
  return {
    unit: "px",
    caption: "Size",
    min: range.min,
    max: range.max,
    step,
    value: Math.max(range.min, pointSize),
    readout: `${formatSliderReadout(pointSize, step)} px`,
    toPointSize: (slider) => slider,
  };
}
