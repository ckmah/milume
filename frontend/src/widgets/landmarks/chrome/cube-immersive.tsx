import { Suspense, lazy, memo, useCallback, useEffect, useMemo, useRef } from "react";

import type { CellColoring } from "@/widgets/volume-cube/cell-lut-extension";
import type { MeshLook } from "@/widgets/volume-cube/cell-mesh";
import type { ChunkCache } from "@/widgets/volume-cube/chunk-cache";
import type { VolumeCommClient } from "@/widgets/volume-cube/volume-comm";
import type { CubeOverlay } from "@/widgets/volume-cube/overlay-layers";
import type { CubeCut, CubeLoadState } from "@/widgets/volume-cube/VolumeCube";
import { PREVIEW_REGION_SCALE } from "@/widgets/volume-cube/window-source";

import { decodeI32Base64 } from "../binary";
import { INSPECT_WINDOW_UM } from "../engine";
import type { CubeSettings, CubeSettingsPatch } from "../use-cube-settings";
import { inspectWindowOf } from "../use-inspect-cube";
import type { LandmarksModel } from "../use-landmarks-model";
import { type ChipSnapshot, SNAPSHOT_SETTLE_MS, snapshotOf, windowKey } from "./cube-snapshots";
import { ChromeLoadIndicator } from "./load-indicator";

// Lazy only in the dev harness: the widget build inlines dynamic imports
// (`inlineDynamicImports`, vite.config.ts), so landmarks.mjs always carries Viv.
const VolumeCube = lazy(() =>
  import("@/widgets/volume-cube/VolumeCube").then((m) => ({ default: m.VolumeCube })),
);

const ORIGIN_ZYX: [number, number, number] = [0, 0, 0];
const VOXEL_ZYX: [number, number, number] = [1, 1, 1];

/**
 * The Inspect cube taking over the widget's plot area, full-bleed. Its load
 * status goes to the settings for the Inspect pill, which holds Save and Exit.
 * Esc in Inspect returns to the map. It also snapshots the window it shows for
 * the inspect entries' thumbnails in the Selections panel.
 */
