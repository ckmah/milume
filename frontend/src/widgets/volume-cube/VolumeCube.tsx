import type React from "react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Matrix4 } from "@math.gl/core";
import { VivViewer } from "@hms-dbmi/viv";
import { loadVolumePyramid } from "./load-volume-pyramid";

import { ChromeLoadIndicator } from "@/widgets/landmarks/chrome/load-indicator";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

import type { ChunkCache } from "./chunk-cache";
import type { VolumeCommClient } from "./volume-comm";
import { contentZIndexSpan, type ContentZSpan } from "./content-z-span";
import {
  CUBE_EXTENSIONS,
  CUBE_EXTENSIONS_MULTI,
  type CellColoring,
  type HighlightGroup,
  type RenderSettings,
  setCubeTraitContrast,
} from "./cell-lut-extension";
import {
  type CutFace,
  cutBoxPre,
  cutFractions,
  cutFractionsForSlices,
  cutIsOpen,
  cutPointerTarget,
  umZToWorldHeight,
  dragToFaceDelta,
  moveCutEdge,
} from "./cut-faces";
import { VolumeCubeCutChrome, type VolumeCubeCutChromeHandle } from "./cut-hover-chrome";
import { AxisLegend } from "./axis-legend";
import type { ImageFormat } from "./image-volume";
import { type MapScatterPoint, placeScatterPoints } from "./cube-points";
import { type CubeFrame, FramedVolumeView, labelPad } from "./frame-layers";
import type { Range, ViewPreset } from "./CubeControls";
import {
  CELL_MESH_LIGHTING,
  type CellMeshData,
  DEFAULT_MESH_LOOK,
  type MeshLook,
  type PlacedCellMesh,
  boostedImage,
  cellMeshGeometry,
  cellMeshLut,
  cellMeshMatrix,
} from "./cell-mesh";
import { cellMeshClipBox } from "./cell-mesh-clip";
import { type CellPolygons, cellMeshBuilder } from "./cell-mesh-source";
import { type CubeOverlay, placeOverlays } from "./overlay-layers";
import { CUBE_LABEL_CELLS_SETTLE_MS } from "./cube-settled";
import { paletteLut } from "./palettes";
import { tintPalette } from "./tint-palette";
import { cubeImageChannels, type CubeImageChannel } from "./image-channels";
import type { ImageChannelRow } from "@/widgets/landmarks/use-landmarks-model";
import { dragToWindowDelta } from "./pan";
import { type WindowTarget, levelVoxelSize, useShownWindow } from "./use-shown-window";
import {
  type Box,
  type Frame,
  type Level,
  type ZarrSource,
  WINDOW_VOXEL_BUDGET,
  axisSize,
  boxIsEmpty,
  fitsBudget,
  levelBox,
  pickLevel,
  pyramidLevels,
  regionBox,
  clampLiveBoxInsideShown,
  windowBox,
} from "./window-source";

/** x0, x1, y0, y1, z0, z1 in µm. */
export type CubeCut = [number, number, number, number, number, number];

export type CubeLoadState = {
  /** The cell meshes: off (Labels off or no polygons), building the window, shown, or failed. */
  labels: "off" | "loading" | "on" | "error";
  pan: [number, number];
  /** The displayed level. */
  level: number;
  /** A coarser level is shown while the target level loads. */
  refining: boolean;
  /** Set when the target level failed and the coarse view stays: `Could not refine: <message>`. */
  refineError?: string;
  /** Set when the image (or its window, with no coarse view to keep) failed to load. */
  imageError?: string;
  /** The window holds none of the volume: nothing loads, nothing is drawn. */
  outside: boolean;
};

export type CubeBounds = {
  /** The window clamped to the volume (µm). */
  winX: [number, number];
  winY: [number, number];
  stackZ: [number, number];
  /** The volume's XY extent (µm). */
  volumeX: [number, number];
  volumeY: [number, number];
  contrastMax: number;
};

export type VolumeCubeProps = {
  imageUrl: string;
  /** The per-slice cell polygons in the store, read over `volumeComm`; null draws no cells. */
  cellPolygons?: CellPolygons | null;
  /** Each polygon cell's table row (-1: none), in the polygons' cell order. */
  cellRows?: Int32Array | null;
  /** z, y, x */
  voxelSizeUm: [number, number, number];
  originUm: [number, number, number];
  windowCx: number;
  windowCy: number;
  windowSizeUm: number;
  /** Shown cut (already the live value); clamped to the window and the stack here. */
  cut: CubeCut;
  contrast: [number, number];
  /** When set, per-channel contrast, visibility, and tints follow `_image_channels`. */
  imageChannelRows?: ImageChannelRow[];
  /** Default "additive": the image's samples accumulate; "mip": its maximum along each ray. */
  imageMode?: "additive" | "mip";
  /**
   * Applied when it changes: the preset's rotation (framed as its home view with
   * `reframeOnPreset`). The first view is this preset when set, else `home`.
   */
  preset: ViewPreset | null;
  /** The home view (Reset, and the first view with no preset). Default "iso". */
  home?: ViewPreset;
  /** Default false: a preset keeps the user's zoom. True frames the window as the preset's home view. */
  reframeOnPreset?: boolean;
  /** Bump to reset the camera to the home view. */
  resetTick: number;
  /** Default true. False: the raycast adds no image signal; cells still draw (both off: an empty frame). */
  showImage?: boolean;
  showLabels: boolean;
  coloring: CellColoring;
  /** `cellAlpha` is the meshes' peak opacity. */
  render: RenderSettings;
  /** The rest of the meshes' look; default DEFAULT_MESH_LOOK. */
  meshLook?: Partial<MeshLook>;
  dark: boolean;
  /** Default 520 (px). */
  height?: number | string;
  onLoadState?: (s: CubeLoadState) => void;
  onBounds?: (b: CubeBounds) => void;
  /** The preset the camera matches, or null after orbiting away from all of them. */
  onPreset?: (p: ViewPreset | null) => void;
  /** Voxels the target window may load. Default WINDOW_VOXEL_BUDGET. */
  budget?: number;
  /** Load a region around the window instead (preview): its centre, and its side as `scale` × the window. */
  region?: { scale: number; budget: number; cx: number; cy: number } | null;
  /** Show a coarse level first (dock): the level `pickLevel(levels, frame, size * scale, budget)`. */
  coarse?: { scale: number; budget: number } | null;
  /** Default true; false leaves the camera fixed (no controller). */
  interactive?: boolean;
  /** Default true: the category Badge legend over the canvas. */
  showLegend?: boolean;
  /** Default true: the dark view background. False leaves the view transparent (the preview). */
  background?: boolean;
  /** Map geometry (µm) drawn on the stack's top face, clipped to the window. */
  overlays?: CubeOverlay[] | null;
  /** Cell scatter points (map µm) drawn inside the volume when `showPoints`. */
  scatterPoints?: MapScatterPoint[] | null;
  /** Default false. True: draw `scatterPoints` in the cube (the 2D points layer). */
  showPoints?: boolean;
  /** Decoded chunks shared across the widget's cubes. */
  chunkCache?: ChunkCache | null;
  /** Comm-backed zarr reads when ``imageUrl`` is a store prefix (not HTTP). */
  volumeComm?: VolumeCommClient | null;
  /** Hold the cache's background prefetch while this cube's target loads. */
  pausesPrefetch?: boolean;
  /** Called after each deck render. */
  onRendered?: (canvas: HTMLCanvasElement) => void;
  /** Harness evidence: live `__volumeCubeRenderCount` readout (immersive cube only). */
  renderCountOverlay?: boolean;
  /** Called when the image pyramid opens. */
  onLevels?: (image: ZarrSource[]) => void;
  /** Called when the shown window changes: its level index and voxel box. */
  onShown?: (level: number, box: Box) => void;
  /** The Move tool: a plain left drag pans (with `onPan`) instead of orbiting. Default false. */
  panMode?: boolean;
  /**
   * Set to let a left drag with Shift held (or any left drag with `panMode`) pan:
   * called per pointer move with the window centre's move (µm, +y down the map)
   * that keeps the tissue under the pointer. The orbit controller never sees it.
   */
  onPan?: (dxUm: number, dyUm: number) => void;
  /** The pan's release (or cancel). */
  onPanEnd?: () => void;
  /**
   * Set to drag the volume's faces: a press on a face outline moves that cut
   * edge (µm, live), and the release commits it. The face interior still orbits.
   */
  onCutLive?: (cut: CubeCut) => void;
  onCutCommit?: (cut: CubeCut) => void;
  /** Display only this fraction of the loaded z stack [lo, hi], default [0, 1]. */
  zStackFraction?: readonly [number, number];
  /** When true (default), shrink z to planes with image signal above contrast min. */
  tightenZToSignal?: boolean;
  /** `data-testid` on the load / error overlay (immersive vs preview differ). */
  loadStatusTestId?: string;
};

