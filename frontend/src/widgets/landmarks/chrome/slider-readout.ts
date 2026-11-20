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

/** A 1-2-5 step near span/200, so a readout stays a short decimal. */
export function decimalStep(span: number): number {
  if (!Number.isFinite(span) || span <= 0) return 0.01;
  const raw = span / 200;
  const exp = Math.floor(Math.log10(raw));
  const base = 10 ** exp;
  const n = raw / base;
  const mult = n >= 5 ? 5 : n >= 2 ? 2 : 1;
  return Number((mult * base).toPrecision(12));
}

/** Display text for a slider value at the precision of its step. */
export function formatSliderReadout(value: number, step: number): string {
  if (!Number.isFinite(value)) return "";
  const digits = sliderStepDigits(step);
  const text = value.toFixed(digits);
  return Number(text) === 0 ? (0).toFixed(digits) : text;
}
