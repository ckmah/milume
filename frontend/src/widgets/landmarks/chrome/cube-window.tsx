import { Suspense, lazy, useCallback, useLayoutEffect, useReducer, useRef, useState } from "react";
import { XIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { HighlightGroup } from "@/widgets/volume-cube/cell-lut-extension";
import type { ChunkCache } from "@/widgets/volume-cube/chunk-cache";
import type { CubeCut, CubeLoadState } from "@/widgets/volume-cube/VolumeCube";
import { PREVIEW_REGION_SCALE } from "@/widgets/volume-cube/window-source";

import { SELECTION_COLORS } from "../helpers";
import type { CubeSettings, CubeSettingsPatch } from "../use-cube-settings";
import { inspectWindowOf } from "../use-inspect-cube";
import type { LandmarksModel } from "../use-landmarks-model";
import { chromeHitClass } from "./primitives";
import { FLOAT_PANEL } from "./sections";

// Lazy only in the dev harness: the widget build inlines dynamic imports
// (`inlineDynamicImports`, vite.config.ts), so landmarks.mjs always carries Viv.
const VolumeCube = lazy(() =>
  import("@/widgets/volume-cube/VolumeCube").then((m) => ({ default: m.VolumeCube })),
);

const DEFAULT_SIZE = { width: 440, height: 380 };
const MIN_SIZE = { width: 320, height: 280 };
// Right inset clears the right peek tab (Inspect collapses the docks).
const INSET = { top: 56, right: 48 };
const ORIGIN_ZYX: [number, number, number] = [0, 0, 0];
const VOXEL_ZYX: [number, number, number] = [1, 1, 1];
const SNAPSHOT = { width: 64, height: 40 };
/**
 * After an entry's first snapshot, later settled renders replace it for this
 * long: the first settled frame can still carry the previous textures while
 * Viv uploads the new ones.
 */
const SNAPSHOT_SETTLE_MS = 1000;

/** A history chip snapshot: the window it shows (`windowKey`), its data URL, and when it was first taken. */
export type ChipSnapshot = { key: string; url: string; at: number };

/** The window a snapshot shows. A snapshot under another key (moved entry, reused id) is stale. */
export function windowKey(w: { cx: number; cy: number; size_um: number }): string {
  return `${w.cx},${w.cy},${w.size_um}`;
}

/** Draw `canvas` into a 64×40 WebP, cropped to cover. */
function snapshotOf(canvas: HTMLCanvasElement): string | null {
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

type Rect = { left: number; top: number; width: number; height: number };

/** Keep the window inside its container (the widget, so full screen too). */
function clampRect(r: Rect, bounds: { width: number; height: number }): Rect {
  const width = Math.max(MIN_SIZE.width, Math.min(r.width, bounds.width));
  const height = Math.max(MIN_SIZE.height, Math.min(r.height, bounds.height));
  return {
    width,
    height,
    left: Math.max(0, Math.min(r.left, bounds.width - width)),
    top: Math.max(0, Math.min(r.top, bounds.height - height)),
  };
}

/**
 * The Inspect cube as a floating Soft Float window over the map: drag by the
 * title bar, resize from the corner, close with the button (or Esc in Inspect).
 */
export function CubeWindow({
  lm,
  settings,
  patch,
  cut,
  dark,
  groups,
  cache,
  budgets,
  snapshots,
  onFocusEntry,
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
  /** A history chip: focus its entry and restore its window and cut. */
  onFocusEntry: (index: number) => void;
}) {
  const ref = useRef<HTMLElement>(null);
  const [rect, setRect] = useState<Rect | null>(null);
  const gesture = useRef<{ kind: "move" | "resize"; x: number; y: number; start: Rect } | null>(null);
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

  const container = useCallback(() => {
    const parent = ref.current?.offsetParent as HTMLElement | null;
    return parent ? { width: parent.clientWidth, height: parent.clientHeight } : null;
  }, []);

  // Top right of the widget on open; re-clamped when the widget resizes.
  useLayoutEffect(() => {
    const bounds = container();
    if (!bounds) return;
    setRect(
      clampRect(
        { ...DEFAULT_SIZE, left: bounds.width - INSET.right - DEFAULT_SIZE.width, top: INSET.top },
        bounds,
      ),
    );
    const parent = ref.current?.offsetParent;
    if (!parent || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      const next = container();
      if (next) setRect((prev) => (prev ? clampRect(prev, next) : prev));
    });
    ro.observe(parent);
    return () => ro.disconnect();
  }, [container]);

  const onPointerDown = (kind: "move" | "resize") => (e: React.PointerEvent<HTMLElement>) => {
    if (e.button !== 0 || !rect) return;
    if (kind === "move" && (e.target as HTMLElement).closest("button")) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    gesture.current = { kind, x: e.clientX, y: e.clientY, start: rect };
  };
  const onPointerMove = (e: React.PointerEvent<HTMLElement>) => {
    const g = gesture.current;
    const bounds = container();
    if (!g || !bounds) return;
    const dx = e.clientX - g.x;
    const dy = e.clientY - g.y;
    const s = g.start;
    if (g.kind === "move") {
      setRect(clampRect({ ...s, left: s.left + dx, top: s.top + dy }, bounds));
    } else {
      // Resizing grows toward the bottom right, within the widget.
      const width = Math.min(s.width + dx, bounds.width - s.left);
      const height = Math.min(s.height + dy, bounds.height - s.top);
      setRect(clampRect({ ...s, width, height }, bounds));
    }
  };
  const onPointerUp = (e: React.PointerEvent<HTMLElement>) => {
    if (!gesture.current) return;
    gesture.current = null;
    e.currentTarget.releasePointerCapture(e.pointerId);
  };
  const gestureHandlers = { onPointerMove, onPointerUp, onPointerCancel: onPointerUp };

  const volume = lm.volume ?? {};
  const size = lm.inspect_size_um || 100;
  const swatch = (index: number) => SELECTION_COLORS[index % SELECTION_COLORS.length];

  return (
    <section
      ref={ref}
      role="dialog"
      aria-label="Cube"
      // Focusable, so Esc pressed after clicking the cube reaches the widget.
      tabIndex={-1}
      className={cn(FLOAT_PANEL, "landmarks__cube-window pointer-events-auto absolute flex flex-col outline-none")}
      style={
        rect
          ? { left: rect.left, top: rect.top, width: rect.width, height: rect.height }
          : { right: INSET.right, top: INSET.top, ...DEFAULT_SIZE }
      }
      onMouseDown={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
    >
      <header
        className="landmarks__cube-titlebar shrink-0 cursor-grab select-none active:cursor-grabbing"
        onPointerDown={onPointerDown("move")}
        {...gestureHandlers}
      >
        <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">
          Cube · {Math.round(size)} µm
        </span>
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
          size="icon-sm"
          aria-label="Close cube"
          title="Close cube"
          className={chromeHitClass}
          onClick={() => patch({ open: false })}
        >
          <XIcon className="size-4" />
        </Button>
      </header>
      <div className="min-h-0 flex-1 px-1.5 pb-1.5">
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
            resetTick={settings.resetTick}
            showLabels={settings.showLabels}
            groups={groups}
            render={settings.render}
            dark={dark}
            height="100%"
            showLegend={false}
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
      </div>
      {history.length ? (
        <div
          role="group"
          aria-label="Inspect history"
          className="flex shrink-0 gap-1 overflow-x-auto px-1.5 pr-4 pb-1.5"
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
      <button
        type="button"
        className="landmarks__cube-resize"
        aria-label="Resize cube"
        title="Resize cube"
        onPointerDown={onPointerDown("resize")}
        {...gestureHandlers}
      />
    </section>
  );
}