type ViewState = {
  id: string;
  target: number[];
  zoom: number;
  rotationX: number;
  rotationOrbit: number;
  minZoom: number;
  maxZoom: number;
  minRotationX: number;
  maxRotationX: number;
};

const ISO_PITCH = 35;
/** Camera tilt runs from 45° below level (looking slightly up) to straight down (90°). */
const MIN_PITCH = -45;
const MAX_PITCH = 90;
const PRESETS: Record<ViewPreset, { rotationX: number; rotationOrbit: number }> = {
  // Orbit 0 from above shows x right and y down, the same as the Landmarks map.
  top: { rotationX: 90, rotationOrbit: 0 },
  iso: { rotationX: ISO_PITCH, rotationOrbit: 45 },
  side: { rotationX: 0, rotationOrbit: 0 },
};
/** The iso home backs off its footprint; top and side fit their near face, so less. */
const HOME_ZOOM_BACKOFF: Record<ViewPreset, number> = { iso: 0.3, top: 0.1, side: 0.1 };
/** Viv's VolumeView is deck's OrbitView at its default field of view (degrees). */
const FOVY = 50;
const NO_GROUPS: HighlightGroup[] = [];
/** Coalesce the separate window_cx / window_cy updates of one inspect click. */
const WINDOW_DEBOUNCE_MS = 120;
const VOLUME_LOAD_TIMEOUT_MS = 60_000;

/**
 * Tissue Z points up the screen. Viv's orbit view spins about world Y, so rotating
 * data Z onto world Y makes the orbit a turntable around the stack and Z slicing
 * cut horizontal slabs: (x, y, z) -> (x, z, -y).
 */
const Z_UP = new Matrix4().rotateX(-Math.PI / 2);

export function clampRange(lo: number, hi: number, min: number, max: number): [number, number] {
  const a = Math.max(min, Math.min(lo, hi));
  // A range wholly outside [min, max] collapses to empty rather than inverting.
  return [a, Math.max(a, Math.min(max, Math.max(lo, hi)))];
}

/**
 * Slice ends in the units Viv's scale matrix uses.
 *
 * Viv turns a voxel index into a 0–1 ray coordinate by dividing by
 * `shape * (voxel / smallestVoxel)`. Passing raw indices leaves a taller axis
 * short of the wireframe (Pyxa Z is 0.5 µm against 0.46 µm XY, about 9%).
 */
export function vivAxisSlice(slice: readonly [number, number], voxel: number, minVoxel: number): [number, number] {
  const scale = minVoxel > 0 ? voxel / minVoxel : 1;
  return [slice[0] * scale, slice[1] * scale];
}

function viewStatesEqual(a: ViewState, b: ViewState): boolean {
  return (
    a.zoom === b.zoom &&
    a.rotationOrbit === b.rotationOrbit &&
    a.rotationX === b.rotationX &&
    a.target[0] === b.target[0] &&
    a.target[1] === b.target[1] &&
    a.target[2] === b.target[2]
  );
}

/**
 * What a preset's view has to fit, in world units at the target: its screen
 * width and height, and how far the face nearest the camera sits in front of
 * the target (the perspective camera shows that face larger). `marginPx` keeps
 * that many px clear on each side (room for label text).
 */
type Fit = { width: number; height: number; near: number; marginPx?: number };

/** Deck's orbit camera distance, in viewport heights (math.gl `fovyToAltitude`). */
const ALTITUDE = 0.5 / Math.tan(((FOVY / 2) * Math.PI) / 180);

/**
 * The largest zoom at which every fit fits the view. One world unit at the target
 * is 2^zoom px, and a face `near` units closer is magnified by F / (F - near·2^zoom/H).
 */
function fitZoom(fits: Fit[], view: { width: number; height: number }): number {
  const zoom = (fit: Fit) => {
    const m = 2 * (fit.marginPx ?? 0);
    const scale = (extent: number, side: number) =>
      ((side - m) * ALTITUDE) / (extent * ALTITUDE + ((side - m) * fit.near) / view.height);
    return Math.log2(Math.min(scale(fit.width, view.width), scale(fit.height, view.height)));
  };
  return Math.min(...fits.map(zoom));
}

/** The home camera for `preset`, framing the inspect window (the window source's world units). */
function homeView(
  preset: ViewPreset,
  fits: Record<ViewPreset, Fit[]>,
  view: { width: number; height: number },
): ViewState {
  const zoom = fitZoom(fits[preset], view) - HOME_ZOOM_BACKOFF[preset];
  return {
    id: "3d",
    target: [0, 0, 0],
    zoom,
    ...PRESETS[preset],
    minZoom: zoom - 2,
    maxZoom: zoom + 5,
    minRotationX: MIN_PITCH,
    maxRotationX: MAX_PITCH,
  };
}

function presetOf(vs: ViewState | null): ViewPreset | null {
  if (!vs) return null;
  for (const [name, p] of Object.entries(PRESETS) as [ViewPreset, (typeof PRESETS)["top"]][]) {
    const orbit = ((vs.rotationOrbit % 360) + 360) % 360;
    if (Math.abs(vs.rotationX - p.rotationX) < 0.5 && Math.abs(orbit - p.rotationOrbit) < 0.5) return name;
  }
  return null;
}

function useDebounced<T>(value: T, ms: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return settled;
}

/** Latest value of a callback prop, so effects that call it need not depend on its identity. */
function useLatest<T>(value: T) {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}

/**
 * The Viv volume cube for one inspect window: loads the OME-Zarr image, fetches
 * the window's voxels and draws them with the cube shader, and the window's cells
 * as meshes built from their polygons. Everything it shows comes from props; it reports what it loaded,
 * the ranges its cuts can take and the camera preset back through callbacks.
 */
