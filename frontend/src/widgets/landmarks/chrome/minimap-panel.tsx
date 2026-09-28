import { useCallback, useEffect, useRef } from "react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

import { decodeF32Base64 } from "../binary";
import type { EngineHandle } from "../engine";
import type { LandmarksModel } from "../use-landmarks-model";
import { FLOAT_PANEL, FLOAT_PANEL_CLIP } from "./sections";

type WorldBounds = [number, number, number, number];

/** Slightly wider than square overview frame; data letterboxed inside. */
const MINIMAP_ASPECT = 1.35;

/** Roughly match deck scrollZoom: ~0.01 zoom units per wheel deltaY. */
const MINIMAP_ZOOM_PER_DELTA = 0.01;

function mapLayout(
  cssW: number,
  cssH: number,
  xBounds: number[],
  yBounds: number[],
) {
  const x0 = Number(xBounds[0]);
  const x1 = Number(xBounds[1]);
  const y0 = Number(yBounds[0]);
  const y1 = Number(yBounds[1]);
  const dx = Math.abs(x1 - x0) || 1;
  const dy = Math.abs(y1 - y0) || 1;
  const scale = Math.min(cssW / dx, cssH / dy);
  const mapW = dx * scale;
  const mapH = dy * scale;
  return {
    x0,
    x1,
    y0,
    y1,
    dx,
    dy,
    scale,
    mapW,
    mapH,
    ox: (cssW - mapW) / 2,
    oy: (cssH - mapH) / 2,
  };
}

/**
 * World → minimap canvas.
 * deck.gl OrthographicView defaults to flipY=true, so world +Y goes toward
 * the bottom of the screen (CSS-like). Canvas y also grows downward, so
 * minY → row 0 matches the main plot — do not invert Y here.
 */
function toCanvasXY(
  x: number,
  y: number,
  layout: ReturnType<typeof mapLayout>,
) {
  const u = (x - layout.x0) / (layout.x1 - layout.x0 || 1);
  const v = (y - layout.y0) / (layout.y1 - layout.y0 || 1);
  return [layout.ox + u * layout.mapW, layout.oy + v * layout.mapH] as const;
}

function clientToWorld(
  clientX: number,
  clientY: number,
  rect: DOMRect,
  xBounds: number[],
  yBounds: number[],
) {
  const layout = mapLayout(rect.width, rect.height, xBounds, yBounds);
  const px = clientX - rect.left - layout.ox;
  const py = clientY - rect.top - layout.oy;
  const u = px / Math.max(layout.mapW, 1);
  const v = py / Math.max(layout.mapH, 1);
  return {
    x: layout.x0 + u * (layout.x1 - layout.x0),
    y: layout.y0 + v * (layout.y1 - layout.y0),
  };
}

function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** Points bitmap, rebuilt only when the points, size, bounds or theme change. */
type PointsLayerCache = {
  pointsB64: string;
  key: string;
  bitmap: HTMLCanvasElement | null;
};

/**
 * Draw every point once into an offscreen canvas. Squares, not arcs: at 1–2 px
 * they look the same, and one fillRect per point is far cheaper than a path
 * (358k arcs took ~0.6 s per paint, and the minimap repaints on every view change).
 */
function pointsBitmap(
  pointsB64: string,
  w: number,
  h: number,
  layout: ReturnType<typeof mapLayout>,
  dpr: number,
  dark: boolean,
): HTMLCanvasElement | null {
  if (!pointsB64) return null;
  const bitmap = document.createElement("canvas");
  bitmap.width = w;
  bitmap.height = h;
  const ctx = bitmap.getContext("2d");
  if (!ctx) return null;
  try {
    const pts = decodeF32Base64(pointsB64);
    const n = Math.floor(pts.length / 4);
    ctx.fillStyle = dark ? "rgba(160,160,160,0.55)" : "rgba(100,100,100,0.45)";
    const size = Math.max(1.5 * dpr, 2);
    const half = size / 2;
    for (let i = 0; i < n; i++) {
      const x = layout.x0 + ((pts[i * 4] + 1) / 2) * (layout.x1 - layout.x0);
      const y = layout.y0 + ((pts[i * 4 + 1] + 1) / 2) * (layout.y1 - layout.y0);
      const [cx, cy] = toCanvasXY(x, y, layout);
      ctx.fillRect(cx - half, cy - half, size, size);
    }
  } catch {
    /* ignore decode errors */
  }
  return bitmap;
}

