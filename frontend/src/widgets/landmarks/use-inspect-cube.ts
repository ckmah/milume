import { useCallback, useEffect, useReducer, useRef } from "react";

import { DEFAULT_RENDER } from "@/widgets/volume-cube/palettes";
import type { CubeCut } from "@/widgets/volume-cube/VolumeCube";

import {
  type CutWindow,
  OPEN_CUT,
  committedCut,
  cutWindow,
  shownCut,
  toRelativeCut,
} from "./cube-cut";
import { type EngineHandle, INSPECT_WINDOW_UM } from "./engine";
import type { AnyModel, SelectionItem } from "./helpers";
import { type CubeSettings, type CubeSettingsPatch, useCubeSettings } from "./use-cube-settings";
import type { LandmarksModel } from "./use-landmarks-model";

type Range = [number, number];

/** A section of the Inspect toolbar's Adjust panel, for its Reset. */
export type AdjustSection = "image" | "labels" | "cuts";

/** An inspect Selection's window: centre and side (µm), and its cut (absolute µm, or `[]`). */
export type InspectWindow = { cx: number; cy: number; size_um: number; cut: number[] };

/** The entry's window when `sel` is an inspect Selection. */
export function inspectWindowOf(sel: SelectionItem | undefined): InspectWindow | null {
  if (!sel || sel.type !== "inspect") return null;
  const w = sel.window as InspectWindow | undefined;
  return w && typeof w.cx === "number" && typeof w.cy === "number" ? w : null;
}

/** The live window is already a saved inspect entry: nothing new to save. */
export function isWindowSaved(lm: LandmarksModel): boolean {
  return lm.selections.some((sel) => {
    const w = inspectWindowOf(sel);
    return w != null && w.cx === lm.inspect_cx && w.cy === lm.inspect_cy && w.size_um === lm.inspect_size_um;
  });
}

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
  /**
   * Esc in the widget's chrome while in Inspect (when the engine leaves it to
   * React): closes the cube, or with no cube open, exits Inspect.
   */
  onKeyDown: (e: React.KeyboardEvent) => void;
  /** Leave Inspect: close the cube and go back to the tool used before it. */
  exitInspect: () => void;
  /** Focus a saved inspect entry and restore its window and cut (a history chip). */
  focusEntry: (index: number) => void;
  /** Save the live window, with its cut, as an inspect Selection (the Inspect pill's Save). */
  save: () => void;
  /** Back to defaults: one Adjust section, or all of them. Open cuts are committed like a slider release. */
  resetAdjust: (section: AdjustSection | "all") => void;
  /**
   * Pan the live window by (dx, dy) µm, its centre clamped to the volume: moves
   * the map's square and `inspect_cx/cy` (saved at most every 40 ms); the cut
   * follows once the window settles, as after a drag on the map.
   */
  panWindow: (dxUm: number, dyUm: number) => void;
  /** The pan's release: save the final window. */
  panEnd: () => void;
};

/**
 * The Inspect cube's state and its sync with the engine and `volume_cut`.
 *
 * The X/Y cut is kept relative to the inspect window, so moving the window
 * never needs a write to stay correct. `volume_cut` (absolute µm) is written on
 * slider release, and once after the user moves the window (when it settles);
 * never in answer to Python's own `volume_cut` or inspect writes.
 *
 * Inspect Selections are the dock's history, saved from the live window (the
 * engine's `saveInspect`) as fixed snapshots: presses only move the live
 * window. Focusing one restores its window and cut and opens the dock; a
 * committed cut is also written into the focused entry while its window is
 * the live one; removing the last one closes the dock.
 */
