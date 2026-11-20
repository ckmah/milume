import { useEffect, useRef } from "react";

import { pointOnPath, tColor } from "./geometry";
import type { CellField, Field, Scene, Stop } from "./types";

export type MapPointer = {
  x: number;
  y: number;
  stopId: string | null;
  t: number | null;
};

type Props = {
  scene: Scene;
  ordered: readonly Stop[];
  field: Field | null;
  shade: "off" | "ramp" | "isolines" | "both";
  probeT?: number | null;
  onPointer?: (hit: MapPointer) => void;
};

type Frame = {
  s: number;
  xOff: number;
  yOff: number;
  y1: number;
};

function frameFor(scene: Scene, width: number, height: number): Frame {
  const pad = 28;
  const { x0, x1, y0, y1 } = scene.bounds;
  const dx = Math.max(1e-6, x1 - x0);
  const dy = Math.max(1e-6, y1 - y0);
  const s = Math.min((width - pad * 2) / dx, (height - pad * 2) / dy);
  return {
    s,
    xOff: (width - dx * s) / 2 - x0 * s,
    yOff: (height - dy * s) / 2,
    y1,
  };
}

function toScreen(frame: Frame, x: number, y: number): [number, number] {
  return [frame.xOff + x * frame.s, frame.yOff + (frame.y1 - y) * frame.s];
}

function fromScreen(frame: Frame, sx: number, sy: number): [number, number] {
  return [(sx - frame.xOff) / frame.s, frame.y1 - (sy - frame.yOff) / frame.s];
}

function isoline(
  ctx: CanvasRenderingContext2D,
  frame: Frame,
  a: Stop,
  b: Stop,
  f: number,
  span: number,
) {
  const ox = a.x + (b.x - a.x) * f;
  const oy = a.y + (b.y - a.y) * f;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const [x0, y0] = toScreen(frame, ox - nx * span, oy - ny * span);
  const [x1, y1] = toScreen(frame, ox + nx * span, oy + ny * span);
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
}

export function TransectMap({ scene, ordered, field, shade, probeT = null, onPointer }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<Frame | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    if (!parent) return;
    const draw = () => {
      const width = parent.clientWidth;
      const height = parent.clientHeight;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.floor(width * dpr));
      canvas.height = Math.max(1, Math.floor(height * dpr));
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const frame = frameFor(scene, width, height);
      frameRef.current = frame;
      const dark = document.documentElement.classList.contains("dark");
      ctx.fillStyle = dark ? "#141414" : "#e8e8e8";
      ctx.fillRect(0, 0, width, height);

      const showRamp = shade === "ramp" || shade === "both";
      const showLines = shade === "isolines" || shade === "both";
      for (const cell of scene.cells) {
        const pos: CellField | undefined = field?.byIndex[cell.index];
        const [sx, sy] = toScreen(frame, cell.x, cell.y);
        ctx.fillStyle = showRamp && field && pos ? tColor(pos.t, field.tMax) : dark ? "#8a8a8a" : "#5c5c5c";
        ctx.fillRect(sx - 2.5, sy - 2.5, 5, 5);
      }

      if (showLines && ordered.length >= 2) {
        const span = Math.max(scene.bounds.x1 - scene.bounds.x0, scene.bounds.y1 - scene.bounds.y0);
        ctx.strokeStyle = dark ? "rgba(242,242,242,0.55)" : "rgba(26,26,26,0.45)";
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 4]);
        for (let s = 0; s < ordered.length - 1; s++) {
          for (const f of [0.5]) {
            isoline(ctx, frame, ordered[s], ordered[s + 1], f, span);
          }
        }
        ctx.setLineDash([]);
      }

      if (ordered.length >= 2) {
        ctx.beginPath();
        ordered.forEach((stop, i) => {
          const [sx, sy] = toScreen(frame, stop.x, stop.y);
          if (i === 0) ctx.moveTo(sx, sy);
          else ctx.lineTo(sx, sy);
        });
        ctx.strokeStyle = "#3d7dff";
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      ordered.forEach((stop, i) => {
        const [sx, sy] = toScreen(frame, stop.x, stop.y);
        ctx.fillStyle = dark ? "#3a3a3a" : "#d6d6d6";
        ctx.strokeStyle = dark ? "rgba(242,242,242,0.78)" : "rgba(26,26,26,0.78)";
        ctx.lineWidth = 1;
        ctx.fillRect(sx - 8, sy - 8, 16, 16);
        ctx.strokeRect(sx - 8, sy - 8, 16, 16);
        ctx.fillStyle = dark ? "#f2f2f2" : "#1a1a1a";
        ctx.font = "11px IBM Plex Mono, ui-monospace, monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(String(i + 1), sx, sy + 0.5);
      });

      if (probeT != null && ordered.length >= 2) {
        const at = pointOnPath(ordered, probeT);
        if (at) {
          const [sx, sy] = toScreen(frame, at.x, at.y);
          ctx.strokeStyle = "#3d7dff";
          ctx.lineWidth = 1.5;
          ctx.strokeRect(sx - 7, sy - 7, 14, 14);
        }
      }
    };
    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(parent);
    return () => observer.disconnect();
  }, [scene, ordered, field, shade, probeT]);

  return (
    <canvas
      ref={ref}
      data-testid="transect-map"
      className="absolute inset-0 h-full w-full"
      onPointerDown={(event) => {
        const canvas = ref.current;
        const frame = frameRef.current;
        if (!canvas || !frame || !onPointer) return;
        const rect = canvas.getBoundingClientRect();
        const [x, y] = fromScreen(frame, event.clientX - rect.left, event.clientY - rect.top);
        let stopId: string | null = null;
        let best = 14 / frame.s;
        for (const stop of ordered.length ? ordered : scene.stops) {
          const d = Math.hypot(stop.x - x, stop.y - y);
          if (d < best) {
            best = d;
            stopId = stop.id;
          }
        }
        let t: number | null = null;
        if (field && ordered.length >= 2) {
          let nearest = Infinity;
          for (const cell of scene.cells) {
            const d = Math.hypot(cell.x - x, cell.y - y);
            const pos = field.byIndex[cell.index];
            if (pos && d < nearest) {
              nearest = d;
              t = pos.t;
            }
          }
        }
        onPointer({ x, y, stopId, t });
      }}
    />
  );
}
