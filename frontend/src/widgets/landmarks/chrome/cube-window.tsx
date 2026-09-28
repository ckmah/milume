import { Suspense, lazy, useCallback, useLayoutEffect, useRef, useState } from "react";
import { XIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { HighlightGroup } from "@/widgets/volume-cube/cell-lut-extension";
import type { CubeCut } from "@/widgets/volume-cube/VolumeCube";

import type { CubeSettings, CubeSettingsPatch } from "../use-cube-settings";
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
}: {
  lm: LandmarksModel;
  settings: CubeSettings;
  patch: (p: CubeSettingsPatch) => void;
  /** The cut inside the current window (absolute µm). */
  cut: CubeCut;
  dark: boolean;
  groups: HighlightGroup[];
}) {
  const ref = useRef<HTMLElement>(null);
  const [rect, setRect] = useState<Rect | null>(null);
  const gesture = useRef<{ kind: "move" | "resize"; x: number; y: number; start: Rect } | null>(null);

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
          Cube · {size} µm
        </span>
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
            onBounds={(bounds) => patch({ bounds })}
            onPreset={(preset) => patch({ preset })}
          />
        </Suspense>
      </div>
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
