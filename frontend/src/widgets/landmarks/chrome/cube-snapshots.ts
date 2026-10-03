export const SNAPSHOT = { width: 64, height: 40 };
/**
 * After an entry's first snapshot, later settled renders replace it for this
 * long: the first settled frame can still carry the previous textures while
 * Viv uploads the new ones.
 */
export const SNAPSHOT_SETTLE_MS = 1000;

/** A history chip snapshot: the window it shows (`windowKey`), its data URL, and when it was first taken. */
export type ChipSnapshot = { key: string; url: string; at: number };

/** The window a snapshot shows. A snapshot under another key (moved entry, reused id) is stale. */
export function windowKey(w: { cx: number; cy: number; size_um: number }): string {
  return `${w.cx},${w.cy},${w.size_um}`;
}

/** Draw `canvas` into a 64×40 WebP, cropped to cover. */
export function snapshotOf(canvas: HTMLCanvasElement): string | null {
  const { width: sw, height: sh } = canvas;
  if (!sw || !sh) return null;
  const out = document.createElement("canvas");
  out.width = SNAPSHOT.width;
  out.height = SNAPSHOT.height;
  const ctx = out.getContext("2d");
  if (!ctx) return null;
  const aspect = SNAPSHOT.width / SNAPSHOT.height;
  const w = Math.min(sw, sh * aspect);
  const h = w / aspect;
  ctx.drawImage(canvas, (sw - w) / 2, (sh - h) / 2, w, h, 0, 0, SNAPSHOT.width, SNAPSHOT.height);
  return out.toDataURL("image/webp", 0.7);
}
