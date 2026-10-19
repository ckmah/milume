import { useEffect, useRef, useState } from "react";

import type { ChunkCache } from "./chunk-cache";
import {
  type Box,
  type Frame,
  type Level,
  WindowPixelSource,
  boxIsEmpty,
} from "./window-source";

/** A voxel box of one level to load. */
export type WindowTarget = { level: Level; box: Box };

/** The window whose voxels have arrived: the only one Viv is ever handed. */
export type ShownWindow = {
  level: Level;
  box: Box;
  image: WindowPixelSource;
};

export function levelVoxelSize(frame: Frame, level: Level): [number, number, number] {
  const [sz, sy, sx] = frame.voxelSize;
  return [sz * level.factor[0], sy * level.factor[1], sx * level.factor[2]];
}

function boxValues(b: Box): number[] {
  return [b.z0, b.z1, b.y0, b.y1, b.x0, b.x1];
}

export function targetKey(t: WindowTarget | null): string {
  return t ? `${t.level.index}:${boxValues(t.box).join(",")}` : "";
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

/** Fetch `t` completely before it is shown; the image source of `prev` is reused when the window is the same. */
async function loadWindow(t: WindowTarget, prev: ShownWindow | null, frame: Frame): Promise<ShownWindow> {
  if (prev && sameWindow(prev, t)) return prev;
  const image = new WindowPixelSource(t.level.source, t.box, levelVoxelSize(frame, t.level));
  await image.fetchBlock({});
  return { level: t.level, box: t.box, image };
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
}): {
  shown: ShownWindow | null;
  /** The shown window is the coarse step's, not a fine target's. */
  shownIsCoarse: boolean;
  imageError: string;
} {
  const [state, setState] = useState<{ levels: Level[] | null; shown: ShownWindow | null; coarse: boolean }>({
    levels: null,
    shown: null,
    coarse: false,
  });
  const shown = state.levels === levels ? state.shown : null;
  const shownIsCoarse = Boolean(shown) && state.coarse;
  const [failure, setFailure] = useState<{ key: string; image: string } | null>(null);

  const key = targetKey(fine);
  const latest = useRef({ fine, coarse, frame, shown, chunkCache, pausesPrefetch });
  latest.current = { fine, coarse, frame, shown, chunkCache, pausesPrefetch };

  useEffect(() => {
    const { fine: t, coarse: c, frame: f, shown: prev, chunkCache: cache, pausesPrefetch: pauses } = latest.current;
    if (!t) return;
    if (boxIsEmpty(t.box)) {
      setState({ levels, shown: null, coarse: false });
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
          base = loaded;
          setState({ levels, shown: loaded, coarse: !isFine });
          if (isFine) setFailure(null);
        } catch (err) {
          if (!live) return;
          // A failed coarse step goes on to the fine one; a failed fine one keeps what is shown.
          if (isFine) setFailure({ key, image: errorText(err) });
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
  return { shown, shownIsCoarse, imageError: current?.image ?? "" };
}