export function useInspectCube(facade: AnyModel, lm: LandmarksModel, engine: EngineHandle | null): InspectCube {
  const hasVolume = Boolean(lm.volume?.image_url);
  const defaultContrast = lm.volume?.contrast_limits ?? DEFAULT_CONTRAST;
  const volumeCut = lm.volume_cut?.length === 6 ? (lm.volume_cut as CubeCut) : null;
  const [cube, patchCube] = useCubeSettings(
    defaultContrast,
    volumeCut ? { ...OPEN_CUT, z: [volumeCut[4], volumeCut[5]] } : OPEN_CUT,
  );

  // Leaving Inspect goes back to the tool used before it.
  const prevModeRef = useRef("select");
  useEffect(() => {
    if (lm.mode !== "inspect") prevModeRef.current = lm.mode;
  }, [lm.mode]);
  const setMode = lm.setMode;
  const exitInspect = useCallback(() => {
    patchCube({ open: false });
    setMode(prevModeRef.current === "inspect" ? "select" : prevModeRef.current);
  }, [setMode, patchCube]);

  // The last user placement (engine events), consumed by the settle commit.
  const placedRef = useRef<{ x: number; y: number } | null>(null);
  // The cube's open state as last rendered: an Esc closes an open cube, and
  // only a later Esc (after that render) exits Inspect.
  const openRef = useRef(cube.open);
  openRef.current = cube.open;
  const exitRef = useRef(exitInspect);
  exitRef.current = exitInspect;
  useEffect(() => {
    if (!engine) return;
    return engine.subscribeInspect((e) => {
      // Placements remember where the user put the window (for the settle commit);
      // the release (end of the click or drag) and saves open the cube. Esc
      // closes it; an Esc with no cube open (and no press to end) exits Inspect.
      if (e.type === "close") {
        if (openRef.current || e.press) patchCube({ open: false });
        else exitRef.current();
      } else if (!hasVolume) {
        return;
      } else if (e.type === "place") {
        placedRef.current = { x: e.x, y: e.y };
      } else if (e.type === "release" || e.type === "commit") {
        patchCube({ open: true });
      }
    });
  }, [engine, hasVolume, patchCube]);
  useEffect(() => {
    engine?.setInspectWindowVisible(cube.open);
    // A reopened cube reloads (Refining again); its cut ranges wait for the new
    // bounds. Move is a tool of the open cube only.
    if (!cube.open) patchCube({ move: false, bounds: null, load: "refining", loadError: "" });
  }, [engine, cube.open, patchCube]);

  const bounds = cube.bounds;
  const origin = lm.volume?.origin_um ?? NO_ORIGIN;
  const volume = bounds ? { x: bounds.volumeX, y: bounds.volumeY, z: bounds.stackZ } : null;
  const win: CutWindow | null =
    lm.inspect_cx == null || lm.inspect_cy == null
      ? null
      : cutWindow(lm.inspect_cx, lm.inspect_cy, lm.inspect_size_um || INSPECT_WINDOW_UM, { x: origin[2], y: origin[1] }, volume);
  const cut: CubeCut = win
    ? shownCut(cube.cut, win, volume?.z ?? null)
    : [-Infinity, Infinity, -Infinity, Infinity, cube.cut.z[0], cube.cut.z[1]];
  const cutRanges = win && volume ? { x: win.x, y: win.y, z: volume.z } : null;

  const cx = lm.inspect_cx;
  const cy = lm.inspect_cy;
  const volumeBounds = bounds ? { volumeX: bounds.volumeX, volumeY: bounds.volumeY } : null;
  const latest = useRef({ rel: cube.cut, win, volume, cx, cy, volumeBounds });
  latest.current = { rel: cube.cut, win, volume, cx, cy, volumeBounds };

  // The last value this widget wrote, so its echo is not adopted as Python's.
  const writtenRef = useRef<string | null>(null);
  // Each committed cut also goes into the focused inspect entry's `window.cut`,
  // in the same save, while that entry is the live window (a snapshot elsewhere
  // keeps its cut). Only that entry's `window` changes, never its members.
  const write = useCallback(
    (next: CubeCut) => {
      const key = next.join(",");
      const current = facade.get("volume_cut");
      const cutChanged = !(Array.isArray(current) && current.join(",") === key);
      const sels = (facade.get("selections") as SelectionItem[] | null) ?? [];
      const index = facade.get("selected_kind") === "selection" ? Number(facade.get("selected_index")) : -1;
      const entry = inspectWindowOf(sels[index]);
      const live =
        entry != null &&
        entry.cx === facade.get("inspect_cx") &&
        entry.cy === facade.get("inspect_cy") &&
        entry.size_um === facade.get("inspect_size_um");
      const entryChanged = live && (entry.cut ?? []).join(",") !== key;
      if (!cutChanged && !entryChanged) return;
      if (cutChanged) {
        writtenRef.current = key;
        facade.set("volume_cut", next);
      }
      if (entryChanged) {
        facade.set(
          "selections",
          sels.map((s, i) => (i === index ? { ...s, window: { ...entry, cut: [...next] } } : s)),
        );
      }
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

  // Focusing an inspect entry opens the dock and, when its window is not the
  // current one, restores it: the engine moves the square (no events), and the
  // entry's cut is adopted as a Python-set cut. Keyed on the entry and its
  // window, not `inspect_cx/cy`, so a press that moves the live window away
  // from the focused entry never snaps it back; after a save the entry equals
  // the window, so nothing happens. A chip click on the focused entry restores
  // it again (`restoreTick`).
  const [restoreTick, requestRestore] = useReducer((n: number) => n + 1, 0);
  const focused = lm.selected_kind === "selection" ? lm.selections[lm.selected_index] : undefined;
  const focusedWin = inspectWindowOf(focused);
  const focusedId = focusedWin ? String(focused?.id ?? "") : null;
  const focusedIdRef = useRef<string | null>(null);
  useEffect(() => {
    const newlyFocused = focusedId !== focusedIdRef.current;
    focusedIdRef.current = focusedId;
    if (!engine || !hasVolume || !focusedWin) return;
    const w = focusedWin;
    const moved = w.cx !== lm.inspect_cx || w.cy !== lm.inspect_cy || w.size_um !== lm.inspect_size_um;
    if (moved) {
      // Not a user placement: nothing to settle.
      placedRef.current = null;
      engine.setInspectWindow(w.cx, w.cy, w.size_um);
      if (w.cut?.length === 6) {
        const restored = [...w.cut] as CubeCut;
        // Adopted against the restored window even when `volume_cut` already holds it.
        pendingRef.current = restored;
        const current = facade.get("volume_cut");
        if (!(Array.isArray(current) && current.join(",") === restored.join(","))) {
          facade.set("volume_cut", restored);
          facade.save_changes();
        }
      }
    }
    if (moved || newlyFocused) patchCube({ open: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, hasVolume, focusedId, focusedWin?.cx, focusedWin?.cy, focusedWin?.size_um, restoreTick]);

  // The dock closes when the last inspect entry goes (deleted anywhere). Only on
  // that transition: a window with no inspect entries (e.g. set from Python)
  // stays open.
  const inspectCount = lm.selections.filter((s) => s.type === "inspect").length;
  const inspectCountRef = useRef(inspectCount);
  useEffect(() => {
    const before = inspectCountRef.current;
    inspectCountRef.current = inspectCount;
    if (before > 0 && inspectCount === 0) patchCube({ open: false });
  }, [inspectCount, patchCube]);

  // After the user moves the window, write the cut in its new place once. Only
  // while the window is where the user placed it: a move from Python (no
  // placement) cancels the pending write, so it never answers Python's write.
  const winKey = win ? `${win.x.join(",")},${win.y.join(",")}` : "";
  useEffect(() => {
    if (!cube.open || !volume || !atPlacement(placedRef.current, cx, cy)) return;
    const id = setTimeout(() => {
      const { rel, win: w, volume: v, cx: x, cy: y } = latest.current;
      if (!w || !v || !atPlacement(placedRef.current, x, y)) return;
      placedRef.current = null;
      write(committedCut(rel, w, v));
    }, SETTLE_MS);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [winKey, cx, cy, cube.open, Boolean(volume), write]);

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
  // The cube belongs to Inspect: it covers the map, so leaving Inspect closes it
  // (on the transition only; a later click in Inspect opens it again).
  const modeRef = useRef(mode);
  useEffect(() => {
    const was = modeRef.current;
    modeRef.current = mode;
    if (was === "inspect" && mode !== "inspect" && open) patchCube({ open: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, patchCube]);
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key !== "Escape" || mode !== "inspect") return;
      const target = e.target as Element | null;
      // Esc in an open menu, or the Adjust panel (which closes itself), only
      // closes that — never the cube.
      if (target?.closest?.('[role="menu"], [data-testid="context-cube-adjust-group"]')) return;
      // `open` is this render's value, so the Esc that closes the cube never
      // also exits Inspect. Esc in a text field only leaves the field.
      if (open) patchCube({ open: false });
      else if (!target?.closest?.('input, textarea, [contenteditable="true"], [role="combobox"]')) exitInspect();
    },
    [mode, open, patchCube, exitInspect],
  );

  const select = lm.select;
  const focusEntry = useCallback(
    (index: number) => {
      select("selection", index);
      requestRestore();
    },
    [select],
  );

  // Save stores `volume_cut`, which after a move is only written once the window
  // settles: write the live window's cut first, so the entry holds its own cut.
  // The window is read from the model, which the engine sets before any render.
  const save = useCallback(() => {
    if (!engine) return;
    const { rel, volume: v } = latest.current;
    const x = facade.get("inspect_cx") as number | null;
    const y = facade.get("inspect_cy") as number | null;
    if (x == null || y == null) return;
    const size = (facade.get("inspect_size_um") as number) || INSPECT_WINDOW_UM;
    // The engine's own window can be stale here (e.g. Python moved inspect_cx/cy
    // directly, with no press and no setInspectWindow call): sync it to the
    // model's values first, so the saved entry always equals what the dock shows.
    engine.setInspectWindow(x, y, size);
    if (v && atPlacement(placedRef.current, x, y)) {
      placedRef.current = null;
      write(committedCut(rel, cutWindow(x, y, size, { x: origin[2], y: origin[1] }, v), v));
    }
    engine.saveInspect();
  }, [engine, facade, write, origin]);

  const panSavedAt = useRef(0);
  const panWindow = useCallback(
    (dxUm: number, dyUm: number) => {
      if (!engine) return;
      const x0 = facade.get("inspect_cx") as number | null;
      const y0 = facade.get("inspect_cy") as number | null;
      if (x0 == null || y0 == null) return;
      const b = latest.current.volumeBounds;
      const clamp = (v: number, [lo, hi]: Range) => Math.max(lo, Math.min(hi, v));
      const nx = b ? clamp(x0 + dxUm, b.volumeX) : x0 + dxUm;
      const ny = b ? clamp(y0 + dyUm, b.volumeY) : y0 + dyUm;
      if (nx === x0 && ny === y0) return;
      // A pan is a user placement: the settle commit then writes the cut once it stops.
      placedRef.current = { x: nx, y: ny };
      engine.moveInspectWindow(nx, ny);
      const now = performance.now();
      if (now - panSavedAt.current > 40) {
        panSavedAt.current = now;
        facade.save_changes();
      }
    },
    [engine, facade],
  );
  const panEnd = useCallback(() => {
    panSavedAt.current = performance.now();
    facade.save_changes();
  }, [facade]);

  const contrastLo = defaultContrast[0];
  const contrastHi = defaultContrast[1];
  const resetAdjust = useCallback(
    (section: AdjustSection | "all") => {
      const all = section === "all";
      if (all || section === "image") {
        patchCube({
          contrast: [contrastLo, contrastHi],
          render: { imageAlpha: DEFAULT_RENDER.imageAlpha, imageGamma: DEFAULT_RENDER.imageGamma },
        });
      }
      if (all || section === "labels") patchCube({ render: { cellAlpha: DEFAULT_RENDER.cellAlpha } });
      if (all || section === "cuts") {
        patchCube({ cut: OPEN_CUT });
        const { win: w, volume: v } = latest.current;
        if (w && v) write(committedCut(OPEN_CUT, w, v));
      }
    },
    [patchCube, write, contrastLo, contrastHi],
  );

  return {
    hasVolume,
    cube,
    patchCube,
    cut,
    cutRanges,
    onCutLive,
    onCutCommit,
    onKeyDown,
    exitInspect,
    focusEntry,
    save,
    resetAdjust,
    panWindow,
    panEnd,
  };
}

/** Whether the window centre is the user's last placement (the model echoes it exactly). */
function atPlacement(placed: { x: number; y: number } | null, cx: number | null, cy: number | null): boolean {
  return placed != null && cx === placed.x && cy === placed.y;
}
