/** Landmark stroke accents (dedicated; not the categorical point palette). */
export const LANDMARK_COLORS = [
  "#00e5ff",
  "#ff2d95",
  "#b8ff00",
  "#ffb000",
  "#7c4dff",
  "#00ffa3",
];

/** Stable fallback color from landmark id (not list index). */
export function landmarkStableColor(id, fallbackIndex = 0) {
  const s = String(id || "");
  if (!s) return LANDMARK_COLORS[fallbackIndex % LANDMARK_COLORS.length];
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return LANDMARK_COLORS[Math.abs(h) % LANDMARK_COLORS.length];
}

/** Landmark accent: explicit `color` on the model, else stable id hash. */
export function landmarkColor(lm, fallbackIndex = 0) {
  if (lm && typeof lm.color === "string" && lm.color) return lm.color;
  const id = lm?.id ?? "";
  return landmarkStableColor(id, fallbackIndex);
}
