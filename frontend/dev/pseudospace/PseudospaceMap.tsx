import { useEffect, useRef, useState, type PointerEvent } from "react";

import { divergingRgb, hitsLandmark, landmarkCentroid } from "./geometry";
import type { Field, Landmark, Scene } from "./types";

export type MapPointer = {
  landmarkId: string | null;
  cellIndex: number | null;
};

type Props = {
  scene: Scene;
  ordered: readonly Landmark[];
  field: Field | null;
  probeCell?: number | null;
  onPick?: (hit: MapPointer) => void;
  onHover?: (hit: MapPointer) => void;
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
  return { s, xOff: (width - dx * s) / 2 - x0 * s, yOff: (height - dy * s) / 2, y1 };
}

function toScreen(frame: Frame, x: number, y: number): [number, number] {
  return [frame.xOff + x * frame.s, frame.yOff + (frame.y1 - y) * frame.s];
}

function fromScreen(frame: Frame, sx: number, sy: number): [number, number] {
  return [(sx - frame.xOff) / frame.s, frame.y1 - (sy - frame.yOff) / frame.s];
}

function strokeLandmark(ctx: CanvasRenderingContext2D, frame: Frame, landmark: Landmark) {
  const vertices = landmark.vertices;
  if (!vertices.length) return;
  if (landmark.kind === "point") {
    const [sx, sy] = toScreen(frame, vertices[0].x, vertices[0].y);
    ctx.strokeRect(sx - 5, sy - 5, 10, 10);
    return;
  }
  ctx.beginPath();
  vertices.forEach((vertex, i) => {
    const [sx, sy] = toScreen(frame, vertex.x, vertex.y);
    if (i === 0) ctx.moveTo(sx, sy);
    else ctx.lineTo(sx, sy);
  });
  if (landmark.kind === "shape") ctx.closePath();
  ctx.stroke();
}

export function PseudospaceMap({ scene, ordered, field, probeCell = null, onPick, onHover }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<Frame | null>(null);
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));

  useEffect(() => {
    const sync = () => setDark(document.documentElement.classList.contains("dark"));
    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = ref.current;
    const parent = canvas?.parentElement;
    if (!canvas || !parent) return;
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
      const isDark = document.documentElement.classList.contains("dark");
      ctx.fillStyle = isDark ? "#141414" : "#e8e8e8";
      ctx.fillRect(0, 0, width, height);

      for (const cell of scene.cells) {
        const pos = field?.byIndex[cell.index];
        const [sx, sy] = toScreen(frame, cell.x, cell.y);
        if (field && pos && Number.isFinite(pos.value)) {
          const [r, g, b] = divergingRgb(pos.value, field.valueMax);
          ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
        } else {
          ctx.fillStyle = isDark ? "#8a8a8a" : "#5c5c5c";
        }
        ctx.fillRect(sx - 2.5, sy - 2.5, 5, 5);
      }

      const chosen = new Set(ordered.map((landmark) => landmark.id));
      ctx.lineWidth = 1.25;
      for (const landmark of scene.landmarks) {
        ctx.strokeStyle = chosen.has(landmark.id) ? "#3d7dff" : isDark ? "rgba(242,242,242,0.55)" : "rgba(26,26,26,0.45)";
        strokeLandmark(ctx, frame, landmark);
      }
      ordered.forEach((landmark, i) => {
        const at = landmarkCentroid(landmark);
        const [sx, sy] = toScreen(frame, at.x, at.y);
        ctx.fillStyle = isDark ? "#3a3a3a" : "#d6d6d6";
        ctx.strokeStyle = isDark ? "rgba(242,242,242,0.78)" : "rgba(26,26,26,0.78)";
        ctx.lineWidth = 1;
        ctx.fillRect(sx - 8, sy - 8, 16, 16);
        ctx.strokeRect(sx - 8, sy - 8, 16, 16);
        ctx.fillStyle = isDark ? "#f2f2f2" : "#1a1a1a";
        ctx.font = "11px IBM Plex Mono, ui-monospace, monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(String(i), sx, sy + 0.5);
      });

      if (probeCell != null) {
        const cell = scene.cells[probeCell];
        if (cell) {
          const [sx, sy] = toScreen(frame, cell.x, cell.y);
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
  }, [scene, ordered, field, probeCell, dark]);

  const hit = (event: PointerEvent<HTMLCanvasElement>): MapPointer => {
    const canvas = ref.current;
    const frame = frameRef.current;
    if (!canvas || !frame) return { landmarkId: null, cellIndex: null };
    const rect = canvas.getBoundingClientRect();
    const [x, y] = fromScreen(frame, event.clientX - rect.left, event.clientY - rect.top);
    const tolerance = 14 / frame.s;
    let landmarkIdHit: string | null = null;
    let bestLandmark = Infinity;
    for (const landmark of scene.landmarks) {
      if (!hitsLandmark(x, y, landmark, tolerance)) continue;
      const at = landmarkCentroid(landmark);
      const d = Math.hypot(at.x - x, at.y - y);
      if (d < bestLandmark) {
        bestLandmark = d;
        landmarkIdHit = landmark.id;
      }
    }
    let cellIndex: number | null = null;
    let bestCell = Infinity;
    for (const cell of scene.cells) {
      const d = Math.hypot(cell.x - x, cell.y - y);
      if (d < bestCell) {
        bestCell = d;
        cellIndex = cell.index;
      }
    }
    return { landmarkId: landmarkIdHit, cellIndex };
  };

  return (
    <canvas
      ref={ref}
      data-testid="pseudospace-map"
      className="absolute inset-0 h-full w-full"
      onPointerDown={(event) => onPick?.(hit(event))}
      onPointerMove={(event) => onHover?.(hit(event))}
    />
  );
}
