import { COORDINATE_SYSTEM } from "@deck.gl/core";
import { LineLayer, TextLayer } from "@deck.gl/layers";
import type { Matrix4 } from "@math.gl/core";
import { VolumeView } from "@hms-dbmi/viv";

/**
 * Wireframe and axes around the loaded window, drawn in Viv's own deck.
 *
 * Positions are in the volume's pre-model world units (Viv scales voxels so one
 * unit is one X voxel of the chosen level) and share the volume's modelMatrix,
 * so the frame tilts and spins with it. Viv's texture stores Y rows reversed, so
 * world y runs opposite to data y: data row 0 (the window's top edge on the
 * map) sits at world y = height.
 */
export type CubeFrame = {
  /** Box size in pre-model world units: x, y (already scaled by ry), z (by rz). */
  size: [number, number, number];
  /** Micrometres per world unit (the level's X voxel size). */
  umPerUnit: number;
  /** Absolute Z (um) of the box floor, for the Z tick labels. */
  zOriginUm: number;
  dark: boolean;
};

type Segment = { from: number[]; to: number[]; color: number[] };
type Tick = { position: number[]; text: string; color: number[]; size: number };

const X_COLOR = [239, 68, 68];
const Y_COLOR = [34, 197, 94];
const Z_COLOR = [59, 130, 246];

function niceStep(extent: number, target = 4): number {
  const raw = extent / target;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const unit = [1, 2, 5, 10].find((m) => m * pow >= raw) ?? 10;
  return unit * pow;
}

function ticks(lengthUm: number): number[] {
  // An empty or degenerate axis (window outside the volume) has one tick; a zero
  // step would otherwise loop forever and take the page down with it.
  if (!(lengthUm > 0) || !Number.isFinite(lengthUm)) return [0];
  const step = niceStep(lengthUm);
  if (!(step > 0)) return [0];
  const out: number[] = [];
  for (let t = 0; t <= lengthUm + 1e-6; t += step) out.push(Math.round(t * 1000) / 1000);
  return out;
}

/** VivViewer only draws layers whose id carries their view's tag (Viv's getVivId). */
function vivTag(viewId: string): string {
  return `-#${viewId}#`;
}

export function frameLayers(frame: CubeFrame, modelMatrix: Matrix4, viewId = "3d") {
  const [w, h, d] = frame.size;
  const u = frame.umPerUnit;
  const edge = frame.dark ? [148, 163, 184, 150] : [71, 85, 105, 170];
  const c = [
    [0, 0, 0],
    [w, 0, 0],
    [w, h, 0],
    [0, h, 0],
    [0, 0, d],
    [w, 0, d],
    [w, h, d],
    [0, h, d],
  ];
  const pairs = [
    [0, 1], [1, 2], [2, 3], [3, 0],
    [4, 5], [5, 6], [6, 7], [7, 4],
    [0, 4], [1, 5], [2, 6], [3, 7],
  ];
  const segments: Segment[] = pairs.map(([a, b]) => ({ from: c[a]!, to: c[b]!, color: edge }));
  // Axes from the corner at the map's top-left, floor: +x right, +y down the map, +z up.
  const origin = [0, h, 0];
  segments.push(
    { from: origin, to: [w, h, 0], color: [...X_COLOR, 230] },
    { from: origin, to: [0, 0, 0], color: [...Y_COLOR, 230] },
    { from: origin, to: [0, h, d], color: [...Z_COLOR, 230] },
  );

  const pad = Math.max(w, h, d) * 0.04;
  const labels: Tick[] = [];
  for (const t of ticks(w * u)) labels.push({ position: [t / u, h + pad, -pad], text: `${t}`, color: X_COLOR, size: 10 });
  for (const t of ticks(h * u)) labels.push({ position: [-pad, h - t / u, -pad], text: `${t}`, color: Y_COLOR, size: 10 });
  for (const t of ticks(d * u))
    labels.push({ position: [-pad, h + pad, t / u], text: `${Math.round(frame.zOriginUm + t)}`, color: Z_COLOR, size: 10 });
  labels.push(
    { position: [w + 3 * pad, h + pad, -pad], text: "x µm", color: X_COLOR, size: 12 },
    { position: [-pad, -3 * pad, -pad], text: "y µm", color: Y_COLOR, size: 12 },
    { position: [-pad, h + pad, d + 3 * pad], text: "z µm", color: Z_COLOR, size: 12 },
  );

  const shared = { modelMatrix, coordinateSystem: COORDINATE_SYSTEM.CARTESIAN, pickable: false };
  return [
    new LineLayer<Segment>({
      ...shared,
      id: `cube-frame-lines${vivTag(viewId)}`,
      data: segments,
      getSourcePosition: (s) => s.from as [number, number, number],
      getTargetPosition: (s) => s.to as [number, number, number],
      getColor: (s) => s.color as [number, number, number, number],
      getWidth: 1.25,
      widthUnits: "pixels",
    }),
    new TextLayer<Tick>({
      ...shared,
      id: `cube-frame-labels${vivTag(viewId)}`,
      data: labels,
      getPosition: (t) => t.position as [number, number, number],
      getText: (t) => t.text,
      getColor: (t) => [...t.color, 255] as [number, number, number, number],
      getSize: (t) => t.size,
      sizeUnits: "pixels",
      billboard: true,
      fontFamily: "ui-sans-serif, system-ui, sans-serif",
      // The default ASCII atlas has no "µ".
      characterSet: "auto",
      getTextAnchor: "middle",
      getAlignmentBaseline: "center",
      // Labels stay legible when the volume sits between them and the camera.
      parameters: { depthCompare: "always" },
    }),
  ];
}

/** Viv's VolumeView plus the frame, so both share one deck and one camera. */
export class FramedVolumeView extends VolumeView {
  getLayers({ props }: { props: Record<string, unknown> }) {
    // Viv's typings omit getLayers on VolumeView; it exists at runtime.
    const layers = (VolumeView.prototype as unknown as { getLayers: (a: unknown) => unknown[] }).getLayers.call(
      this,
      { props },
    );
    const frame = props.cubeFrame as CubeFrame | undefined;
    if (!frame) return layers;
    // The frame marks the requested window: it keeps its place while a loaded
    // window pans under it (`frameMatrix`), and otherwise shares the volume's.
    const matrix = (props.frameMatrix ?? props.modelMatrix) as Matrix4;
    return [...layers, ...frameLayers(frame, matrix, (this as unknown as { id: string }).id)];
  }
}
