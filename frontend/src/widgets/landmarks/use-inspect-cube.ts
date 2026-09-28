import { useCallback, useEffect, useRef } from "react";

import type { CubeCut } from "@/widgets/volume-cube/VolumeCube";

import {
  type CutWindow,
  OPEN_CUT,
  committedCut,
  cutWindow,
  shownCut,
  toRelativeCut,
} from "./cube-cut";
import type { EngineHandle } from "./engine";
import type { AnyModel } from "./helpers";
import { type CubeSettings, type CubeSettingsPatch, useCubeSettings } from "./use-cube-settings";
import type { LandmarksModel } from "./use-landmarks-model";

type Range = [number, number];

const DEFAULT_CONTRAST: Range = [0, 255];
const NO_ORIGIN: [number, number, number] = [0, 0, 0];
/** Commit the cut once the window has stopped moving for this long. */
const SETTLE_MS = 250;

export type InspectCube = {
  hasVolume: boolean;
  cube: CubeSettings;
  patchCube: (p: CubeSettingsPatch) => void;
  /** The cut the cube draws and the sliders show (absolute, inside the window). */
  cut: CubeCut;
  /** Slider ranges once the volume is open: the clamped window and the stack. */
  cutRanges: { x: Range; y: Range; z: Range } | null;
  onCutLive: (cut: CubeCut) => void;
  onCutCommit: (cut: CubeCut) => void;
  /** Esc anywhere in the widget closes the cube while in Inspect. */
  onKeyDown: (e: React.KeyboardEvent) => void;
};

/**
 * The Inspect cube's state and its sync with the engine and `volume_cut`.
 *
 * The X/Y cut is kept relative to the inspect window, so moving the window
 * never needs a write to stay correct. `volume_cut` (absolute µm) is written on
 * slider release, and once after the user moves the window (when it settles);
 * never in answer to Python's own `volume_cut` or inspect writes.
 */
export function useInspectCube(facade: AnyModel, lm: LandmarksModel, engine: EngineHandle | null): InspectCube {
  const hasVolume = Boolean(lm.volume?.image_url);
  const volumeCut = lm.volume_cut?.length === 6 ? (lm.volume_cut as CubeCut) : null;
  const [cube, patchCube] = useCubeSettings(
    lm.volume?.contrast_limits ?? DEFAULT_CONTRAST,
    volumeCut ? { ...OPEN_CUT, z: [volumeCut[4], volumeCut[5]] } : OPEN_CUT,
  );

  // Set by user placements (engine events), consumed by the settle commit.
  const placedRef = useRef(false);
  useEffect(() => {
    if (!engine || !hasVolume) return;
    return engine.subscribeInspect((e) => {
      if (e.type === "place") placedRef.current = true;
      patchCube({ open: e.type === "place" });
    });
  }, [engine, hasVolume, patchCube]);
  useEffect(() => {
    engine?.setInspectWindowVisible(cube.open);
    // A reopened cube reloads; its cut ranges wait for the new bounds.
    if (!cube.open) patchCube({ bounds: null });
  }, [engine, cube.open, patchCube]);

  const bounds = cube.bounds;
  const origin = lm.volume?.origin_um ?? NO_ORIGIN;
  const volume = bounds ? { x: bounds.volumeX, y: bounds.volumeY, z: bounds.stackZ } : null;
  const win: CutWindow | null =
    lm.inspect_cx == null || lm.inspect_cy == null
      ? null
      : cutWindow(lm.inspect_cx, lm.inspect_cy, lm.inspect_size_um || 100, { x: origin[2], y: origin[1] }, volume);
  const cut: CubeCut = win
    ? shownCut(cube.cut, win, volume?.z ?? null)
    : [-Infinity, Infinity, -Infinity, Infinity, cube.cut.z[0], cube.cut.z[1]];
  const cutRanges = win && volume ? { x: win.x, y: win.y, z: volume.z } : null;

  const latest = useRef({ rel: cube.cut, win, volume });
  latest.current = { rel: cube.cut, win, volume };

  // The last value this widget wrote, so its echo is not adopted as Python's.
  const writtenRef = useRef<string | null>(null);
  const write = useCallback(
    (next: CubeCut) => {
      const key = next.join(",");
      const current = facade.get("volume_cut");
      if (Array.isArray(current) && current.join(",") === key) return;
      writtenRef.current = key;
      facade.set("volume_cut", next);
      facade.save_changes();
    },
    [facade],
  );

  // Python's cut (on load or set later) is adopted against the window; X/Y wait
  // for the volume extent, which decides whether an edge is open.
  const volumeCutKey = volumeCut?.join(",") ?? "";
  const pendingRef = useRef<CubeCut | "open" | null>(volumeCut ?? "open");
  useEffect(() => {
    if (volumeCutKey === writtenRef.current) writtenRef.current = null;
    else pendingRef.current = volumeCut ?? "open";
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [volumeCutKey]);
  useEffect(() => {
    const p = pendingRef.current;
    if (p == null) return;
    if (p === "open") {
      pendingRef.current = null;
      patchCube({ cut: OPEN_CUT });
    } else if (win && volume) {
      pendingRef.current = null;
      patchCube({ cut: toRelativeCut(p, win) });
    } else if (cube.cut.z[0] !== p[4] || cube.cut.z[1] !== p[5]) {
      patchCube({ cut: { ...cube.cut, z: [p[4], p[5]] } });
    }
  });

  // After the user moves the window, write the cut in its new place once.
  const winKey = win ? `${win.x.join(",")},${win.y.join(",")}` : "";
  useEffect(() => {
    if (!cube.open || !placedRef.current || !volume) return;
    const id = setTimeout(() => {
      const { rel, win: w, volume: v } = latest.current;
      if (!w || !v) return;
      placedRef.current = false;
      write(committedCut(rel, w, v));
    }, SETTLE_MS);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [winKey, cube.open, Boolean(volume), write]);

  const onCutLive = useCallback(
    (next: CubeCut) => {
      const w = latest.current.win;
      if (w) patchCube({ cut: toRelativeCut(next, w) });
    },
    [patchCube],
  );
  const onCutCommit = useCallback(
    (next: CubeCut) => {
      const { win: w, volume: v } = latest.current;
      if (!w || !v) return;
      const rel = toRelativeCut(next, w);
      patchCube({ cut: rel });
      write(committedCut(rel, w, v));
    },
    [patchCube, write],
  );

  const mode = lm.mode;
  const open = cube.open;
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key !== "Escape" || mode !== "inspect" || !open) return;
      // Esc in an open menu only closes the menu.
      if ((e.target as Element | null)?.closest?.('[role="menu"]')) return;
      patchCube({ open: false });
    },
    [mode, open, patchCube],
  );

  return { hasVolume, cube, patchCube, cut, cutRanges, onCutLive, onCutCommit, onKeyDown };
}
