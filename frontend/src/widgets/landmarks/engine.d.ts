import type { CubeOverlay } from "@/widgets/volume-cube/overlay-layers";

/** The Inspect window's side (µm), fixed in X/Y (the engine's default). */
export const INSPECT_WINDOW_UM: number;

/**
 * Events from `subscribeInspect`; positions in µm, `px, py` in canvas pixels.
 * `sizeUm` is the fixed window side; `sizePx` its on-screen side at this zoom.
 */
export type InspectEvent =
  | { type: "place"; x: number; y: number }
  | { type: "release" }
  | { type: "hover"; x: number; y: number; sizeUm: number; sizePx: number; px: number; py: number }
  | { type: "hover-end" }
  | { type: "commit"; index: number }
  /** Esc in Inspect; `press` when it ended a press on the map (which then only ends). */
  | { type: "close"; press: boolean };

export type EngineHandle = {
  zoomBy(delta: number, opts?: { animate?: boolean; duration?: number }): void;
  resetZoom(): void;
  resize(): void;
  /** Pop the last landmark-geometry snapshot and restore it. Returns false if the stack is empty. */
  undoLandmarkEdit(): boolean;
  /** Reverse the focused landmark's vertex order (flips left/right buffer side for lines). */
  reverseSelectedLandmark(): void;
  /** Convert the focused landmark to a different type (point/line/spline/shape). */
  convertSelectedLandmark(type: string): void;
  /** Delete the currently active (clicked) vertex on the focused landmark, if any. */
  deleteActiveVertex(): boolean;
  /** Insert a vertex on a landmark edge (node-mode context menu). */
  insertVertexAt(
    landmarkIdx: number,
    afterIndex: number,
    xy: [number, number] | number[],
  ): boolean;
  setNodeInsertArmed(armed: boolean): void;
  getNodeInsertArmed(): boolean;
  getActiveVertexIndex(): number;
  getViewState(): {
    target?: number[];
    zoom?: number;
    minZoom?: number;
    maxZoom?: number;
    [key: string]: unknown;
  } | null;
  setViewState(
    partial: Record<string, unknown>,
    opts?: { animate?: boolean; duration?: number },
  ): void;
  subscribeViewState(fn: (viewState: Record<string, unknown>) => void): () => void;
  getViewportWorldBounds(): [number, number, number, number] | null;
  panTo(x: number, y: number, opts?: { animate?: boolean; duration?: number }): void;
  getSelectionOverlay(): Array<{
    index: number;
    selected: boolean;
    pointCount: number;
    lineWidth: number;
    lineAlpha: number;
  }>;
  benchNeighborhoodToggle(opts?: {
    seedCount: number;
    mode?: "knn" | "radius" | "off";
    k?: number;
    offFirst?: boolean;
  }): Promise<{
    ms: number;
    mode: string;
    seedCount: number;
    spatialIndexBuilt: boolean;
    hoodHighlightCount: number;
    edgeCount: number;
    knnEdgeLinesDrawn: boolean;
    neighborRoleCount: number;
    seedRoleCount: number;
  }>;
  profileNeighborhoodToggle(
    opts?: {
      seedCount: number;
      mode?: "knn" | "radius" | "off";
      k?: number;
      offFirst?: boolean;
    },
  ): Promise<{
    ms: number;
    measures: Array<{ name: string; duration: number }>;
  }>;
  getPerfSnapshot(): {
    spatialIndexBuilt: boolean;
    pointCount: number;
    hoodHighlightCount: number;
    pointRoleMode: boolean;
    usingBinaryScatterColors: boolean;
  };
  getNeighborhoodOverlay(): {
    mode: string;
    edgeCount: number;
    /** False when k-NN edges are suppressed for performance (neighbor coloring unchanged). */
    knnEdgeLinesDrawn: boolean;
    neighborRoleCount: number;
    seedRoleCount: number;
    /** Always 0 — stroked per-seed disks removed in favor of soft gradient. */
    radiusDiskCount: number;
    radiusGradient: boolean;
    gradientKind: "bitmap" | null;
    gradientSeedCount: number;
    gradientTextureSize: [number, number] | null;
    gradientBounds: [number, number, number, number] | null;
    /** r_max used for the distance-field bake; remap uses current radius. */
    gradientBakeRadius: number | null;
    radius: number;
    k: number;
  };
  getHover(): { kind: string; index: number } | null;
  subscribeHover(fn: (hover: { kind: string; index: number } | null) => void): () => void;
  subscribeLandmarkMenu(
    fn: (evt: {
      kind: "landmark";
      index: number;
      clientX: number;
      clientY: number;
      mode?: string;
      hit?: "vertex" | "edge" | "body";
      vertexIndex?: number;
      afterIndex?: number;
      insertX?: number | null;
      insertY?: number | null;
    }) => void,
  ): () => void;
  getInspectPin(): { kind: string; index: number } | null;
  /**
   * Inspect events: "place" on pointer down / drag (after `inspect_cx/cy` are set),
   * "hover" on hover moves and zoom, "hover-end" when the hover square goes,
   * "commit" when `saveInspect` creates an inspect Selection, "close" on Esc
   * (which also ends a press).
   */
  subscribeInspect(fn: (evt: InspectEvent) => void): () => void;
  /** Keep the placed square drawn outside Inspect while the cube is open. */
  setInspectWindowVisible(visible: boolean): void;
  /** Move the placed square (and `inspect_cx/cy/size_um`) without emitting events. */
  setInspectWindow(x: number, y: number, sizeUm: number): void;
  /** Move the placed square and `inspect_cx/cy` without saving or emitting; the caller saves. */
  moveInspectWindow(x: number, y: number): void;
  /**
   * Save the placed window as a new inspect Selection (its window, `volume_cut`
   * and the points in the square), focus it and emit "commit". Returns its index,
   * or null without a placed window or a 3D image.
   */
  saveInspect(): number | null;
  /**
   * The non-hidden landmarks as the map draws them: map (µm) coordinates,
   * splines and shapes sampled as on the map, each landmark's colour (RGBA bytes).
   */
  getLandmarkGeometry(): CubeOverlay[];
  /** Fires when the landmarks (or their visibility) change. */
  subscribeLandmarks(fn: () => void): () => void;
  /** The hover / placed square centres and sizes (µm); `sizeUm` is the fixed window side. */
  getInspectOverlay(): {
    hover: [number, number] | null;
    placed: [number, number] | null;
    sizeUm: number;
    placedSizeUm: number | null;
  };
  /** Test probe: `[x, y]` per point (µm, the `inspect_cx/cy` frame). */
  getPoints(): [number, number][];
  /**
   * Scatter points inside an Inspect window for the 3D cube: map µm position,
   * fill colour (RGBA bytes) and radius (µm), matching the 2D points layer.
   */
  getScatterPointsInWindow(
    cx: number,
    cy: number,
    sizeUm: number,
  ): {
    x: number;
    y: number;
    z?: number;
    color: [number, number, number, number];
    radius: number;
  }[];
  destroy(): void;
};

type AnyModel = {
  get(key: string): unknown;
  set(key: string, value: unknown): void;
  save_changes(): void;
  on(event: string, callback: () => void): void;
  off?(event: string, callback: () => void): void;
};

/** Mount the deck.gl drawing board into an empty plot-slot host. */
export function mountEngine(opts: {
  model: AnyModel;
  host: HTMLElement;
  /** Harness only: the Inspect window's side (µm), default 300. */
  inspectWindowUm?: number;
}): EngineHandle;