function drawMinimap(
  canvas: HTMLCanvasElement,
  opts: {
    pointsB64: string;
    xBounds: number[];
    yBounds: number[];
    viewport: WorldBounds | null;
    dark: boolean;
    cache: PointsLayerCache;
  },
) {
  const { pointsB64, xBounds, yBounds, viewport, dark, cache } = opts;
  const cssW = canvas.clientWidth;
  const cssH = canvas.clientHeight;
  // Skip until laid out — do not rewrite the bitmap into a 0×0 box.
  if (cssW < 2 || cssH < 2) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.max(1, Math.round(cssW * dpr));
  const h = Math.max(1, Math.round(cssH * dpr));
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const layout = mapLayout(w, h, xBounds, yBounds);

  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = dark ? "#141414" : "#e8e8e8";
  ctx.fillRect(0, 0, w, h);

  const key = `${w}x${h}:${xBounds.join(",")}:${yBounds.join(",")}:${dark}`;
  if (cache.pointsB64 !== pointsB64 || cache.key !== key) {
    cache.pointsB64 = pointsB64;
    cache.key = key;
    cache.bitmap = pointsBitmap(pointsB64, w, h, layout, dpr, dark);
  }
  if (cache.bitmap) ctx.drawImage(cache.bitmap, 0, 0);

  if (viewport) {
    const [vx0, vy0, vx1, vy1] = viewport;
    const [a, b] = [toCanvasXY(vx0, vy0, layout), toCanvasXY(vx1, vy1, layout)];
    const mapTop = layout.oy;
    const mapBottom = layout.oy + layout.mapH;
    const left = Math.min(Math.max(Math.min(a[0], b[0]), 0), w);
    const right = Math.min(Math.max(Math.max(a[0], b[0]), 0), w);
    const top = Math.min(Math.max(Math.min(a[1], b[1]), mapTop), mapBottom);
    const bottom = Math.min(Math.max(Math.max(a[1], b[1]), mapTop), mapBottom);
    const rw = Math.max(0, right - left);
    const rh = Math.max(0, bottom - top);
    if (rw > 0.5 && rh > 0.5) {
      // Match canvas / panel corner radius (--lm-float-radius on the shell).
      // Framer neutrals — viewport chrome stays achromatic (data owns saturation).
      const cssRadius =
        parseFloat(getComputedStyle(canvas).borderTopLeftRadius) || 0;
      const radius = Math.max(0, cssRadius * dpr);
      ctx.strokeStyle = dark
        ? "rgba(255, 255, 255, 0.92)"
        : "rgba(17, 17, 17, 0.88)";
      ctx.lineWidth = 1.5 * dpr;
      roundRectPath(ctx, left, top, rw, rh, radius);
      ctx.stroke();
      roundRectPath(ctx, left, top, rw, rh, radius);
      ctx.fillStyle = dark
        ? "rgba(255, 255, 255, 0.10)"
        : "rgba(17, 17, 17, 0.08)";
      ctx.fill();
    }
  }
}

export function MinimapPanel({
  lm,
  engine,
  dark = false,
  embedded = false,
}: {
  lm: LandmarksModel;
  engine: EngineHandle | null;
  dark?: boolean;
  embedded?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const pointsCache = useRef<PointsLayerCache>({ pointsB64: "", key: "", bitmap: null });

  const paint = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // Skip until laid out — painting into a 0-size box bakes a blank bitmap.
    if (canvas.clientWidth < 2 || canvas.clientHeight < 2) return;
    drawMinimap(canvas, {
      pointsB64: lm.points_data || "",
      xBounds: lm.x_bounds || [0, 1],
      yBounds: lm.y_bounds || [0, 1],
      viewport: engine?.getViewportWorldBounds?.() ?? null,
      dark,
      cache: pointsCache.current,
    });
  }, [lm.points_data, lm.x_bounds, lm.y_bounds, engine, dark]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const frame = frameRef.current;
    if (!canvas) return;

    paint();
    const raf = requestAnimationFrame(paint);
    const t = window.setTimeout(paint, 80);
    const tLate = window.setTimeout(paint, 250);
    const unsub = engine?.subscribeViewState?.(() => paint());
    const ro = new ResizeObserver(() => paint());
    ro.observe(canvas);
    if (frame) ro.observe(frame);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(t);
      window.clearTimeout(tLate);
      unsub?.();
      ro.disconnect();
    };
  }, [paint, engine]);

  const panAt = useCallback(
    (clientX: number, clientY: number, animate = false) => {
      if (!engine?.panTo) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const { x, y } = clientToWorld(
        clientX,
        clientY,
        rect,
        lm.x_bounds || [0, 1],
        lm.y_bounds || [0, 1],
      );
      engine.panTo(x, y, { animate });
    },
    [engine, lm.x_bounds, lm.y_bounds],
  );

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    dragging.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    panAt(e.clientX, e.clientY);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dragging.current) return;
    panAt(e.clientX, e.clientY);
  };

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    dragging.current = false;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
  };

  const onWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    if (!engine?.zoomBy) return;
    e.preventDefault();
    e.stopPropagation();
    // Match deck.gl scrollZoom scaling (deltaY * ~0.01), not ±1 toolbar steps.
    const delta = -e.deltaY * MINIMAP_ZOOM_PER_DELTA;
    if (!delta) return;
    engine.zoomBy(delta, { animate: false });
    panAt(e.clientX, e.clientY, false);
  };

  const body = (
    <div ref={frameRef} className="w-full">
      <canvas
        ref={canvasRef}
        className="w-full cursor-grab active:cursor-grabbing rounded-[var(--lm-float-radius)]"
        style={{ aspectRatio: `${MINIMAP_ASPECT} / 1` }}
        data-testid="landmarks-minimap"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={onWheel}
        aria-label="Minimap — drag to pan, scroll to zoom"
      />
    </div>
  );

  if (embedded) {
    return <div className="shrink-0">{body}</div>;
  }

  return (
    <Card
      className={cn(FLOAT_PANEL, "landmarks-minimap-float shrink-0")}
      data-testid="minimap-panel"
    >
      <div className={FLOAT_PANEL_CLIP}>
        <CardHeader className="sr-only">
          <CardDescription>Minimap of the tissue scatter</CardDescription>
        </CardHeader>
        <CardContent className="p-0">{body}</CardContent>
      </div>
    </Card>
  );
}