export function VolumeCube({
  imageUrl,
  cellPolygons = null,
  cellRows = null,
  voxelSizeUm,
  originUm,
  windowCx: window_cx,
  windowCy: window_cy,
  windowSizeUm: window_size_um,
  cut,
  contrast,
  imageChannelRows,
  imageMode = "additive",
  preset,
  home = "iso",
  reframeOnPreset = false,
  resetTick,
  showImage = true,
  showLabels,
  coloring,
  render,
  meshLook: meshLookProp,
  dark,
  height = 520,
  onLoadState,
  onBounds,
  onPreset,
  budget = WINDOW_VOXEL_BUDGET,
  region = null,
  coarse = null,
  interactive = true,
  showLegend = true,
  background = true,
  overlays = null,
  scatterPoints = null,
  showPoints = false,
  chunkCache = null,
  volumeComm = null,
  pausesPrefetch = false,
  onRendered,
  renderCountOverlay = false,
  onLevels,
  onShown,
  panMode = false,
  onPan,
  onPanEnd,
  onCutLive,
  onCutCommit,
  zStackFraction,
  tightenZToSignal = true,
  loadStatusTestId = "cube-load-panel",
}: VolumeCubeProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const fixedHeight = typeof height === "number";
  const [box, setBox] = useState({ width: 640, height: 520 });
  /** Canvas size in CSS px (for deck-aligned cut-plate projection). */
  const [viewPixelSize, setViewPixelSize] = useState({ width: 640, height: 520 });
  const [image, setImage] = useState<ZarrSource[] | null>(null);
  const [error, setError] = useState("");
  const [volumeChannelSums, setVolumeChannelSums] = useState("");
  const [viewState, setViewState] = useState<ViewState | null>(null);
  /** Pan must not drift the cube; the window moves the content instead. */
  const fixedTargetRef = useRef<number[] | null>(null);

  useEffect(() => {
    const node = hostRef.current;
    if (!node) return;
    // ResizeObserver already runs after layout and before paint, so apply the
    // size in its callback. Deferring to the next animation frame costs one
    // full cube frame, which is long when the volume ray-marches in software GL.
    const apply = () => {
      const rect = node.getBoundingClientRect();
      // Hidden (display: none): keep the last size.
      if (!rect.width || !rect.height) return;
      // Match the host's laid-out box (molab cells can be narrower than preview floors).
      const width = Math.max(1, Math.round(rect.width));
      const height = Math.max(1, Math.round(rect.height));
      setBox((prev) => (prev.width === width && prev.height === height ? prev : { width, height }));
      setViewPixelSize((prev) =>
        prev.width === rect.width && prev.height === rect.height ? prev : { width: rect.width, height: rect.height },
      );
    };
    const obs = new ResizeObserver(apply);
    obs.observe(node);
    return () => obs.disconnect();
  }, [fixedHeight]);

  useEffect(() => {
    let cancelled = false;
    setError("");
    setImage(null);
    setViewState(null);
    if (!imageUrl) return;
    (async () => {
      try {
        const hook =
          typeof window !== "undefined"
            ? (window as unknown as { __volumeCubeLoadHook?: { abortImage?: boolean; delayMs?: number } })
                .__volumeCubeLoadHook
            : undefined;
        if (hook?.abortImage) {
          throw new Error("Volume load failed (test)");
        }
        if (hook?.delayMs && hook.delayMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, hook.delayMs));
        }
        const pyramid = await loadVolumePyramid(imageUrl, volumeComm);
        const base = pyramid[0]!;
        const multichannel = axisSize(base, "c") > 1;
        if (!multichannel) {
          pyramid.forEach((level, i) => chunkCache?.attach(level._data, `${imageUrl}#${i}`));
        }
        if (!cancelled) setImage(pyramid);
      } catch (err) {
        if (!cancelled) setError(errorText(err));
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageUrl]);

  useEffect(() => {
    if (!imageUrl || image || error) return;
    const timer = window.setTimeout(() => {
      setError((prev) => prev || "Volume load timed out");
    }, VOLUME_LOAD_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [imageUrl, image, error]);

  const onLevelsRef = useLatest(onLevels);
  useEffect(() => {
    if (image) onLevelsRef.current?.(image);
  }, [image, onLevelsRef]);

  const [szUm, syUm, sxUm] = voxelSizeUm;
  const [ozUm, oyUm, oxUm] = originUm;
  const frame: Frame = useMemo(
    () => ({ voxelSize: [szUm, syUm, sxUm], origin: [ozUm, oyUm, oxUm] }),
    [szUm, syUm, sxUm, ozUm, oyUm, oxUm],
  );

  const levels = useMemo(() => (image ? pyramidLevels(image) : null), [image]);

  // Only the fetch waits for the debounce; the frame follows the window at once.
  const center = useDebounced(`${window_cx},${window_cy}`, WINDOW_DEBOUNCE_MS);
  const [cx, cy] = center.split(",").map(Number) as [number, number];

  // The target: what the props ask for, fetched in full before it is shown.
  const regionScale = region?.scale ?? 0;
  const regionBudget = region?.budget ?? 0;
  const regionCx = region?.cx ?? 0;
  const regionCy = region?.cy ?? 0;
  const target: WindowTarget | null = useMemo(() => {
    if (!levels) return null;
    const size = regionScale ? window_size_um * regionScale : window_size_um;
    const level = pickLevel(levels, frame, size, regionScale ? Math.min(budget, regionBudget) : budget);
    let box: Box;
    if (!regionScale) box = windowBox(level, frame, cx, cy, window_size_um);
    else if (fitsBudget(levelBox(level), regionBudget)) box = levelBox(level);
    else box = regionBox(level, frame, regionCx, regionCy, size);
    return { level, box };
  }, [levels, frame, cx, cy, window_size_um, budget, regionScale, regionBudget, regionCx, regionCy]);
  // The dock's first step: a level coarse enough to arrive at once.
  const coarseScale = coarse?.scale ?? 0;
  const coarseBudget = coarse?.budget ?? 0;
  const coarseTarget: WindowTarget | null = useMemo(() => {
    if (!levels || !coarseScale || regionScale) return null;
    const level = pickLevel(levels, frame, window_size_um * coarseScale, coarseBudget);
    const box = windowBox(level, frame, cx, cy, window_size_um);
    return { level, box };
  }, [levels, frame, cx, cy, window_size_um, coarseScale, coarseBudget, regionScale]);

  const { shown, shownIsCoarse, imageError } = useShownWindow({
    levels,
    frame,
    fine: target,
    coarse: coarseTarget,
    chunkCache,
    pausesPrefetch,
  });
  // Everything drawn follows the shown window, never the target still loading.
  const level: Level | null = shown?.level ?? null;
  const shownBox = shown?.box ?? null;
  const onShownRef = useLatest(onShown);
  useEffect(() => {
    if (shown) onShownRef.current?.(shown.level.index, shown.box);
  }, [shown, onShownRef]);
  // The window asked for right now, before the debounced fetch catches up.
  const liveBox = useMemo(
    () => (level ? windowBox(level, frame, window_cx, window_cy, window_size_um) : null),
    [level, frame, window_cx, window_cy, window_size_um],
  );

  // Voxel size at the shown level, and world scale relative to X (Viv's convention).
  const levelVoxel: [number, number, number] | null = level ? levelVoxelSize(frame, level) : null;
  const ry = levelVoxel ? levelVoxel[1] / levelVoxel[2] : 1;
  const rz = levelVoxel ? levelVoxel[0] / levelVoxel[2] : 1;

  // Viv is only handed the image, at its own dtype, and only once its fetch has
  // resolved, so a new loader swaps in at once (VolumeLayer refetches per loader
  // identity, from memory here).
  const shownImage = shown?.image ?? null;
  const loader = useMemo(() => (shownImage ? [shownImage] : null), [shownImage]);
  const [contentZSpan, setContentZSpan] = useState<ContentZSpan | null>(null);
  /** `contentZSpan` applies only while this is the image Viv is drawing. */
  const contentZSpanImage = useRef<typeof shownImage>(null);
  useLayoutEffect(() => {
    contentZSpanImage.current = null;
  }, [shownImage]);
  const imageSignalMin = contrast[0];
  // The format of the image texture a layer draws now (image-volume.ts).
  const [imageFormat, setImageFormat] = useState<ImageFormat | null>(null);
  const onImageBound = useCallback((f: ImageFormat | null) => setImageFormat(f), []);
  const imagePalette = useMemo(() => paletteLut(render.palette), [render.palette]);
  const meshesOn = Boolean(showLabels && cellPolygons && cellRows && volumeComm);
  const look: MeshLook = { ...DEFAULT_MESH_LOOK, ...meshLookProp };
  // Under the meshes the image draws boosted over the active contrast and gamma; the
  // settings themselves, and the 2D view, keep theirs.
  const imageGamma = render.imageGamma ?? 1;
  const shownImageLook = useMemo(
    () => (meshesOn ? boostedImage(contrast, imageGamma, look.imgBoost) : { contrast, gamma: imageGamma }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [meshesOn, contrast[0], contrast[1], imageGamma, look.imgBoost],
  );
  const shownRender = useMemo(
    () => (shownImageLook.gamma === imageGamma ? render : { ...render, imageGamma: shownImageLook.gamma }),
    [render, imageGamma, shownImageLook.gamma],
  );
  const traitChannelRows = imageChannelRows ?? [];
  const activeImageChannels: CubeImageChannel[] = useMemo(() => {
    const rows = traitChannelRows;
    const pyramidBase = image?.[0] ?? null;
    if (rows.length > 0) {
      return cubeImageChannels(rows, pyramidBase, contrast);
    }
    return [
      {
        name: "Channel 0",
        index: 0,
        visible: true,
        contrast: [shownImageLook.contrast[0], shownImageLook.contrast[1]],
        tint: "#dcdce6",
      },
    ];
  }, [traitChannelRows, image, contrast, shownImageLook.contrast]);
  const expectedVolumeChannels = activeImageChannels.length;
  const onViewportLoad = useMemo(
    () =>
      shownImage
        ? (volumes: { data: unknown }[]) => {
            const raw = volumes[0]?.data;
            if (tightenZToSignal && raw && typeof raw === "object" && "length" in raw) {
              const zAxis = shownImage.labels.indexOf("z");
              const depth = zAxis >= 0 ? shownImage.shape[zAxis]! : 1;
              contentZSpanImage.current = shownImage;
              const span = contentZIndexSpan(
                raw as ArrayLike<number>,
                shownImage.width,
                shownImage.height,
                depth,
                imageSignalMin,
              );
              setContentZSpan((prev) => (prev && prev[0] === span[0] && prev[1] === span[1] ? prev : span));
            }
            if (volumes.length >= expectedVolumeChannels) {
              if (expectedVolumeChannels > 1) {
                const sums = volumes.map((vol) => {
                  const d = vol.data as ArrayLike<number>;
                  let s = 0;
                  for (let i = 0; i < d.length; i++) s += d[i]!;
                  return s;
                });
                setVolumeChannelSums(sums.join(","));
              }
              shownImage.release();
            }
          }
        : undefined,
    [shownImage, imageSignalMin, tightenZToSignal, expectedVolumeChannels],
  );
  const multichannelCube = activeImageChannels.length > 1;
  const showCubeImage = showImage && activeImageChannels.length > 0;
  const channelPalettes = useMemo(
    () =>
      activeImageChannels.length === 1 && !(imageChannelRows?.length ?? 0)
        ? [imagePalette]
        : activeImageChannels.map((ch) => tintPalette(ch.tint)),
    [activeImageChannels, imageChannelRows, imagePalette],
  );
  const gpuChannelBytes = useMemo((): number[] => {
    if (!shownBox || !imageFormat) return [];
    const voxels =
      (shownBox.x1 - shownBox.x0) * (shownBox.y1 - shownBox.y0) * (shownBox.z1 - shownBox.z0);
    const bpv = imageFormat === "r8unorm" ? 1 : imageFormat === "r16unorm" ? 2 : 4;
    const bytes = voxels * bpv;
    return activeImageChannels.map(() => bytes);
  }, [shownBox, imageFormat, activeImageChannels.length]);

  // Frame, camera and cuts live in the requested window; the shown volume pans
  // under it until the new window arrives, so moving Inspect slides the tissue
  // at once instead of jumping when the fetch lands.
  const winW = liveBox ? liveBox.x1 - liveBox.x0 : 1;
  const winH = liveBox ? liveBox.y1 - liveBox.y0 : 1;
  const shownW = shownBox ? shownBox.x1 - shownBox.x0 : 1;
  const shownH = shownBox ? shownBox.y1 - shownBox.y0 : 1;
  const levelDepth = level ? axisSize(level.source, "z") : 1;

  // Window and volume extents in the store's frame (um).
  const base = image?.[0];
  const extentX = base ? oxUm + axisSize(base, "x") * sxUm : oxUm;
  const extentY = base ? oyUm + axisSize(base, "y") * syUm : oyUm;
  const half = window_size_um / 2;
  const winX = clampRange(window_cx - half, window_cx + half, oxUm, extentX);
  const winY = clampRange(window_cy - half, window_cy + half, oyUm, extentY);
  const zFrac = zStackFraction ?? [0, 1];
  const zBaseLo = Math.floor(levelDepth * zFrac[0]);
  const zBaseHiEx = Math.max(zBaseLo + 1, Math.ceil(levelDepth * zFrac[1]));
  const zSpan = contentZSpanImage.current === shownImage ? contentZSpan : null;
  const signalLo = zSpan?.[0] ?? zBaseLo;
  const signalHi = zSpan?.[1] ?? zBaseHiEx;
  const zLo = tightenZToSignal ? Math.max(zBaseLo, signalLo) : zBaseLo;
  const zHiEx = tightenZToSignal ? Math.min(zBaseHiEx, signalHi) : zBaseHiEx;
  const stepZ = levelVoxel?.[0] ?? szUm;
  // Before a level is picked there is no stack to trim: report the image's whole depth,
  // so a cut committed (or saved) that early is not clamped to a one-plane stack.
  const extentZ = base ? ozUm + axisSize(base, "z") * szUm : ozUm;
  const stackZ: Range = level ? [ozUm + zLo * stepZ, ozUm + zHiEx * stepZ] : [ozUm, extentZ];

  const xShown = clampRange(cut[0], cut[1], winX[0], winX[1]);
  const yShown = clampRange(cut[2], cut[3], winY[0], winY[1]);
  const zShown = clampRange(cut[4], cut[5], stackZ[0], stackZ[1]);
  const contentDepthVox = Math.max(0, zHiEx - zLo);

  const windowXSlice = useMemo(() => {
    const step = levelVoxel ? levelVoxel[2] : 1;
    const x0 = shownBox ? shownBox.x0 : 0;
    return clampRange((winX[0] - oxUm) / step - x0, (winX[1] - oxUm) / step - x0, 0, shownW);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [winX[0], winX[1], oxUm, shownW, shownBox?.x0, levelVoxel?.[2]]);
  const windowYSlice = useMemo(() => {
    const step = levelVoxel ? levelVoxel[1] : 1;
    const y0 = shownBox ? shownBox.y0 : 0;
    const [a, b] = clampRange((winY[0] - oyUm) / step - y0, (winY[1] - oyUm) / step - y0, 0, shownH);
    return [shownH - b, shownH - a] as [number, number];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [winY[0], winY[1], oyUm, shownH, shownBox?.y0, levelVoxel?.[1]]);
  // While a new window loads, pan only within the voxels already on the GPU so
  // the canvas never goes blank; the live window still drives cuts and fetches.
  const panBox = useMemo(() => {
    if (!liveBox || !shownBox) return liveBox;
    return clampLiveBoxInsideShown(liveBox, shownBox);
  }, [liveBox, shownBox]);
  // Place the loaded volume in the requested window's world frame: x shifts by
  // the boxes' x0 offset; y by their y1 offset, because texture rows run reversed.
  const panX = shownBox && panBox ? shownBox.x0 - panBox.x0 : 0;
  const panY = shownBox && panBox ? panBox.y1 - shownBox.y1 : 0;
  const volumeZShift = zLo * rz;
  const volumeMatrix = useMemo(() => {
    const m = Z_UP.clone();
    if (panX !== 0 || panY !== 0) m.translate([panX, panY * ry, 0]);
    if (volumeZShift !== 0) m.translate([0, 0, -volumeZShift]);
    return panX === 0 && panY === 0 && volumeZShift === 0 ? Z_UP : m;
  }, [panX, panY, ry, volumeZShift]);
  const windowZSlice = useMemo((): [number, number] => [zLo, zHiEx], [zLo, zHiEx]);
  const frameZOriginUm = ozUm + zLo * stepZ;
  const shownCut: CubeCut = [xShown[0], xShown[1], yShown[0], yShown[1], zShown[0], zShown[1]];
  const [cx0, cx1, cy0, cy1, cz0, cz1] = shownCut;
  const cutFrac = useMemo(() => {
    const cut: CubeCut = [cx0, cx1, cy0, cy1, cz0, cz1];
    if (!levelVoxel) {
      return cutFractions(cut, winX, winY, stackZ);
    }
    const stepX = levelVoxel[2];
    const stepY = levelVoxel[1];
    const stepZ = levelVoxel[0];
    const x0v = shownBox?.x0 ?? 0;
    const y0v = shownBox?.y0 ?? 0;
    const texX = (um: number) => (um - oxUm) / stepX - x0v;
    const texY = (um: number) => shownH - ((um - oyUm) / stepY - y0v);
    const texZ = (um: number) => (um - ozUm) / stepZ;
    return cutFractionsForSlices(cut, windowXSlice, windowYSlice, windowZSlice, texX, texY, texZ);
  }, [
    cx0,
    cx1,
    cy0,
    cy1,
    cz0,
    cz1,
    shownBox,
    levelVoxel,
    winX,
    winY,
    stackZ,
    windowXSlice,
    windowYSlice,
    windowZSlice,
    oxUm,
    oyUm,
    ozUm,
    shownH,
  ]);
  const outsideCut = !cutIsOpen(shownCut, winX, winY, stackZ);
  const cutZMap = useMemo(
    () =>
      levelVoxel
        ? { ozUm, stepZ: levelVoxel[0], zSlice: windowZSlice as [number, number] }
        : undefined,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ozUm, levelVoxel?.[0], windowZSlice[0], windowZSlice[1]],
  );
  const cutZFrac: [number, number] = [cutFrac[4]!, cutFrac[5]!];
  const cubeExtensions = useMemo(
    () => (multichannelCube ? CUBE_EXTENSIONS_MULTI : CUBE_EXTENSIONS),
    [multichannelCube],
  );
  const cubeRaycastLayerId = multichannelCube ? "volume-raycast-multi" : "volume-raycast-single";

  // Centre of the whole window box in world units (physical scale, then Z_UP).
  // Deliberately not the cut region's centre: cross-sections must not move the cube.
  const aimTarget = useMemo(
    () => Array.from(Z_UP.transformPoint([winW / 2, (winH / 2) * ry, (contentDepthVox / 2) * rz])),
    [winW, winH, ry, rz, contentDepthVox],
  );
  fixedTargetRef.current = aimTarget;

  // Fit the nominal window (not the clamped box, so the zoom holds at edges) and
  // the full stack height, as each preset sees the box.
  const fits = useMemo((): Record<ViewPreset, Fit[]> | null => {
    if (!level) return null;
    const wx = Math.min(axisSize(level.source, "x"), window_size_um / (sxUm * level.factor[2]));
    const wy = Math.min(axisSize(level.source, "y"), window_size_um / (syUm * level.factor[1])) * ry;
    const depth = contentDepthVox * rz;
    // Screen footprint of the upright box at orbit 45 and ISO_PITCH: the horizontal
    // diagonal across, and the stack height foreshortened plus the tilted top face.
    const pitch = (ISO_PITCH * Math.PI) / 180;
    const diagonal = Math.hypot(wx, wy);
    const isoHeight = depth * Math.cos(pitch) + diagonal * Math.sin(pitch);
    // Room for the axis labels drawn just outside the box.
    const m = 1.12;
    // From above, the Z ticks and "z µm" rise from the top-left corner toward
    // the camera, so perspective spreads them past the box: fit them too.
    const pad = labelPad([wx, wy, depth]);
    const zLabels = { width: wx + 2 * pad, height: wy + 2 * pad, near: depth / 2 + 3 * pad, marginPx: 14 };
    return {
      iso: [{ width: diagonal * m, height: isoHeight * m, near: 0 }],
      // From above: the window's XY extent; its top face is half the stack nearer.
      top: [{ width: wx * m, height: wy * m, near: depth / 2 }, zLabels],
      // From the front: X across and the stack up; the front face is half the window nearer.
      side: [{ width: wx * m, height: depth * m, near: wy / 2 }],
    };
  }, [level, window_size_um, sxUm, syUm, ry, contentDepthVox, rz]);
  const framing = useLatest({ fits, box });

  // The first view is the preset asked for by then, else the home view: a
  // preset chosen while the window loads (no camera yet) is kept, not replaced.
  const presetRef = useLatest(preset);
  useEffect(() => {
    if (!fits || viewState) return;
    const want = presetRef.current ?? home;
    const view = viewPixelSize.width > 1 ? viewPixelSize : box;
    const first = homeView(home, fits, view);
    if (want === home) setViewState(first);
    else setViewState(reframeOnPreset ? homeView(want, fits, view) : { ...first, ...PRESETS[want] });
  }, [fits, viewState, box, viewPixelSize, home, reframeOnPreset, presetRef]);
  // A fixed camera (no controller) always frames the window: it follows the
  // window's size and the view's (a preview mounted hidden is measured later).
  useEffect(() => {
    if (!interactive && fits) {
      const view = viewPixelSize.width > 1 ? viewPixelSize : box;
      setViewState(homeView(home, fits, view));
    }
  }, [interactive, fits, box, viewPixelSize, home]);

  const framedViewportRef = useRef({ width: 0, height: 0 });
  /** After the user orbits or wheel-zooms, preserve zoom across viewport resizes. */
  const userCameraAdjustedRef = useRef(false);
  useLayoutEffect(() => {
    if (!fits || viewPixelSize.width < 8 || viewPixelSize.height < 8) return;
    const prev = framedViewportRef.current;
    const dw = Math.abs(prev.width - viewPixelSize.width);
    const dh = Math.abs(prev.height - viewPixelSize.height);
    if (prev.width > 0 && dw < 2 && dh < 2) return;
    const prevSize = { width: prev.width, height: prev.height };
    framedViewportRef.current = {
      width: viewPixelSize.width,
      height: viewPixelSize.height,
    };
    const base = homeView(home, fits, viewPixelSize);
    setViewState((prevState) => {
      if (!prevState) return base;
      if (!userCameraAdjustedRef.current) {
        return {
          ...prevState,
          zoom: base.zoom,
          minZoom: base.minZoom,
          maxZoom: base.maxZoom,
        };
      }
      if (prevSize.width > 0 && prevSize.height > 0) {
        const ratio = Math.min(
          viewPixelSize.width / prevSize.width,
          viewPixelSize.height / prevSize.height,
        );
        if (Math.abs(ratio - 1) > 0.002) {
          const dz = Math.log2(ratio);
          return {
            ...prevState,
            zoom: prevState.zoom + dz,
            minZoom: prevState.minZoom + dz,
            maxZoom: prevState.maxZoom + dz,
          };
        }
      }
      return prevState;
    });
  }, [fits, viewPixelSize.width, viewPixelSize.height, home]);

  // World units are the shown level's X voxels, so a finer level is a bigger
  // world: a level swap (coarse to fine) zooms out by the factor ratio to keep
  // the same framing.
  const levelFx = level ? level.factor[2] : 0;
  const framedFxRef = useRef(0);
  useLayoutEffect(() => {
    if (!levelFx) return;
    const prevFx = framedFxRef.current;
    framedFxRef.current = levelFx;
    if (!prevFx || prevFx === levelFx) return;
    const dz = Math.log2(levelFx / prevFx);
    setViewState((prev) =>
      prev ? { ...prev, zoom: prev.zoom + dz, minZoom: prev.minZoom + dz, maxZoom: prev.maxZoom + dz } : prev,
    );
  }, [levelFx]);

  const displayViewStates = useMemo(() => {
    if (!viewState) return undefined;
    return [{ ...viewState, id: "3d", target: aimTarget }];
  }, [viewState, aimTarget]);

  // Reset reframes the window from the home view; the first tick is the mount.
  const resetTickRef = useRef(resetTick);
  useEffect(() => {
    if (resetTickRef.current === resetTick) return;
    resetTickRef.current = resetTick;
    userCameraAdjustedRef.current = false;
    const { fits: f, box: b } = framing.current;
    if (f) setViewState(homeView(home, f, b));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetTick]);

  // A preset turns the camera, or with `reframeOnPreset` frames the window as
  // that preset's home view. A camera already at the preset is left alone, so
  // echoing onPreset back (or orbiting to within a preset's tolerance) never
  // snaps the camera. With no camera yet, the first view takes the preset.
  useEffect(() => {
    if (!preset) return;
    const { fits: f, box: b } = framing.current;
    setViewState((prev) => {
      if (!prev || presetOf(prev) === preset) return prev;
      return reframeOnPreset && f ? homeView(preset, f, b) : { ...prev, ...PRESETS[preset] };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset]);

  // Reported once there is a camera: a null before the first view would
  // overwrite a preset the caller asked for meanwhile.
  const cameraPreset = presetOf(viewState);
  // Additive integration is empty on Top for thin z slabs; MIP keeps tissue visible
  // (matches inspect preview). Do not force MIP for multichannel alone — the multi
  // channel MIP raycast path is still being brought to parity with single-channel.
  const thinZSlab = contentDepthVox > 0 && contentDepthVox <= 128;
  const renderImageMode =
    imageMode === "mip" ||
    (thinZSlab && imageMode === "additive" && !multichannelCube)
      ? "mip"
      : imageMode;
  const hasCamera = Boolean(viewState);
  const onPresetRef = useLatest(onPreset);
  useLayoutEffect(() => {
    if (hasCamera) onPresetRef.current?.(cameraPreset);
  }, [cameraPreset, hasCamera, onPresetRef]);

  const onViewStateChange = useCallback(
    ({ viewState: next }: { viewId: string; viewState: ViewState }) => {
      const fixedTarget = fixedTargetRef.current;
      const clamped: ViewState = {
        ...next,
        id: "3d",
        target: fixedTarget ?? next.target,
        rotationX: Math.max(MIN_PITCH, Math.min(MAX_PITCH, next.rotationX)),
        minRotationX: MIN_PITCH,
        maxRotationX: MAX_PITCH,
      };
      setViewState((prev) => {
        if (prev && !viewStatesEqual(prev, clamped)) userCameraAdjustedRef.current = true;
        return prev && viewStatesEqual(prev, clamped) ? prev : clamped;
      });
      return clamped;
    },
    [],
  );

  // Per-channel contrast and Viv selections; tints go through `channelPalettes`.
  const contrastLimits = useMemo(
    () => activeImageChannels.map((ch) => [ch.contrast[0], ch.contrast[1]] as [number, number]),
    [activeImageChannels],
  );
  const contrastLimitsKey = useMemo(
    () => contrastLimits.map((c) => `${c[0]},${c[1]}`).join(";"),
    [contrastLimits],
  );
  useLayoutEffect(() => {
    setCubeTraitContrast(contrastLimits);
  }, [contrastLimitsKey, contrastLimits]);
  useEffect(() => {
    setViewState((prev) => (prev ? { ...prev } : prev));
  }, [contrastLimitsKey]);
  useEffect(() => {
    setViewState((prev) => (prev ? { ...prev } : prev));
  }, [activeImageChannels.length]);
  const shownRenderForDeck = useMemo(
    () => ({ ...shownRender, traitContrast: contrastLimits }),
    [shownRender, contrastLimits],
  );
  const channelSelections = useMemo(() => {
    const hasC = Boolean(level?.source.labels.includes("c"));
    if (!hasC) {
      return activeImageChannels.map(() => ({}));
    }
    return activeImageChannels.map((ch) => ({ c: ch.index }));
  }, [activeImageChannels, level?.source.labels]);
  const channelColors = useMemo(
    () => activeImageChannels.map(() => [255, 255, 255] as [number, number, number]),
    [activeImageChannels],
  );
  const channelsVisible = useMemo(() => activeImageChannels.map(() => true), [activeImageChannels.length]);

  const cubeFrame: CubeFrame | null = useMemo(
    () =>
      // No frame around an empty window (Inspect outside the volume).
      levelVoxel && winW > 0 && winH > 0
        ? {
            size: [winW, winH * ry, contentDepthVox * rz],
            umPerUnit: levelVoxel[2],
            zOriginUm: frameZOriginUm,
            dark,
          }
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [winW, winH, ry, rz, contentDepthVox, levelVoxel?.[2], frameZOriginUm, dark],
  );

  // Map geometry on the stack's top face, placed in the requested window like
  // the frame (so it slides with the window, as the volume does) and clipped to it.
  const lvx = levelVoxel?.[2] ?? 1;
  const lvy = levelVoxel?.[1] ?? 1;
  const toWorldXY = useCallback(
    ([x, y]: [number, number]): [number, number] => {
      const { x0, y1 } = panBox ?? { x0: 0, y1: 0 };
      return [(x - oxUm) / lvx - x0, (y1 - (y - oyUm) / lvy) * ry];
    },
    [panBox, oxUm, oyUm, lvx, lvy, ry],
  );
  const windowRect = useMemo(
    () => ({ x0: 0, x1: winW, y0: 0, y1: winH * ry }),
    [winW, winH, ry],
  );
  const scatterZMid = cubeFrame ? cubeFrame.size[2] / 2 : 0;
  const scatterZAt = useCallback(
    (p: { z?: number }) => {
      if (!cubeFrame || !levelVoxel) return scatterZMid;
      const zUm = p.z;
      if (zUm == null || !Number.isFinite(zUm)) return scatterZMid;
      const z = umZToWorldHeight(zUm, ozUm, levelVoxel[0], windowZSlice, cubeFrame.size[2]);
      return Math.min(cubeFrame.size[2], Math.max(0, z));
    },
    [cubeFrame, levelVoxel, scatterZMid, ozUm, windowZSlice],
  );
  const placedOverlays = useMemo(() => {
    if (!overlays?.length || !liveBox || !cubeFrame) return null;
    return placeOverlays(overlays, toWorldXY, windowRect, cubeFrame.size[2]);
  }, [overlays, liveBox, cubeFrame, toWorldXY, windowRect]);
  const scatterInCut = useMemo(() => {
    if (!scatterPoints?.length) return scatterPoints ?? [];
    if (!outsideCut) return scatterPoints;
    const [x0, x1, y0, y1, z0, z1] = shownCut;
    return scatterPoints.filter((p) => {
      if (p.x < x0 || p.x > x1 || p.y < y0 || p.y > y1) return false;
      const z = p.z;
      if (z == null || !Number.isFinite(z)) return true;
      return z >= z0 && z <= z1;
    });
  }, [scatterPoints, outsideCut, shownCut]);
  const placedScatterPoints = useMemo(() => {
    if (!showPoints || !scatterInCut.length || !liveBox || !cubeFrame) return null;
    return placeScatterPoints(scatterInCut, toWorldXY, windowRect, scatterZAt, cubeFrame.umPerUnit);
  }, [showPoints, scatterInCut, liveBox, cubeFrame, toWorldXY, windowRect, scatterZAt]);

  // Cells: the worker meshes the window's cells; the last window's meshes stay up
  // (placed by their own origin) until the new ones arrive.
  const meshBox = `${winX[0]},${winY[0]},${winX[1]},${winY[1]}`;
  const [cellMesh, setCellMesh] = useState<{ box: string; mesh: CellMeshData } | null>(null);
  const [meshError, setMeshError] = useState("");
  useEffect(() => {
    if (!meshesOn || winX[1] - winX[0] < 1 || winY[1] - winY[0] < 1) return;
    let live = true;
    setMeshError("");
    cellMeshBuilder(cellPolygons!, cellRows!, volumeComm!)
      .build(meshBox.split(",").map(Number) as [number, number, number, number])
      .then((mesh) => {
        if (live && mesh) setCellMesh({ box: meshBox, mesh });
      })
      .catch((err) => live && setMeshError(errorText(err)));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meshesOn, meshBox, cellPolygons, cellRows, volumeComm]);
  const mesh = meshesOn ? (cellMesh?.mesh ?? null) : null;
  const meshGeometry = useMemo(() => (mesh ? cellMeshGeometry(mesh) : null), [mesh]);
  const meshLut = useMemo(() => (mesh ? cellMeshLut(mesh, coloring) : null), [mesh, coloring]);
  const placedCellMesh: PlacedCellMesh | null = useMemo(() => {
    if (!mesh || !meshGeometry || !meshLut || !cubeFrame || !levelVoxel || !panBox) return null;
    return {
      mesh: meshGeometry,
      lut: meshLut,
      clip: cellMeshClipBox([cx0, cx1, cy0, cy1, cz0, cz1], stackZ, mesh.originUm),
      opacity: render.cellAlpha,
      look,
      modelMatrix: cellMeshMatrix({
        volumeMatrix,
        originUm: mesh.originUm,
        ox: oxUm,
        oy: oyUm,
        oz: ozUm,
        lvx: levelVoxel[2],
        lvy: levelVoxel[1],
        lvz: levelVoxel[0],
        ry,
        panX0: panBox.x0,
        panY1: panBox.y1,
        zSlice: windowZSlice,
        depth: cubeFrame.size[2],
      }),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mesh, meshGeometry, meshLut, cubeFrame, levelVoxel, panBox, cx0, cx1, cy0, cy1, cz0, cz1, stackZ[0], stackZ[1], render.cellAlpha, look.fresnelMin, look.shine, look.flat, volumeMatrix, oxUm, oyUm, ozUm, ry, windowZSlice]);

  const orbitViewRef = useRef<FramedVolumeView | null>(null);
  const views = useMemo(() => {
    if (!orbitViewRef.current) {
      orbitViewRef.current = new FramedVolumeView({
        id: "3d",
        target: [0, 0, 0],
        useFixedAxis: true,
        controller: interactive,
      } as never);
    }
    return [orbitViewRef.current];
  }, [interactive]);
  // useFixedAxis orbits `view.target` and discards viewState.target. The cut
  // plates project aimTarget on their own, so the view has to carry the same
  // point or the volume stays on the origin while the plates sit on the box.
  if (orbitViewRef.current) orbitViewRef.current.target = aimTarget;
  const onRenderedRef = useLatest(onRendered);
  const renderOverlayRef = useRef<HTMLDivElement>(null);
  const deckProps = useMemo(
    () => ({
      effects: [CELL_MESH_LIGHTING],
      onAfterRender: ({ gl }: { gl: WebGL2RenderingContext }) => {
        if (typeof window !== "undefined") {
          const w = window as unknown as { __volumeCubeRenderCount?: number };
          w.__volumeCubeRenderCount = (w.__volumeCubeRenderCount ?? 0) + 1;
          const node = renderOverlayRef.current;
          if (node) node.textContent = `renders: ${w.__volumeCubeRenderCount ?? 0}`;
        }
        onRenderedRef.current?.(gl.canvas as HTMLCanvasElement);
      },
    }),
    [onRenderedRef],
  );
  // Raw slices stay in voxel indices for the cut plates. Viv needs them scaled.
  const voxelX = levelVoxel?.[2] ?? 1;
  const voxelY = levelVoxel?.[1] ?? 1;
  const voxelZ = levelVoxel?.[0] ?? 1;
  const voxelMin = Math.min(voxelX, voxelY, voxelZ);
  const vivXSlice = useMemo(() => vivAxisSlice(windowXSlice, voxelX, voxelMin), [windowXSlice, voxelX, voxelMin]);
  const vivYSlice = useMemo(() => vivAxisSlice(windowYSlice, voxelY, voxelMin), [windowYSlice, voxelY, voxelMin]);
  const vivZSlice = useMemo(() => vivAxisSlice(windowZSlice, voxelZ, voxelMin), [windowZSlice, voxelZ, voxelMin]);
  const layerProps = useMemo(
    () =>
      loader
        ? [
            {
              id: cubeRaycastLayerId,
              loader,
              onViewportLoad,
              contrastLimits,
              colors: channelColors,
              channelsVisible,
              selections: channelSelections,
              xSlice: vivXSlice,
              ySlice: vivYSlice,
              zSlice: vivZSlice,
              cutFrac,
              cubeCutBox:
                outsideCut && cubeFrame
                  ? cutBoxPre(shownCut, winX, winY, stackZ, cubeFrame.size, cutZMap, cutZFrac)
                  : null,
              resolution: 0,
              extensions: cubeExtensions,
              imageMode: renderImageMode,
              onImageBound,
              imagePalette,
              channelPalettes,
              cubeTraitContrast: contrastLimits,
              render: shownRenderForDeck,
              showImage: showCubeImage,
              modelMatrix: volumeMatrix,
              frameMatrix: Z_UP,
              clippingPlanes: [],
              cubeFrame,
              cubeOverlays: placedOverlays,
              cubeScatterPoints: placedScatterPoints,
              cubeCellMesh: placedCellMesh,
            },
          ]
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      loader,
      onViewportLoad,
      contrastLimits,
      contrastLimitsKey,
      channelColors,
      channelsVisible,
      channelSelections,
      vivXSlice,
      vivYSlice,
      vivZSlice,
      cutFrac,
      cubeExtensions,
      cubeRaycastLayerId,
      outsideCut,
      shownCut[0],
      shownCut[1],
      shownCut[2],
      shownCut[3],
      shownCut[4],
      shownCut[5],
      winX[0],
      winX[1],
      winY[0],
      winY[1],
      stackZ[0],
      stackZ[1],
      renderImageMode,
      onImageBound,
      imagePalette,
      channelPalettes,
      shownRenderForDeck,
      showCubeImage,
      cubeFrame,
      placedOverlays,
      placedScatterPoints,
      placedCellMesh,
      volumeMatrix,
    ],
  );

  const outside = target
    ? boxIsEmpty(regionScale ? windowBox(target.level, frame, cx, cy, window_size_um) : target.box)
    : false;
  // A failed target with the coarse step's view already shown keeps that view;
  // the error goes to the caller's title bar rather than over the canvas. Any
  // other failure (no coarse step) is the canvas status, as before.
  const refineFailed = Boolean(imageError && shownIsCoarse);
  const refineError = refineFailed ? `Could not refine: ${imageError}` : "";
  // Settled: the target level is shown, at the window asked for right now. A
  // moved window is stale until its fetch lands, whether the debounced target
  // has caught up or not, and a pan along a clamped edge can change the box
  // without shifting it. The preview's region is never the window: its level decides.
  const settled = Boolean(
    shown && target && shown.level.index === target.level.index && (regionScale > 0 || sameBox(shown.box, liveBox)),
  );
  const refining = !settled && !error && !imageError && !outside;
  // The image failed with nothing kept on screen.
  const loadError = error || (refineFailed ? "" : imageError);

  let status = "";
  if (!image) status = error || "Loading volume…";
  else if (imageError && !refineFailed) status = `Could not load this window: ${imageError}`;
  else if (outside) status = "Inspect window is outside the volume";
  // The image is open but no window has arrived yet: nothing is drawn.
  else if (!shown) status = "Loading window…";
  else if (meshesOn && meshError) status = `Could not load cells: ${meshError}`;

  let labelsState: CubeLoadState["labels"] = "off";
  if (meshesOn) labelsState = meshError ? "error" : cellMesh?.box === meshBox ? "on" : "loading";
  const groups = coloring.kind === "groups" ? coloring.groups : NO_GROUPS;
  const highlighted = mesh ? groups.filter((g) => g.labels.length > 0) : NO_GROUPS;
  const legend = showLegend ? highlighted : NO_GROUPS;
  const coloringState = mesh ? coloring.kind : "off";
  const levelIndex = level ? level.index : 0;

  const contrastMax = base && base.dtype === "Uint8" ? 255 : Math.max(255, Math.ceil(contrast[1] * 4));

  // Layout effects: the caller's readout and data-* mirrors update before paint.
  const onLoadStateRef = useLatest(onLoadState);
  useLayoutEffect(() => {
    onLoadStateRef.current?.({
      labels: labelsState,
      pan: [panX, panY],
      level: levelIndex,
      refining,
      refineError,
      imageError: loadError,
      outside,
    });
  }, [labelsState, panX, panY, levelIndex, refining, refineError, loadError, outside, onLoadStateRef]);

  // Reported once the image is open: before that the volume has no extent.
  const onBoundsRef = useLatest(onBounds);
  const hasExtent = Boolean(base);
  useLayoutEffect(() => {
    if (!hasExtent) return;
    onBoundsRef.current?.({ winX, winY, stackZ, volumeX: [oxUm, extentX], volumeY: [oyUm, extentY], contrastMax });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasExtent, winX[0], winX[1], winY[0], winY[1], stackZ[0], stackZ[1], extentX, extentY, contrastMax, onBoundsRef]);

  // Pan: a Shift (or Move tool) press is stopped in the capture phase, before
  // deck's controller (mjolnir's pointerdown on the canvas) sees it, so it never
  // orbits; window listeners then follow the drag until release.
  const panAbort = useRef<AbortController | null>(null);
  const viewRef = useLatest(viewState);
  const umRef = useLatest(levelVoxel ? levelVoxel[2] : 1);
  const onPanRef = useLatest(onPan);
  const onPanEndRef = useLatest(onPanEnd);
  const [panning, setPanning] = useState(false);
  const labelCellCount = mesh?.ids.length ?? 0;
  const [labelCellsStable, setLabelCellsStable] = useState(!meshesOn);
  useEffect(() => {
    if (!meshesOn) {
      setLabelCellsStable(true);
      return;
    }
    setLabelCellsStable(false);
    const t = window.setTimeout(() => setLabelCellsStable(true), CUBE_LABEL_CELLS_SETTLE_MS);
    return () => window.clearTimeout(t);
  }, [meshesOn, labelCellCount]);
  const cubeSettled =
    !refining && !panning && (!meshesOn || (labelsState === "on" && labelCellsStable));
  /** Stop a pan still in progress; its end is reported, so its last moves are saved. */
  const stopPan = useCallback(() => {
    const abort = panAbort.current;
    if (!abort || abort.signal.aborted) return;
    abort.abort();
    onPanEndRef.current?.();
  }, [onPanEndRef]);
  // Torn down mid-pan (Esc or a tool key closes the cube): the pan still ends.
  useEffect(() => stopPan, [stopPan]);

  const wantsPan = (e: { button: number; shiftKey: boolean }) =>
    Boolean(onPan) && e.button === 0 && (panMode || e.shiftKey);

  const handleBox = cubeFrame ? cutBoxPre(shownCut, winX, winY, stackZ, cubeFrame.size, cutZMap, cutZFrac) : null;
  const handlesRef = useLatest({
    onCutLive,
    onCutCommit,
    viewState,
    aimTarget,
    handleBox,
    shownCut,
    winX,
    winY,
    stackZ,
    interactive,
  });
  const cutChromeRef = useRef<VolumeCubeCutChromeHandle>(null);
  const pointerAt = useCallback((clientX: number, clientY: number) => {
    const h = handlesRef.current;
    const node = hostRef.current;
    if (!h.onCutLive || !h.interactive || !h.viewState || !h.handleBox || !node) {
      return { face: null as CutFace | null, near: null as CutFace | null, dragDir: null };
    }
    const rect = node.getBoundingClientRect();
    return cutPointerTarget(
      { x: clientX - rect.left, y: clientY - rect.top },
      h.handleBox,
      h.viewState,
      h.aimTarget,
      { width: rect.width, height: rect.height },
    );
  }, []);

  const onPointerDownCapture = (e: React.PointerEvent<HTMLDivElement>) => {
    if (wantsPan(e)) {
      e.stopPropagation();
      e.preventDefault();
      stopPan();
      const abort = new AbortController();
      panAbort.current = abort;
      const pointer = e.pointerId;
      let last = { x: e.clientX, y: e.clientY };
      setPanning(true);
      const end = () => {
        setPanning(false);
        stopPan();
      };
      const opts = { signal: abort.signal };
      window.addEventListener(
        "pointermove",
        (m: PointerEvent) => {
          if (m.pointerId !== pointer) return;
          // A release lost outside the page: hovering must not keep panning.
          if (!(m.buttons & 1)) return end();
          const view = viewRef.current;
          if (!view) return;
          const d = dragToWindowDelta(m.clientX - last.x, m.clientY - last.y, view, umRef.current);
          last = { x: m.clientX, y: m.clientY };
          onPanRef.current?.(d.x, d.y);
        },
        opts,
      );
      const release = (u: PointerEvent) => {
        if (u.pointerId === pointer) end();
      };
      window.addEventListener("pointerup", release, opts);
      window.addEventListener("pointercancel", release, opts);
      window.addEventListener("blur", end, opts);
      return;
    }
    const hit = e.button === 0 ? pointerAt(e.clientX, e.clientY) : null;
    const face = hit?.face ?? null;
    const dragDir = hit?.dragDir ?? null;
    if (!face) {
      // Deck's orbit is absolute from panstart, and a slow frame drops isDragging so the rest of the drag no-ops.
      if (e.button !== 0 || !handlesRef.current.interactive) return;
      const view = viewRef.current;
      const node = hostRef.current;
      if (!view || !node) return;
      const rect = node.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      e.stopPropagation();
      e.preventDefault();
      const start = {
        x: e.clientX,
        y: e.clientY,
        rotationX: view.rotationX,
        rotationOrbit: view.rotationOrbit,
        w: rect.width,
        h: rect.height,
      };
      const abort = new AbortController();
      const pointer = e.pointerId;
      const end = () => abort.abort();
      const opts = { signal: abort.signal };
      window.addEventListener(
        "pointermove",
        (m: PointerEvent) => {
          if (m.pointerId !== pointer) return;
          if (!(m.buttons & 1)) return end();
          const dy = (m.clientY - start.y) / start.h;
          let dx = (m.clientX - start.x) / start.w;
          if (start.rotationX < -90 || start.rotationX > 90) dx *= -1;
          const rotationX = Math.max(MIN_PITCH, Math.min(MAX_PITCH, start.rotationX + dy * 180));
          const rotationOrbit = start.rotationOrbit + dx * 180;
          setViewState((prev) => {
            if (!prev) return prev;
            if (prev.rotationX === rotationX && prev.rotationOrbit === rotationOrbit) return prev;
            userCameraAdjustedRef.current = true;
            return { ...prev, rotationX, rotationOrbit };
          });
        },
        opts,
      );
      const release = (u: PointerEvent) => {
        if (u.pointerId === pointer) end();
      };
      window.addEventListener("pointerup", release, opts);
      window.addEventListener("pointercancel", release, opts);
      window.addEventListener("blur", end, opts);
      return;
    }
    e.stopPropagation();
    e.preventDefault();
    const abort = new AbortController();
    const pointer = e.pointerId;
    let last = { x: e.clientX, y: e.clientY };
    let live = handlesRef.current.shownCut;
    cutChromeRef.current?.beginCutFace(face);
    const end = (commit: boolean) => {
      if (abort.signal.aborted) return;
      abort.abort();
      cutChromeRef.current?.endCutFace();
      if (commit) handlesRef.current.onCutCommit?.(live);
    };
    const opts = { signal: abort.signal };
    window.addEventListener(
      "pointermove",
      (m: PointerEvent) => {
        if (m.pointerId !== pointer) return;
        if (!(m.buttons & 1)) return end(true);
        const h = handlesRef.current;
        if (!h.viewState) return;
        const delta = dragToFaceDelta(
          m.clientX - last.x,
          m.clientY - last.y,
          face,
          h.viewState,
          umRef.current,
          dragDir ?? undefined,
        );
        last = { x: m.clientX, y: m.clientY };
        live = moveCutEdge(live, face, delta, { x: h.winX, y: h.winY, z: h.stackZ });
        h.onCutLive?.(live);
      },
      opts,
    );
    const release = (u: PointerEvent) => {
      if (u.pointerId === pointer) end(true);
    };
    window.addEventListener("pointerup", release, opts);
    window.addEventListener("pointercancel", release, opts);
    window.addEventListener("blur", () => end(true), opts);
  };
  const onMouseDownCapture = (e: React.MouseEvent<HTMLDivElement>) => {
    // Left-drag is pan, face-cut, or the orbit above. Deck must not start a second gesture.
    if (e.button === 0 && handlesRef.current.interactive) e.stopPropagation();
  };
  const platesOn = Boolean(onCutLive && interactive && viewState && handleBox);

  return (
    <div
      ref={hostRef}
      onPointerDownCapture={onPointerDownCapture}
      onMouseDownCapture={onMouseDownCapture}
      data-pan-mode={String(panMode)}
      data-panning={String(panning)}
      data-outside={outsideCut ? "cut" : "open"}
      className={cn("volume-cube__view relative w-full overflow-hidden rounded-md", background && "bg-neutral-950")}
      style={{ height }}
      data-image={showCubeImage ? "on" : "off"}
      data-labels={labelsState}
      data-image-format={imageFormat ?? "none"}
      data-label-cells={mesh?.ids.length ?? 0}
      data-coloring={coloringState}
      data-highlight={highlighted.length}
      data-image-mode={renderImageMode}
      data-pan={`${panX},${panY}`}
      data-palette={render.palette}
      data-image-gamma={render.imageGamma}
      data-level={shown?.level.index ?? -1}
      data-refining={String(refining)}
      data-settled={String(cubeSettled)}
      data-overlays={placedOverlays?.count ?? 0}
      data-points={showPoints ? (placedScatterPoints?.length ?? 0) : 0}
      data-zoom={viewState ? viewState.zoom.toFixed(2) : ""}
      data-pitch={viewState ? Math.round(viewState.rotationX) : ""}
      data-viewport-w={Math.round(viewPixelSize.width)}
      data-viewport-h={Math.round(viewPixelSize.height)}
      data-channels={activeImageChannels.length}
      data-gpu-channel-bytes={gpuChannelBytes.join(",") || "0"}
      data-volume-sums={volumeChannelSums}
    >
      {layerProps && displayViewStates ? (
        <VolumeCubeDeck
          deckKey={`channels:${activeImageChannels.map((c) => c.name).join("+")}`}
          layerProps={layerProps}
          views={views}
          viewStates={displayViewStates}
          onViewStateChange={onViewStateChange}
          deckProps={deckProps}
        />
      ) : null}
      {status ? (
        <ChromeLoadIndicator
          testId={loadStatusTestId}
          overlay
          phase={status.startsWith("Loading") ? "loading" : "error"}
          message={status}
        />
      ) : null}
      {renderCountOverlay ? (
        <div
          ref={renderOverlayRef}
          className="pointer-events-none absolute right-2 bottom-2 z-10 rounded bg-black/75 px-2 py-1 font-mono text-xs text-white tabular-nums"
          data-testid="cube-render-overlay"
        >
          renders: 0
        </div>
      ) : null}
      <VolumeCubeCutChrome
        ref={cutChromeRef}
        hostRef={hostRef}
        pointerAt={pointerAt}
        platesOn={platesOn}
        handleBox={handleBox}
        viewState={viewState}
        aimTarget={aimTarget}
        viewPixelSize={viewPixelSize}
        shownCut={shownCut}
      />
      {layerProps && viewState ? (
        <AxisLegend rotationX={viewState.rotationX} rotationOrbit={viewState.rotationOrbit} />
      ) : null}
      {legend.length ? (
        <div
          className="pointer-events-none absolute top-2 left-2 flex max-w-[60%] flex-wrap gap-1"
          aria-label="Highlighted cells"
        >
          {legend.map((g) => (
            <Badge key={g.name} variant="outline" className="border-white/50 bg-neutral-900/90 text-white">
              <span className="size-2 rounded-full" style={{ backgroundColor: g.color }} />
              {g.name}
            </Badge>
          ))}
        </div>
      ) : null}
    </div>
  );
}

type VolumeCubeDeckProps = {
  deckKey: string;
  layerProps: Record<string, unknown>[];
  views: FramedVolumeView[];
  viewStates: ViewState[];
  onViewStateChange: (args: { viewId: string; viewState: ViewState }) => ViewState;
  deckProps: { effects: unknown[]; onAfterRender: (args: { gl: WebGL2RenderingContext }) => void };
};

/** Viv deck only: cut-face hover updates skip this subtree so deck does not redraw. */
function VolumeCubeDeck({
  deckKey,
  layerProps,
  views,
  viewStates,
  onViewStateChange,
  deckProps,
}: VolumeCubeDeckProps) {
  return (
    <VivViewer
      key={deckKey}
      {...({
        layerProps,
        views,
        viewStates,
        onViewStateChange,
        useDevicePixels: false,
        deckProps,
      } as unknown as React.ComponentProps<typeof VivViewer>)}
    />
  );
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function sameBox(a: Box, b: Box | null): boolean {
  return b !== null && a.x0 === b.x0 && a.x1 === b.x1 && a.y0 === b.y0 && a.y1 === b.y1;
}
