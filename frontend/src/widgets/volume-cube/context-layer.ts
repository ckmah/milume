import type { Matrix4 } from "@math.gl/core";

import type { Box, Level } from "./window-source";

/** The context region loaded around the window (cube views only): its side as `scale` × the window, within `budget` voxels. */
export type ContextProp = { scale: number; budget: number };

type Placed = { level: Level; box: Box };

/** Where the context volume sits in the window layer's world (window-level X-voxel units). */
export function contextMatrix({
  base,
  ctx,
  win,
  ry,
}: {
  base: Matrix4;
  ctx: Placed;
  win: Placed;
  ry: number;
}): Matrix4 {
  const [, cfy, cfx] = ctx.level.factor;
  const [, wfy, wfx] = win.level.factor;
  const s = cfx / wfx;
  const dx = (ctx.box.x0 * cfx) / wfx - win.box.x0;
  const dyRows = win.box.y1 - (ctx.box.y1 * cfy) / wfy;
  return base.clone().translate([dx, dyRows * ry, 0]).scale(s);
}

/** The window's footprint in the context volume's 0-1 texture coordinates: [x0, x1, y0, y1] (y runs reversed, as the texture's rows do). */
export function windowRectInContext({ ctx, win }: { ctx: Placed; win: Placed }): [number, number, number, number] {
  const [, cfy, cfx] = ctx.level.factor;
  const [, wfy, wfx] = win.level.factor;
  const cw = ctx.box.x1 - ctx.box.x0;
  const ch = ctx.box.y1 - ctx.box.y0;
  const a = (win.box.x0 * wfx) / cfx - ctx.box.x0;
  const w = ((win.box.x1 - win.box.x0) * wfx) / cfx;
  const b = (win.box.y0 * wfy) / cfy - ctx.box.y0;
  const h = ((win.box.y1 - win.box.y0) * wfy) / cfy;
  return [a / cw, (a + w) / cw, (ch - (b + h)) / ch, (ch - b) / ch];
}
