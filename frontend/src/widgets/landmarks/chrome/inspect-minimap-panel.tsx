import { useCallback, useEffect, useRef, useState } from "react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { ChunkCache } from "@/widgets/volume-cube/chunk-cache";
import type { VolumeCommClient } from "@/widgets/volume-cube/volume-comm";

import { cutWindow, type CutWindow } from "../cube-cut";
import { INSPECT_WINDOW_UM, type EngineHandle } from "../engine";
import type { LandmarksModel } from "../use-landmarks-model";
import { FLOAT_PANEL, FLOAT_PANEL_CLIP } from "./sections";
import {
  clientToWorld,
  mapLayout,
  roundRectPath,
  toCanvasXY,
} from "./minimap-panel";
import { frameFromVolume, loadInspectOverview, type InspectOverview } from "./inspect-minimap-overview";

type Range = [number, number];

const MIN_HEIGHT_REM = 3.5;
const MAX_HEIGHT_REM = 11.5;
const WIDTH_REM = 11.5;

function drawInspectMinimap(
  canvas: HTMLCanvasElement,
  opts: {
    overview: ImageBitmap;
    xBounds: number[];
    yBounds: number[];
    viewport: WorldBounds | null;
    dark: boolean;
    squareAttrs: React.MutableRefObject<string>;
    cx: number | null;
    cy: number | null;
    sizeUm: number;
  },
) {
  const { overview, xBounds, yBounds, viewport, dark, squareAttrs, cx, cy, sizeUm } = opts;
  const cssW = canvas.clientWidth;
  const cssH = canvas.clientHeight;
  if (cssW < 2 || cssH < 2) return;
  const dpr = Math.min(globalThis.window.devicePixelRatio || 1, 2);
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

  const mapTop = layout.oy;
  const mapBottom = layout.oy + layout.mapH;
  const mapLeft = layout.ox;
  const mapRight = layout.ox + layout.mapW;
  ctx.save();
  ctx.beginPath();
  ctx.rect(mapLeft, mapTop, layout.mapW, layout.mapH);
  ctx.clip();
  ctx.drawImage(
    overview,
    mapLeft,
    mapTop,
    layout.mapW,
    layout.mapH,
  );
  ctx.restore();

  let square = "";
  if (viewport) {
    const [vx0, vy0, vx1, vy1] = viewport;
    const [a, b] = [toCanvasXY(vx0, vy0, layout), toCanvasXY(vx1, vy1, layout)];
    const left = Math.min(Math.max(Math.min(a[0], b[0]), mapLeft), mapRight);
    const right = Math.min(Math.max(Math.max(a[0], b[0]), mapLeft), mapRight);
    const top = Math.min(Math.max(Math.min(a[1], b[1]), mapTop), mapBottom);
    const bottom = Math.min(Math.max(Math.max(a[1], b[1]), mapTop), mapBottom);
    const rw = Math.max(0, right - left);
    const rh = Math.max(0, bottom - top);
    square = `${(left / dpr).toFixed(2)},${(top / dpr).toFixed(2)},${(rw / dpr).toFixed(2)},${(rh / dpr).toFixed(2)}`;
    if (rw > 0.5 && rh > 0.5) {
      const cssRadius = parseFloat(getComputedStyle(canvas).borderTopLeftRadius) || 0;
      const radius = Math.max(0, cssRadius * dpr);
      ctx.strokeStyle = dark ? "rgba(255, 255, 255, 0.92)" : "rgba(17, 17, 17, 0.88)";
      ctx.lineWidth = 1.5 * dpr;
      roundRectPath(ctx, left, top, rw, rh, radius);
      ctx.stroke();
      roundRectPath(ctx, left, top, rw, rh, radius);
      ctx.fillStyle = dark ? "rgba(255, 255, 255, 0.10)" : "rgba(17, 17, 17, 0.08)";
      ctx.fill();
    }
  }

  squareAttrs.current = square;
  canvas.dataset.cx = cx == null ? "" : String(cx);
  canvas.dataset.cy = cy == null ? "" : String(cy);
  canvas.dataset.size = String(sizeUm);
  canvas.dataset.square = square;
}

type WorldBounds = [number, number, number, number];

function inspectViewport(win: CutWindow): WorldBounds {
  return [win.x[0], win.y[0], win.x[1], win.y[1]];
}

