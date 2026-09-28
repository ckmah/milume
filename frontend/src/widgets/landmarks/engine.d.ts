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
  getNeighborhoodOverlay(): {
    mode: string;
    edgeCount: number;
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
  /** Inspect placements: "place" on pointer down / drag, "close" on Esc in Inspect. */
  subscribeInspect(fn: (evt: { type: "place" | "close"; x?: number; y?: number }) => void): () => void;
  /** Keep the placed square drawn outside Inspect while the cube is open. */
  setInspectWindowVisible(visible: boolean): void;
  /** Test probe: { hover: [x, y] | null, placed: [x, y] | null }. */
  getInspectOverlay(): { hover: number[] | null; placed: number[] | null };
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
}): EngineHandle;
