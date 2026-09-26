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
import type { AnyModel, SelectionItem } from "./helpers";
import { type CubeSettings, type CubeSettingsPatch, useCubeSettings } from "./use-cube-settings";
import type { LandmarksModel } from "./use-landmarks-model";

type Range = [number, number];

/** An inspect Selection's window: centre and side (µm), and its cut (absolute µm, or `[]`). */
export type InspectWindow = { cx: number; cy: number; size_um: number; cut: number[] };

/** The entry's window when `sel` is an inspect Selection. */
export function inspectWindowOf(sel: SelectionItem | undefined): InspectWindow | null {
  if (!sel || sel.type !== "inspect") return null;
  const w = sel.window as InspectWindow | undefined;
  return w && typeof w.cx === "number" && typeof w.cy === "number" ? w : null;
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
 *
 * Inspect Selections are the dock's history: focusing one restores its window
 * and cut and opens the dock, each committed cut is also written into the
 * focused entry, and removing the last one closes the dock.
 */
export function useInspectCube(facade: AnyModel, lm: LandmarksModel, engine: EngineHandle | null): InspectCube {
  const hasVolume = Boolean(lm.volume?.image_url);
  const volumeCut = lm.volume_cut?.length === 6 ? (lm.volume_cut as CubeCut) : null;
  const [cube, patchCube] = useCubeSettings(
    lm.volume?.contrast_limits ?? DEFAULT_CONTRAST,
    volumeCut ? { ...OPEN_CUT, z: [volumeCut[4], volumeCut[5]] } : OPEN_CUT,
  );

  // The last user placement (engine events), consumed by the settle commit.
  const placedRef = useRef<{ x: number; y: number } | null>(null);
  useEffect(() => {
    if (!engine || !hasVolume) return;
    return engine.subscribeInspect((e) => {
      // Placements and commits open the cube and Esc closes it; hover leaves it be.
      if (e.type === "place") {
        placedRef.current = { x: e.x, y: e.y };
        patchCube({ open: true });
      } else if (e.type === "commit") {
        patchCube({ open: true });
      } else if (e.type === "close") {
        patchCube({ open: false });
      }
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

  const cx = lm.inspect_cx;
  const cy = lm.inspect_cy;
  const latest = useRef({ rel: cube.cut, win, volume, cx, cy });
  latest.current = { rel: cube.cut, win, volume, cx, cy };

  // The last value this widget wrote, so its echo is not adopted as Python's.
  const writtenRef = useRef<string | null>(null);
  // Each committed cut also goes into the focused inspect entry's `window.cut`,
  // in the same save. Only that entry's `window` changes, never its members.
  const write = useCallback(
    (next: CubeCut) => {
      const key = next.join(",");
      const current = facade.get("volume_cut");
      const cutChanged = !(Array.isArray(current) && current.join(",") === key);
      const sels = (facade.get("selections") as SelectionItem[] | null) ?? [];
      const index = facade.get("selected_kind") === "selection" ? Number(facade.get("selected_index")) : -1;
      const entry = inspectWindowOf(sels[index]);
      const entryChanged = entry != null && (entry.cut ?? []).join(",") !== key;
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
  // window, not `inspect_cx/cy`, so dragging the focused square (its entry is
  // stale until release) never snaps it back; after a commit the entry equals
  // the window, so nothing happens.
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
  }, [engine, hasVolume, focusedId, focusedWin?.cx, focusedWin?.cy, focusedWin?.size_um]);

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

/** Whether the window centre is the user's last placement (the model echoes it exactly). */
function atPlacement(placed: { x: number; y: number } | null, cx: number | null, cy: number | null): boolean {
  return placed != null && cx === placed.x && cy === placed.y;
}