export function InspectMinimapPanel({
  lm,
  engine,
  dark = false,
  volumeComm,
  chunkCache,
  volumeXY,
  onPan,
  onPanEnd,
}: {
  lm: LandmarksModel;
  engine: EngineHandle | null;
  dark?: boolean;
  volumeComm: VolumeCommClient | null;
  chunkCache: ChunkCache;
  volumeXY: { x: Range; y: Range } | null;
  onPan: (dxUm: number, dyUm: number) => void;
  onPanEnd: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const squareRef = useRef("");
  const [overview, setOverview] = useState<InspectOverview | null>(null);
  const overviewRef = useRef<InspectOverview | null>(null);
  overviewRef.current = overview;

  const sizeUm = lm.inspect_size_um || INSPECT_WINDOW_UM;
  const cx = lm.inspect_cx;
  const cy = lm.inspect_cy;
  const origin = lm.volume?.origin_um ?? [0, 0, 0];
  const win =
    cx != null && cy != null
      ? cutWindow(cx, cy, sizeUm, { x: origin[2], y: origin[1] }, volumeXY)
      : null;
  const viewport = cx != null && cy != null && win ? inspectViewport(win) : null;

  const aspect = overview?.aspect ?? 1;

  useEffect(() => {
    const url = lm.volume?.image_url;
    if (!url) return;
    let cancelled = false;
    const contrast = lm.volume?.contrast_limits ?? [0, 255];
    loadInspectOverview(url, frameFromVolume(lm.volume ?? {}), contrast, volumeComm, chunkCache)
      .then((o) => {
        if (!cancelled) setOverview(o);
      })
      .catch(() => {
        if (!cancelled) setOverview(null);
      });
    return () => {
      cancelled = true;
    };
  }, [lm.volume?.image_url, lm.volume?.contrast_limits, volumeComm, chunkCache]);

  const paint = useCallback(() => {
    const canvas = canvasRef.current;
    const o = overviewRef.current;
    if (!canvas) return;
    if (!o) {
      const dpr = Math.min(globalThis.window.devicePixelRatio || 1, 2);
      const cssW = canvas.clientWidth;
      const cssH = canvas.clientHeight;
      if (cssW >= 2 && cssH >= 2) {
        const w = Math.max(1, Math.round(cssW * dpr));
        const h = Math.max(1, Math.round(cssH * dpr));
        if (canvas.width !== w || canvas.height !== h) {
          canvas.width = w;
          canvas.height = h;
        }
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.clearRect(0, 0, w, h);
          ctx.fillStyle = dark ? "#141414" : "#e8e8e8";
          ctx.fillRect(0, 0, w, h);
        }
      }
      canvas.dataset.cx = cx == null ? "" : String(cx);
      canvas.dataset.cy = cy == null ? "" : String(cy);
      canvas.dataset.size = String(sizeUm);
      canvas.dataset.square = "";
      return;
    }
    drawInspectMinimap(canvas, {
      overview: o.bitmap,
      xBounds: o.xBounds,
      yBounds: o.yBounds,
      viewport,
      dark,
      squareAttrs: squareRef,
      cx,
      cy,
      sizeUm,
    });
  }, [viewport, dark, cx, cy, sizeUm]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const frame = frameRef.current;
    if (!canvas) return;
    paint();
    const ro = new ResizeObserver(() => paint());
    ro.observe(canvas);
    if (frame) ro.observe(frame);
    return () => ro.disconnect();
  }, [paint, overview]);

  useEffect(() => {
    paint();
  }, [paint]);

  const moveAt = useCallback(
    (clientX: number, clientY: number) => {
      if (!engine) return;
      const placed = engine.getInspectOverlay().placed;
      const x0 = placed?.[0] ?? lm.inspect_cx;
      const y0 = placed?.[1] ?? lm.inspect_cy;
      if (x0 == null || y0 == null) return;
      const canvas = canvasRef.current;
      const o = overviewRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const xBounds = o?.xBounds ?? volumeXY?.x ?? lm.x_bounds ?? [0, 1];
      const yBounds = o?.yBounds ?? volumeXY?.y ?? lm.y_bounds ?? [0, 1];
      const { x, y } = clientToWorld(clientX, clientY, rect, xBounds, yBounds);
      onPan(x - x0, y - y0);
    },
    [engine, lm.inspect_cx, lm.inspect_cy, lm.x_bounds, lm.y_bounds, volumeXY, onPan],
  );

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    dragging.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    moveAt(e.clientX, e.clientY);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dragging.current) return;
    moveAt(e.clientX, e.clientY);
  };

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (dragging.current) onPanEnd();
    dragging.current = false;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
  };

  const onWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const heightRem = Math.min(
    MAX_HEIGHT_REM,
    Math.max(MIN_HEIGHT_REM, WIDTH_REM / Math.max(aspect, 0.01)),
  );

  const body = (
    <div ref={frameRef} className="w-full" style={{ width: `${WIDTH_REM}rem` }}>
      <canvas
        ref={canvasRef}
        className="w-full cursor-grab active:cursor-grabbing rounded-[var(--lm-float-radius)] landmarks__inspect-minimap-canvas"
        style={{ height: `${heightRem}rem` }}
        data-testid="inspect-minimap-canvas"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={onWheel}
        aria-label="Minimap — drag to move Inspect"
      />
    </div>
  );

  return (
    <Card
      className={cn(FLOAT_PANEL, "landmarks-minimap-float shrink-0")}
      data-testid="inspect-minimap"
    >
      <div className={FLOAT_PANEL_CLIP}>
        <CardHeader className="sr-only">
          <CardDescription>Inspect minimap</CardDescription>
        </CardHeader>
        <CardContent className="p-0">{body}</CardContent>
      </div>
    </Card>
  );
}
