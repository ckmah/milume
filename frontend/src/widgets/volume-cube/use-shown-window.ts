import { useEffect, useRef, useState } from "react";

import type { ChunkCache } from "./chunk-cache";
import { type Box, type Frame, type Level, type ZarrSource, WindowPixelSource, boxIsEmpty } from "./window-source";

/** A voxel box of one level to load, with the labels level on the same grid (if wanted). */
export type WindowTarget = { level: Level; box: Box; cells: ZarrSource | null };

/** The window whose voxels have arrived: the only one Viv is ever handed. */
export type ShownWindow = {
  level: Level;
  box: Box;
  image: WindowPixelSource;
  cells: WindowPixelSource | null;
};

export function levelVoxelSize(frame: Frame, level: Level): [number, number, number] {
  const [sz, sy, sx] = frame.voxelSize;
  return [sz * level.factor[0], sy * level.factor[1], sx * level.factor[2]];
}

function boxValues(b: Box): number[] {
  return [b.z0, b.z1, b.y0, b.y1, b.x0, b.x1];
}

export function targetKey(t: WindowTarget | null): string {
  return t ? `${t.level.index}:${boxValues(t.box).join(",")}:${t.cells ? 1 : 0}` : "";
}

/** Whether two boxes share any level-0 voxels in Y and X (Z is always the full stack). */
function overlaps(a: { level: Level; box: Box }, b: { level: Level; box: Box }): boolean {
  const span = (t: { level: Level; box: Box }) => {
    const [, fy, fx] = t.level.factor;
    return { y0: t.box.y0 * fy, y1: t.box.y1 * fy, x0: t.box.x0 * fx, x1: t.box.x1 * fx };
  };
  const p = span(a);
  const q = span(b);
  return p.x0 < q.x1 && q.x0 < p.x1 && p.y0 < q.y1 && q.y0 < p.y1;
}

function sameWindow(a: { level: Level; box: Box }, b: { level: Level; box: Box }): boolean {
  return a.level.source === b.level.source && boxValues(a.box).join(",") === boxValues(b.box).join(",");
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Fetch `t` completely (image, and labels when wanted) before it is shown. The
 * image source of `prev` is reused when the window is the same, so turning
 * labels on only fetches the labels. A labels failure falls back to the image
 * alone; an image failure rejects.
 */
async function loadWindow(
  t: WindowTarget,
  prev: ShownWindow | null,
  frame: Frame,
): Promise<{ shown: ShownWindow; cellsError: string }> {
  const voxel = levelVoxelSize(frame, t.level);
  const same = prev && sameWindow(prev, t) ? prev : null;
  const image = same ? same.image : new WindowPixelSource(t.level.source, t.box, voxel);
  const cells = t.cells ? (same?.cells ?? new WindowPixelSource(t.cells, t.box, voxel)) : null;
  const [img, lab] = await Promise.allSettled([image.fetchBlock({}), cells ? cells.fetchBlock({}) : null]);
  if (img.status === "rejected") throw img.reason;
  const cellsError = lab.status === "rejected" ? errorText(lab.reason) : "";
  return { shown: { level: t.level, box: t.box, image, cells: cellsError ? null : cells }, cellsError };
}

/**
 * Prefetch-then-swap for the cube: the target window (from props) is fetched in
 * full before it replaces the shown one, so Viv never waits on the network and
 * never blanks. With `coarse`, a target that the shown window does not overlap
 * (or the first one) is preceded by the coarse window, shown while the fine
 * level loads.
 */
export function useShownWindow({
  levels,
  frame,
  fine,
  coarse,
  chunkCache,
  pausesPrefetch,
}: {
  /** The image pyramid; a new one drops the shown window. */
  levels: Level[] | null;
  frame: Frame;
  fine: WindowTarget | null;
  coarse: WindowTarget | null;
  chunkCache: ChunkCache | null;
  pausesPrefetch: boolean;
}): { shown: ShownWindow | null; imageError: string; cellsError: string } {
  const [state, setState] = useState<{ levels: Level[] | null; shown: ShownWindow | null }>({
    levels: null,
    shown: null,
  });
  const shown = state.levels === levels ? state.shown : null;
  const [failure, setFailure] = useState<{ key: string; image: string; cells: string } | null>(null);

  const key = targetKey(fine);
  const latest = useRef({ fine, coarse, frame, shown, chunkCache, pausesPrefetch });
  latest.current = { fine, coarse, frame, shown, chunkCache, pausesPrefetch };

  useEffect(() => {
    const { fine: t, coarse: c, frame: f, shown: prev, chunkCache: cache, pausesPrefetch: pauses } = latest.current;
    if (!t) return;
    if (boxIsEmpty(t.box)) {
      setState({ levels, shown: null });
      return;
    }
    let live = true;
    // A retry of the same window starts clean.
    setFailure((prevFailure) => (prevFailure && prevFailure.key === key ? null : prevFailure));
    const paused = pauses ? cache : null;
    paused?.pause();
    const steps: WindowTarget[] = [];
    if (c && c.level.index > t.level.index && !boxIsEmpty(c.box) && (!prev || !overlaps(prev, t))) steps.push(c);
    steps.push(t);
    (async () => {
      let base = prev;
      for (const step of steps) {
        const isFine = step === t;
        try {
          const loaded = await loadWindow(step, base, f);
          if (!live) return;
          base = loaded.shown;
          setState({ levels, shown: loaded.shown });
          if (isFine) setFailure(loaded.cellsError ? { key, image: "", cells: loaded.cellsError } : null);
        } catch (err) {
          if (!live) return;
          // A failed coarse step goes on to the fine one; a failed fine one keeps what is shown.
          if (isFine) setFailure({ key, image: errorText(err), cells: "" });
        }
      }
    })().finally(() => {
      if (live) paused?.resume();
    });
    return () => {
      live = false;
      paused?.resume();
    };
  }, [key, levels]);

  const current = failure && failure.key === key ? failure : null;
  return { shown, imageError: current?.image ?? "", cellsError: current?.cells ?? "" };
}
