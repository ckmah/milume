import { Suspense, lazy, useCallback, useReducer, useRef, useState } from "react";
import { BookmarkCheckIcon, BookmarkPlusIcon, XIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { HighlightGroup } from "@/widgets/volume-cube/cell-lut-extension";
import type { ChunkCache } from "@/widgets/volume-cube/chunk-cache";
import type { CubeOverlay } from "@/widgets/volume-cube/overlay-layers";
import type { CubeCut, CubeLoadState } from "@/widgets/volume-cube/VolumeCube";
import { PREVIEW_REGION_SCALE } from "@/widgets/volume-cube/window-source";

import { INSPECT_WINDOW_UM } from "../engine";
import { SELECTION_COLORS } from "../helpers";
import type { CubeSettings, CubeSettingsPatch } from "../use-cube-settings";
import { inspectWindowOf } from "../use-inspect-cube";
import type { LandmarksModel } from "../use-landmarks-model";
import { type ChipSnapshot, SNAPSHOT, SNAPSHOT_SETTLE_MS, snapshotOf, windowKey } from "./cube-snapshots";
import { chromeHitClass, chromeHitTextClass } from "./primitives";
import { FLOAT_PANEL } from "./sections";

// Lazy only in the dev harness: the widget build inlines dynamic imports
// (`inlineDynamicImports`, vite.config.ts), so landmarks.mjs always carries Viv.
const VolumeCube = lazy(() =>
  import("@/widgets/volume-cube/VolumeCube").then((m) => ({ default: m.VolumeCube })),
);

const ORIGIN_ZYX: [number, number, number] = [0, 0, 0];
const VOXEL_ZYX: [number, number, number] = [1, 1, 1];

/**
 * The Inspect cube taking over the widget's plot area: full-bleed, with Soft
 * Float chrome over it (title, Save, Close top right; the inspect history
 * bottom). Esc in Inspect or the Close button returns to the map.
 */
export function CubeImmersive({
  lm,
  settings,
  patch,
  cut,
  dark,
  groups,
  cache,
  budgets,
  snapshots,
  overlays,
  onFocusEntry,
  onSave,
}: {
  lm: LandmarksModel;
  settings: CubeSettings;
  patch: (p: CubeSettingsPatch) => void;
  /** The cut inside the current window (absolute µm). */
  cut: CubeCut;
  dark: boolean;
  groups: HighlightGroup[];
  /** The widget's decoded-chunk cache, shared with the preview. */
  cache: ChunkCache;
  /** Voxel budgets: `preview` sizes the coarse first step, `dock` the fine level. */
  budgets: { preview: number; dock: number };
  /** History chip snapshots by selection id; kept across opens, never synced. */
  snapshots: Map<string, ChipSnapshot>;
  /** The user's landmarks (µm), drawn on the cube's top face. */
  overlays: CubeOverlay[] | null;
  /** A history chip: focus its entry and restore its window and cut. */
  onFocusEntry: (index: number) => void;
  /** Save the live window as an inspect Selection. */
  onSave: () => void;
}) {
  const [refineError, setRefineError] = useState("");
  const [refining, setRefining] = useState(false);
  const loadRef = useRef<CubeLoadState | null>(null);
  const onLoadState = useCallback((s: CubeLoadState) => {
    loadRef.current = s;
    setRefineError(s.refineError ?? "");
    setRefining(s.refining);
  }, []);

  // History: the inspect Selections, in `selections` order.
  const history = lm.selections.flatMap((sel, index) => {
    const win = inspectWindowOf(sel);
    return win ? [{ id: String(sel.id), index, win }] : [];
  });
  const focusedIndex = lm.selected_kind === "selection" ? lm.selected_index : -1;
  const focused = history.find((h) => h.index === focusedIndex) ?? null;

  // Snapshot the focused entry once its window is shown settled (fine level,
  // no pan) at the entry's own window.
  const [, bumpSnapshots] = useReducer((n: number) => n + 1, 0);
  const latest = useRef({ focused, cx: lm.inspect_cx, cy: lm.inspect_cy });
  latest.current = { focused, cx: lm.inspect_cx, cy: lm.inspect_cy };
  const onRendered = useCallback(
    (canvas: HTMLCanvasElement) => {
      const s = loadRef.current;
      const { focused: f, cx, cy } = latest.current;
      if (!s || s.refining || s.pan[0] !== 0 || s.pan[1] !== 0 || !f) return;
      if (f.win.cx !== cx || f.win.cy !== cy) return;
      const key = windowKey(f.win);
      const prev = snapshots.get(f.id);
      const current = prev?.key === key ? prev : null;
      const now = performance.now();
      if (current && now - current.at > SNAPSHOT_SETTLE_MS) return;
      const url = snapshotOf(canvas);
      if (!url) return;
      snapshots.set(f.id, { key, url, at: current?.at ?? now });
      bumpSnapshots();
    },
    [snapshots],
  );

  const volume = lm.volume ?? {};
  const size = lm.inspect_size_um || INSPECT_WINDOW_UM;
  // The live window is already a saved entry: nothing new to save.
  const placed = lm.inspect_cx != null && lm.inspect_cy != null;
  const saved = history.some(
    (h) => h.win.cx === lm.inspect_cx && h.win.cy === lm.inspect_cy && h.win.size_um === lm.inspect_size_um,
  );
  const swatch = (index: number) => SELECTION_COLORS[index % SELECTION_COLORS.length];

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
      <Suspense fallback={<p className="p-4 text-xs text-muted-foreground">Loading cube…</p>}>
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
          mode={settings.mode}
          preset={settings.preset}
          home="top"
          reframeOnPreset
          resetTick={settings.resetTick}
          showImage={settings.showImage}
          showLabels={settings.showLabels}
          groups={groups}
          render={settings.render}
          dark={dark}
          height="100%"
          showLegend={false}
          overlays={overlays}
          coarse={{ scale: PREVIEW_REGION_SCALE, budget: budgets.preview }}
          budget={budgets.dock}
          chunkCache={cache}
          pausesPrefetch
          onLoadState={onLoadState}
          onRendered={onRendered}
          onBounds={(bounds) => patch({ bounds })}
          onPreset={(preset) => patch({ preset })}
        />
      </Suspense>
      <header
        className={cn(FLOAT_PANEL, "landmarks__cube-actions")}
        data-testid="cube-actions"
      >
        <span className="min-w-0 truncate px-2 text-xs font-medium text-foreground">Cube · {Math.round(size)} µm</span>
        {refineError ? (
          <span className="min-w-0 truncate text-xs text-destructive" role="status">
            {refineError}
          </span>
        ) : refining ? (
          <span className="shrink-0 text-xs text-muted-foreground">refining</span>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          size="xs"
          aria-label="Save window"
          title={saved ? "This window is saved" : "Save this window as an inspect selection"}
          data-saved={String(saved)}
          disabled={saved || !placed}
          className={cn(chromeHitTextClass, "gap-1 px-2")}
          onClick={onSave}
        >
          {saved ? <BookmarkCheckIcon aria-hidden /> : <BookmarkPlusIcon aria-hidden />}
          {saved ? "Saved" : "Save"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Close cube"
          title="Close cube"
          className={chromeHitClass}
          onClick={() => patch({ open: false })}
        >
          <XIcon className="size-4" />
        </Button>
      </header>
      {history.length ? (
        <div
          role="group"
          aria-label="Inspect history"
          className={cn(FLOAT_PANEL, "landmarks__cube-history")}
        >
          {history.map((h, n) => {
            const snap = snapshots.get(h.id);
            const src = snap?.key === windowKey(h.win) ? snap.url : null;
            return (
              <Button
                key={`${h.id}-${h.index}`}
                type="button"
                variant="ghost"
                size="sm"
                aria-label={`Inspect ${n + 1}`}
                aria-pressed={h.index === focusedIndex}
                title={`Inspect ${n + 1}`}
                className={cn(chromeHitClass, "landmarks__inspect-chip")}
                onClick={() => onFocusEntry(h.index)}
              >
                {src ? (
                  <img src={src} alt="" width={SNAPSHOT.width} height={SNAPSHOT.height} className="rounded-sm" />
                ) : (
                  <span
                    className="block rounded-sm"
                    style={{ width: SNAPSHOT.width, height: SNAPSHOT.height, background: swatch(h.index) }}
                  />
                )}
                <span className="pointer-events-none absolute bottom-1 left-1.5 text-[10px] leading-none font-medium text-white [text-shadow:0_0_2px_rgb(0_0_0/0.9)]">
                  {n + 1}
                </span>
              </Button>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
