import { COORDINATE_SYSTEM } from "@deck.gl/core";
import { ScatterplotLayer } from "@deck.gl/layers";
import type { Matrix4 } from "@math.gl/core";

import { vivTag } from "./overlay-layers";

/** One cell scatter point in map µm, coloured like the 2D layer. */
export type MapScatterPoint = {
  x: number;
  y: number;
  color: [number, number, number, number];
  radius: number;
};

export type PlacedScatterPoint = {
  position: [number, number, number];
  color: MapScatterPoint["color"];
  radius: number;
};

type Pt = [number, number];
type Rect = { x0: number; x1: number; y0: number; y1: number };

/**
 * Place scatter points in the cube's world: `toWorld` maps map µm to pre-model
 * x, y; `rect` is the window's box there; `z` is world z (mid-stack).
 */
export function placeScatterPoints(
  points: MapScatterPoint[],
  toWorld: (p: Pt) => Pt,
  rect: Rect,
  z: number,
): PlacedScatterPoint[] {
  const placed: PlacedScatterPoint[] = [];
  for (const p of points) {
    const [x, y] = toWorld([p.x, p.y]);
    if (x < rect.x0 || x > rect.x1 || y < rect.y0 || y > rect.y1) continue;
    placed.push({ position: [x, y, z], color: p.color, radius: p.radius });
  }
  return placed;
}

/** Deck layers for placed scatter points, drawn inside the volume frame. */
export function scatterPointLayers(
  points: PlacedScatterPoint[],
  modelMatrix: Matrix4,
  viewId = "3d",
) {
  if (!points.length) return [];
  return [
    new ScatterplotLayer<PlacedScatterPoint>({
      id: `cube-scatter-points${vivTag(viewId)}`,
      data: points,
      modelMatrix,
      coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
      getPosition: (d) => d.position,
      getFillColor: (d) => d.color,
      getRadius: (d) => d.radius,
      radiusUnits: "common",
      radiusMinPixels: 1.5,
      stroked: false,
      filled: true,
      billboard: true,
      pickable: false,
      parameters: { depthCompare: "less-equal" as const, depthWriteEnabled: true },
    }),
  ];
}
