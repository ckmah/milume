import type React from "react";

import { X_COLOR, Y_COLOR, Z_COLOR } from "./frame-layers";
import { type CutAxis, type ProjectedCutFace, faceKey } from "./cut-faces";

type CutTuple = readonly [number, number, number, number, number, number];

const AXIS_RGB: Record<CutAxis, readonly number[]> = { x: X_COLOR, y: Y_COLOR, z: Z_COLOR };

export type CutPlatePhase = "rest" | "near" | "hover" | "drag";

function axisRgb(axis: CutAxis): string {
  const [r, g, b] = AXIS_RGB[axis];
  return `rgb(${r} ${g} ${b})`;
}

export function cutPlatePhase(key: string, hover: string, near: string, dragging: boolean): CutPlatePhase {
  if (dragging && hover === key) return "drag";
  if (hover === key) return "hover";
  if (near === key) return "near";
  return "rest";
}

function rangeLabel(cut: CutTuple, axis: CutAxis): string {
  const base = axis === "x" ? 0 : axis === "y" ? 2 : 4;
  return `${axis.toUpperCase()} ${Math.round(cut[base]!)}–${Math.round(cut[base + 1]!)} µm`;
}

/**
 * Axis-tinted plates on the grabbable cut faces. Pointer events pass through
 * to the view, which hits the plate interior. The white inset box stays in
 * `cutFrameLayers`.
 */
export function CutPlates({
  plates,
  hover,
  near,
  dragging,
  cut,
  width,
  height,
}: {
  plates: ProjectedCutFace[];
  hover: string;
  near: string;
  dragging: boolean;
  cut: CutTuple;
  width: number;
  height: number;
}) {
  const activeKey = dragging ? hover : hover || near;
  const active = plates.find((plate) => faceKey(plate.face) === activeKey);
  const chip = active
    ? {
        label: rangeLabel(cut, active.face.axis),
        left: Math.min(Math.max(8, active.center.x + 16), Math.max(8, width - 128)),
        top: Math.min(Math.max(8, active.center.y - 36), Math.max(8, height - 32)),
      }
    : null;
  return (
    <>
      <svg
        className="volume-cube__plates pointer-events-none absolute inset-0"
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        {[...plates]
          .sort((a, b) => a.toward - b.toward)
          .map((plate) => (
            <Plate
              key={faceKey(plate.face)}
              plate={plate}
              phase={cutPlatePhase(faceKey(plate.face), hover, near, dragging)}
            />
          ))}
      </svg>
      {chip ? (
        <div
          className="volume-cube__cut-range landmarks-float pointer-events-none absolute"
          data-cut-range=""
          style={{ left: chip.left, top: chip.top }}
        >
          {chip.label}
        </div>
      ) : null}
    </>
  );
}

function Plate({ plate, phase }: { plate: ProjectedCutFace; phase: CutPlatePhase }) {
  const points = plate.corners.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const showDir = phase !== "rest";
  const x2 = plate.center.x + plate.dir.x * 22;
  const y2 = plate.center.y + plate.dir.y * 22;
  return (
    <g
      data-cut-plate={faceKey(plate.face)}
      data-phase={phase}
      style={{ "--cut-plate": axisRgb(plate.face.axis) } as React.CSSProperties}
    >
      <polygon className="volume-cube__plate" points={points} />
      {showDir ? (
        <g className="volume-cube__plate-dir">
          <line x1={plate.center.x} y1={plate.center.y} x2={x2} y2={y2} />
          <circle cx={x2} cy={y2} r={2.4} />
        </g>
      ) : null}
    </g>
  );
}
