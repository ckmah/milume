import { Suspense, lazy, useCallback, useEffect, useRef } from "react";

import type { CellColoring } from "@/widgets/volume-cube/cell-lut-extension";
import type { ChunkCache } from "@/widgets/volume-cube/chunk-cache";
import type { VolumeCommClient } from "@/widgets/volume-cube/volume-comm";
import type { VolumeHttpClient } from "@/widgets/volume-cube/volume-http";
import type { CubeOverlay } from "@/widgets/volume-cube/overlay-layers";
import type { CubeCut, CubeLoadState } from "@/widgets/volume-cube/VolumeCube";
import { PREVIEW_REGION_SCALE } from "@/widgets/volume-cube/window-source";

import { INSPECT_WINDOW_UM, type EngineHandle } from "../engine";
import type { CubeSettings, CubeSettingsPatch } from "../use-cube-settings";
import { inspectWindowOf } from "../use-inspect-cube";
import type { LandmarksModel } from "../use-landmarks-model";
import { useCubeScatterPoints } from "../use-cube-scatter-points";
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
export function CubeImmersive({
  lm,
  engine,
  settings,
  patch,
  cut,
  dark,
  coloring,
  cache,
  volumeComm,
  volumeHttp,
  budgets,
  snapshots,
  overlays,
  onSnapshot,
  onPan,
  onPanEnd,
  onCutLive,
  onCutCommit,
  labelAlpha,
}: {
  lm: LandmarksModel;
  engine: EngineHandle | null;
  settings: CubeSettings;
  patch: (p: CubeSettingsPatch) => void;
  /** The cut inside the current window (absolute µm). */
  cut: CubeCut;
  dark: boolean;
  coloring: CellColoring;
  /** The widget's decoded-chunk cache, shared with the preview. */
  cache: ChunkCache;
  volumeComm: VolumeCommClient | null;
  volumeHttp: VolumeHttpClient | null;
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
  /** Harness DialKit. Omitted: the Labels alpha slider in cube settings. */
  labelAlpha?: number;
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

  // Snapshot the live window once it is shown settled (fine level, no pan): an
  // entry saved from it can then show its thumbnail the moment Save adds it,
  // though deck draws no new frame then (the canvas can only be read while
  // rendering). A focused entry at its own window also gets one, under its id.
  // After an entry's first snapshot, settled renders replace it for
  // SNAPSHOT_SETTLE_MS.
  const live = useRef<ChipSnapshot | null>(null);
  const latest = useRef({ focused, cx: lm.inspect_cx, cy: lm.inspect_cy, size: lm.inspect_size_um });
  latest.current = { focused, cx: lm.inspect_cx, cy: lm.inspect_cy, size: lm.inspect_size_um };
  const onRendered = useCallback(
    (canvas: HTMLCanvasElement) => {
      const s = loadRef.current;
      const { focused: f, cx, cy, size: sz } = latest.current;
      if (!s || s.refining || s.pan[0] !== 0 || s.pan[1] !== 0 || cx == null || cy == null) return;
      const now = performance.now();
      const liveKey = windowKey({ cx, cy, size_um: sz });
      const liveCur = live.current?.key === liveKey ? live.current : null;
      const takeLive = !liveCur || now - liveCur.at <= SNAPSHOT_SETTLE_MS;
      let entryCur: ChipSnapshot | null = null;
      let takeEntry = false;
      if (f && f.win.cx === cx && f.win.cy === cy) {
        const prev = snapshots.get(f.id);
        entryCur = prev?.key === windowKey(f.win) ? prev : null;
        takeEntry = !entryCur || now - entryCur.at <= SNAPSHOT_SETTLE_MS;
      }
      if (!takeLive && !takeEntry) return;
      const url = snapshotOf(canvas);
      if (!url) return;
      if (takeLive) live.current = { key: liveKey, url, at: liveCur?.at ?? now };
      if (takeEntry && f) {
        snapshots.set(f.id, { key: windowKey(f.win), url, at: entryCur?.at ?? now });
        onSnapshot();
      }
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
  const size = lm.inspect_size_um || INSPECT_WINDOW_UM;
  const scatterPoints = useCubeScatterPoints(engine, lm, lm.inspect_cx, lm.inspect_cy, size);
  const drawPoints = settings.showPoints && scatterPoints.length > 0;

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
          labelsUrl={volume.labels_url ?? ""}
          voxelSizeUm={volume.voxel_size_um ?? VOXEL_ZYX}
          originUm={volume.origin_um ?? ORIGIN_ZYX}
          windowCx={lm.inspect_cx ?? 0}
          windowCy={lm.inspect_cy ?? 0}
          windowSizeUm={size}
          cut={cut}
          contrast={settings.contrast}
          imageMode={settings.imageMode}
          labelMode={settings.labelMode}
          preset={settings.preset}
          home="top"
          reframeOnPreset
          resetTick={settings.resetTick}
          showImage={settings.showImage}
          showLabels={settings.showLabels}
          coloring={coloring}
          render={
            labelAlpha == null ? settings.render : { ...settings.render, cellAlpha: labelAlpha }
          }
          dark={dark}
          height="100%"
          showLegend={false}
          overlays={overlays}
          scatterPoints={scatterPoints}
          showPoints={drawPoints}
          coarse={{ scale: PREVIEW_REGION_SCALE, budget: budgets.preview }}
          budget={budgets.dock}
          chunkCache={cache}
          volumeComm={volumeComm}
          volumeHttp={volumeHttp}
          pausesPrefetch
          onLoadState={onLoadState}
          onRendered={onRendered}
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
}
