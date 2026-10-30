/** Label mesh count must hold steady this long before `data-settled` turns true. */
export const CUBE_LABEL_CELLS_SETTLE_MS = 600;

/** True when `.volume-cube__view` has finished settling (matches `data-settled="true"`). */
export function cubeViewSettled(el: Element | null | undefined): boolean {
  return el?.getAttribute("data-settled") === "true";
}

/**
 * Playwright-style wait predicate: refining done, not panning, labels loaded when
 * required, and label-cell count stable (see `measure-cube-idle-383.mjs`).
 */
export function waitForCubeSettledAttrs(attrs: {
  refining: string | null;
  panning: string | null;
  labels: string | null;
  labelCells: number;
  settled?: string | null;
}): boolean {
  if (attrs.settled === "true") return true;
  if (attrs.refining !== "false") return false;
  if (attrs.panning === "true") return false;
  if (attrs.labels === "loading") return false;
  if (attrs.labels === "on" && attrs.labelCells <= 0) return false;
  return false;
}
