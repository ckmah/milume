const MAX_STEP_DIGITS = 10;

function sliderStepDigits(step: number): number {
  if (!Number.isFinite(step) || step === 0) return 0;
  const abs = Math.abs(step);
  for (let digits = 0; digits <= MAX_STEP_DIGITS; digits++) {
    const scaled = abs * 10 ** digits;
    const nearest = Math.round(scaled);
    if (nearest === 0) continue;
    if (Math.abs(scaled - nearest) / nearest <= 1e-8) return digits;
  }
  return MAX_STEP_DIGITS;
}

/** Display text for a slider value at the precision of its step. */
export function formatSliderReadout(value: number, step: number): string {
  if (!Number.isFinite(value)) return "";
  const digits = sliderStepDigits(step);
  const text = value.toFixed(digits);
  return Number(text) === 0 ? (0).toFixed(digits) : text;
}