export const CubeImmersive = memo(function CubeImmersive({
  lm,
  settings,
  patch,
  cut,
  dark,
  coloring,
  cache,
  volumeComm,
  budgets,
  snapshots,
  overlays,
  onSnapshot,
  onPan,
  onPanEnd,
  onCutLive,
  onCutCommit,
  labelAlpha,
  meshLook,
}: {
  lm: LandmarksModel;
  settings: CubeSettings;
  patch: (p: CubeSettingsPatch) => void;
  /** The cut inside the current window (absolute µm). */
  cut: CubeCut;
  dark: boolean;
  coloring: CellColoring;
  /** The widget's decoded-chunk cache, shared with the preview. */
  cache: ChunkCache;
  volumeComm: VolumeCommClient | null;
  /** Voxel budgets: `preview` sizes the coarse first step, `dock` the fine level. */
  budgets: { preview: number; dock: number };
  /** Inspect entry thumbnails by selection id; kept across opens, never synced. */
  snapshots: Map<string, ChipSnapshot>;
  /** The user's landmarks (µm), drawn on the cube's top face. */
  overlays: CubeOverlay[] | null;
  /** An entry's thumbnail was added or replaced in `snapshots` (the Map is mutable). */
  onSnapshot: () => void;
  /** Shift+drag, or a drag with the Move tool: pan the live window (µm). */
  onPan: (dxUm: number, dyUm: number) => void;
  /** The pan's release. */
  onPanEnd: () => void;
  /** A drag on a volume face, live, then committed on release. */
  onCutLive: (cut: CubeCut) => void;
  onCutCommit: (cut: CubeCut) => void;
  /** Harness DialKit. Omitted: the Labels opacity slider in cube settings. */
  labelAlpha?: number;
  /** Harness DialKit: the rest of the meshes' look. */
  meshLook?: Partial<MeshLook>;
}) {
  const loadRef = useRef<CubeLoadState | null>(null);
  const onLoadState = useCallback(
    (s: CubeLoadState) => {
      loadRef.current = s;
      const error = s.imageError || s.refineError || (s.outside ? "Outside the volume" : "");
      patch({ load: error ? "error" : s.refining ? "refining" : "ready", loadError: error });
    },
    [patch],
  );

  // The focused inspect entry, if any.
  const focusedSel = lm.selected_kind === "selection" ? lm.selections[lm.selected_index] : undefined;
  const focusedWin = inspectWindowOf(focusedSel);
  const focused = focusedWin ? { id: String(focusedSel?.id), win: focusedWin } : null;

  // Snapshot the live window once it is shown settled, fine level and no pan.
  // Save can then show that thumbnail without deck drawing another frame.
  // The drawing buffer is preserved, so the read waits out SNAPSHOT_SETTLE_MS
  // and runs as its own task. The first settled frame can still hold the
  // previous textures. Reading inside onAfterRender flushes the raymarch on
  // the renderer thread. On software GL that stall runs longer than a hit-test
  // can wait.
  const live = useRef<ChipSnapshot | null>(null);
  const latest = useRef({ focused, cx: lm.inspect_cx, cy: lm.inspect_cy, size: lm.inspect_size_um });
  latest.current = { focused, cx: lm.inspect_cx, cy: lm.inspect_cy, size: lm.inspect_size_um };
  const shotTimer = useRef<number | null>(null);
  const shotKey = useRef<string | null>(null);
  useEffect(
    () => () => {
      if (shotTimer.current != null) window.clearTimeout(shotTimer.current);
    },
    [],
  );
  const onRendered = useCallback(
    (canvas: HTMLCanvasElement) => {
      const s = loadRef.current;
      const { focused: f, cx, cy, size: sz } = latest.current;
      if (!s || s.refining || s.pan[0] !== 0 || s.pan[1] !== 0 || cx == null || cy == null) return;
      const liveKey = windowKey({ cx, cy, size_um: sz });
      const haveLive = live.current?.key === liveKey;
      let needEntry = false;
      if (f && f.win.cx === cx && f.win.cy === cy) {
        needEntry = snapshots.get(f.id)?.key !== windowKey(f.win);
      }
      if (haveLive && !needEntry) return;
      if (shotTimer.current != null && shotKey.current === liveKey) return;
      if (shotTimer.current != null) window.clearTimeout(shotTimer.current);
      shotKey.current = liveKey;
      shotTimer.current = window.setTimeout(() => {
        shotTimer.current = null;
        const load = loadRef.current;
        const cur = latest.current;
        if (!load || load.refining || load.pan[0] !== 0 || load.pan[1] !== 0 || cur.cx == null || cur.cy == null) return;
        if (windowKey({ cx: cur.cx, cy: cur.cy, size_um: cur.size }) !== liveKey) return;
        let url: string | null;
        try {
          url = snapshotOf(canvas);
        } catch {
          return;
        }
        if (!url) return;
        const now = performance.now();
        if (live.current?.key !== liveKey) live.current = { key: liveKey, url, at: now };
        const foc = cur.focused;
        if (foc && foc.win.cx === cur.cx && foc.win.cy === cur.cy) {
          const entryKey = windowKey(foc.win);
          if (snapshots.get(foc.id)?.key !== entryKey) {
            snapshots.set(foc.id, { key: entryKey, url, at: now });
            onSnapshot();
          }
        }
      }, SNAPSHOT_SETTLE_MS);
    },
    [snapshots, onSnapshot],
  );
  // A focused entry at the live window keeps the live snapshot when the cube moves on.
  const focusedKey = focused ? windowKey(focused.win) : "";
  useEffect(() => {
    const l = live.current;
    if (!focused || !l || l.key !== focusedKey || snapshots.get(focused.id)?.key === focusedKey) return;
    snapshots.set(focused.id, l);
    onSnapshot();
  });

  const volume = lm.volume ?? {};
  const cellRows = useMemo(() => (lm.volume_cell_rows ? decodeI32Base64(lm.volume_cell_rows) : null), [lm.volume_cell_rows]);
  const size = lm.inspect_size_um || INSPECT_WINDOW_UM;
  const renderSettings = useMemo(
    () => (labelAlpha == null ? settings.render : { ...settings.render, cellAlpha: labelAlpha }),
    [settings.render, labelAlpha],
  );
  const renderCountOverlay =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("cubeRenderOverlay") === "1";
  return (
    <section
      role="dialog"
      aria-label="Cube"
      // Focusable, so Esc pressed after clicking the cube reaches the widget.
      tabIndex={-1}
      className="landmarks__cube-immersive pointer-events-auto absolute inset-0 outline-none"
      onMouseDown={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
    >
      <Suspense
        fallback={
          <ChromeLoadIndicator
            testId="cube-load-immersive"
            overlay
            phase="loading"
            message="Loading cube…"
          />
        }
      >
        <VolumeCube
          imageUrl={volume.image_url ?? ""}
          cellPolygons={volume.cells}
          cellRows={cellRows}
          voxelSizeUm={volume.voxel_size_um ?? VOXEL_ZYX}
          originUm={volume.origin_um ?? ORIGIN_ZYX}
          windowCx={lm.inspect_cx ?? 0}
          windowCy={lm.inspect_cy ?? 0}
          windowSizeUm={size}
          cut={cut}
          contrast={settings.contrast}
          imageChannelRows={lm._image_channels}
          imageMode={settings.imageMode}
          preset={settings.preset}
          home="top"
          reframeOnPreset
          resetTick={settings.resetTick}
          showImage={settings.showImage}
          showLabels={settings.showLabels}
          coloring={coloring}
          render={renderSettings}
          meshLook={meshLook}
          dark={dark}
          background
          height="100%"
          showLegend={false}
          overlays={overlays}
          coarse={{ scale: PREVIEW_REGION_SCALE, budget: budgets.preview }}
          budget={budgets.dock}
          tightenZToSignal={false}
          chunkCache={cache}
          volumeComm={volumeComm}
          pausesPrefetch
          onLoadState={onLoadState}
          onRendered={onRendered}
          renderCountOverlay={renderCountOverlay}
          onBounds={(bounds) => patch({ bounds })}
          onPreset={(preset) => patch({ preset })}
          panMode={settings.move}
          onPan={onPan}
          onPanEnd={onPanEnd}
          onCutLive={onCutLive}
          onCutCommit={onCutCommit}
          loadStatusTestId="cube-load-immersive"
        />
      </Suspense>
    </section>
  );
});
