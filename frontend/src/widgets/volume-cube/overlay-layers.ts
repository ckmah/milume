import { COORDINATE_SYSTEM } from "@deck.gl/core";
import { PathLayer, ScatterplotLayer } from "@deck.gl/layers";
import type { Matrix4 } from "@math.gl/core";

/**
 * 2D map geometry (the user's landmarks) drawn on the cube's top face, for
 * context. Coordinates are map µm, the same frame as the Inspect window.
 */
export type CubeOverlay = {
  kind: "path" | "point";
  coords: [number, number][];
  closed: boolean;
  /** RGBA bytes. */
  color: [number, number, number, number];
};

/** Overlay pieces clipped to the window, in the cube's pre-model world units. */
export type PlacedOverlays = {
  paths: { path: [number, number, number][]; color: CubeOverlay["color"] }[];
  points: { position: [number, number, number]; color: CubeOverlay["color"] }[];
  /** Features with anything left inside the window. */
  count: number;
};

type Pt = [number, number];
type Rect = { x0: number; x1: number; y0: number; y1: number };

/** Liang–Barsky: the part of segment a→b inside `r`, or null. */
export function clipSegment(a: Pt, b: Pt, r: Rect): [Pt, Pt] | null {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  let t0 = 0;
  let t1 = 1;
  const edges: [number, number][] = [
    [-dx, a[0] - r.x0],
    [dx, r.x1 - a[0]],
    [-dy, a[1] - r.y0],
    [dy, r.y1 - a[1]],
  ];
  for (const [p, q] of edges) {
    if (p === 0) {
      if (q < 0) return null;
      continue;
    }
    const t = q / p;
    if (p < 0) {
      if (t > t1) return null;
      if (t > t0) t0 = t;
    } else {
      if (t < t0) return null;
      if (t < t1) t1 = t;
    }
  }
  return [
    [a[0] + t0 * dx, a[1] + t0 * dy],
    [a[0] + t1 * dx, a[1] + t1 * dy],
  ];
}

/** A polyline cut to `r`: the runs of consecutive segments that stay inside. */
export function clipPolyline(coords: Pt[], r: Rect): Pt[][] {
  const out: Pt[][] = [];
  let run: Pt[] | null = null;
  for (let i = 1; i < coords.length; i++) {
    const piece = clipSegment(coords[i - 1]!, coords[i]!, r);
    if (!piece) {
      run = null;
      continue;
    }
    const [p, q] = piece;
    const last = run?.[run.length - 1];
    if (run && last && last[0] === p[0] && last[1] === p[1]) run.push(q);
    else {
      run = [p, q];
      out.push(run);
    }
  }
  return out;
}

/**
 * Place overlays in the cube's world: `toWorld` maps a map point (µm) to the
 * pre-model x, y (see VolumeCube); `rect` is the window's box there, and `top`
 * the stack's top face (pre-model z).
 */
export function placeOverlays(
  overlays: CubeOverlay[],
  toWorld: (p: Pt) => Pt,
  rect: Rect,
  top: number,
): PlacedOverlays {
  const placed: PlacedOverlays = { paths: [], points: [], count: 0 };
  for (const o of overlays) {
    const world = o.coords.map(toWorld);
    if (o.kind === "point") {
      const inside = world.filter(([x, y]) => x >= rect.x0 && x <= rect.x1 && y >= rect.y0 && y <= rect.y1);
      for (const [x, y] of inside) placed.points.push({ position: [x, y, top], color: o.color });
      if (inside.length) placed.count++;
      continue;
    }
    const line = o.closed && world.length > 2 ? [...world, world[0]!] : world;
    const runs = clipPolyline(line, rect);
    for (const run of runs) placed.paths.push({ path: run.map(([x, y]) => [x, y, top]), color: o.color });
    if (runs.length) placed.count++;
  }
  return placed;
}

/** VivViewer only draws layers whose id carries their view's tag (Viv's getVivId). */
export function vivTag(viewId: string): string {
  return `-#${viewId}#`;
}

/** Deck layers for placed overlays: pixel widths, drawn over the volume (no depth test). */
export function overlayLayers(placed: PlacedOverlays, modelMatrix: Matrix4, viewId = "3d") {
  const shared = {
    modelMatrix,
    coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
    pickable: false,
    parameters: { depthCompare: "always" as const, depthWriteEnabled: false },
  };
  const layers = [];
  if (placed.paths.length) {
    layers.push(
      new PathLayer<PlacedOverlays["paths"][number]>({
        ...shared,
        id: `cube-overlay-paths${vivTag(viewId)}`,
        data: placed.paths,
        getPath: (d) => d.path,
        getColor: (d) => d.color,
        getWidth: 2,
        widthUnits: "pixels",
        billboard: true,
        jointRounded: true,
        capRounded: true,
      }),
    );
  }
  if (placed.points.length) {
    layers.push(
      new ScatterplotLayer<PlacedOverlays["points"][number]>({
        ...shared,
        id: `cube-overlay-points${vivTag(viewId)}`,
        data: placed.points,
        getPosition: (d) => d.position,
        getFillColor: (d) => d.color,
        getRadius: 3,
        radiusUnits: "pixels",
        billboard: true,
      }),
    );
  }
  return layers;
}
