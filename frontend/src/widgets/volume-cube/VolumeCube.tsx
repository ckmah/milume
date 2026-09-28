import type React from "react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Matrix4 } from "@math.gl/core";
import { VivViewer, loadOmeZarr } from "@hms-dbmi/viv";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

import type { ChunkCache } from "./chunk-cache";
import { CUBE_EXTENSIONS, type HighlightGroup, type RenderSettings } from "./cell-lut-extension";
import { type CellVolume, TOO_MANY_CELLS, markVivVolume } from "./cell-volume";
import { AxisLegend } from "./axis-legend";
import type { Range, ViewPreset } from "./CubeControls";
import { type CubeFrame, FramedVolumeView, labelPad } from "./frame-layers";
import { type CubeOverlay, placeOverlays } from "./overlay-layers";
import { paletteLut } from "./palettes";
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
  matchingLevel,
  pickLevel,
  pyramidLevels,
  regionBox,
  windowBox,
} from "./window-source";

/** x0, x1, y0, y1, z0, z1 in µm. */
export type CubeCut = [number, number, number, number, number, number];

export type CubeLoadState = {
  labels: "off" | "loading" | "on" | "error";
  /** Volumes the raycast draws: 1 the image, 2 the image and the window's label texture. */
  channels: 1 | 2;
  pan: [number, number];
  /** The displayed level. */
  level: number;
  /** A coarser level is shown while the target level loads. */
  refining: boolean;
  /** Set when the target level failed and the coarse view stays: `Could not refine: <message>`. */
  refineError?: string;
  /** Set when the image (or its window, with no coarse view to keep) failed to load. */
  imageError?: string;
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
  labelsUrl: string;
  /** z, y, x */
  voxelSizeUm: [number, number, number];
  originUm: [number, number, number];
  windowCx: number;
  windowCy: number;
  windowSizeUm: number;
  /** Shown cut (already the live value); clamped to the window and the stack here. */
  cut: CubeCut;
  contrast: [number, number];
  mode: "additive" | "mip";
  /** Applied when it changes: the preset's rotation (framed as its home view with `reframeOnPreset`). */
  preset: ViewPreset | null;
  /** The home view (first view and Reset). Default "iso". */
  home?: ViewPreset;
  /** Default false: a preset keeps the user's zoom. True frames the window as the preset's home view. */
  reframeOnPreset?: boolean;
  /** Bump to reset the camera to the home view. */
  resetTick: number;
  showLabels: boolean;
  groups: HighlightGroup[];
  render: RenderSettings;
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
  /** Decoded chunks shared across the widget's cubes. */
  chunkCache?: ChunkCache | null;
  /** Hold the cache's background prefetch while this cube's target loads. */
  pausesPrefetch?: boolean;
  /** Called after each deck render. */
  onRendered?: (canvas: HTMLCanvasElement) => void;
  /** Called when each pyramid opens: the image levels, and the labels levels once wanted (else null). */
  onLevels?: (image: ZarrSource[], labels: ZarrSource[] | null) => void;
  /** Called when the shown window changes: its level index and voxel box. */
  onShown?: (level: number, box: Box) => void;
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

const IMAGE_COLORS: [number, number, number][] = [[220, 225, 230]];
/** Viv's per-channel props for the one image channel (stable, so Viv never refetches for them). */
const ONE_CHANNEL = [{}];
const ONE_CHANNEL_VISIBLE = [true];

/**
 * Tissue Z points up the screen. Viv's orbit view spins about world Y, so rotating
 * data Z onto world Y makes the orbit a turntable around the stack and Z slicing
 * cut horizontal slabs: (x, y, z) -> (x, z, -y).
 */
const Z_UP = new Matrix4().rotateX(-Math.PI / 2);

function absoluteUrl(url: string): string {
  if (!url) return url;
  return new URL(url, window.location.href).href;
}

export function clampRange(lo: number, hi: number, min: number, max: number): [number, number] {
  const a = Math.max(min, Math.min(lo, hi));
  // A range wholly outside [min, max] collapses to empty rather than inverting.
  return [a, Math.max(a, Math.min(max, Math.max(lo, hi)))];
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
 * The Viv volume cube for one inspect window: loads the OME-Zarr image (and
 * labels on first use), fetches the window's voxels and draws them with the
 * cube shader. Everything it shows comes from props; it reports what it loaded,
 * the ranges its cuts can take and the camera preset back through callbacks.
 */
export function VolumeCube({
  imageUrl,
  labelsUrl,
  voxelSizeUm,
  originUm,
  windowCx: window_cx,
  windowCy: window_cy,
  windowSizeUm: window_size_um,
  cut,
  contrast,
  mode,
  preset,
  home = "iso",
  reframeOnPreset = false,
  resetTick,
  showLabels,
  groups,
  render,
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
  chunkCache = null,
  pausesPrefetch = false,
  onRendered,
  onLevels,
  onShown,
}: VolumeCubeProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const fixedHeight = typeof height === "number";
  const [box, setBox] = useState({ width: 640, height: 520 });
  const [image, setImage] = useState<ZarrSource[] | null>(null);
  const [labels, setLabels] = useState<ZarrSource[] | null>(null);
  const [error, setError] = useState("");
  const [labelsError, setLabelsError] = useState("");
  const [viewState, setViewState] = useState<ViewState | null>(null);
  /** Pan must not drift the cube; the window moves the content instead. */
  const fixedTargetRef = useRef<number[] | null>(null);

  useEffect(() => {
    const node = hostRef.current;
    if (!node) return;
    let raf = 0;
    const apply = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const rect = node.getBoundingClientRect();
        // Hidden (display: none): keep the last size.
        if (!rect.width || !rect.height) return;
        // A fixed height is laid out as given (the preview is smaller than the floor).
        const width = fixedHeight ? Math.round(rect.width) : Math.max(320, Math.round(rect.width));
        const height = fixedHeight ? Math.round(rect.height) : Math.max(360, Math.round(rect.height));
        setBox((prev) => (prev.width === width && prev.height === height ? prev : { width, height }));
      });
    };
    apply();
    const obs = new ResizeObserver(apply);
    obs.observe(node);
    return () => {
      cancelAnimationFrame(raf);
      obs.disconnect();
    };
  }, [fixedHeight]);

  useEffect(() => {
    let cancelled = false;
    setError("");
    setImage(null);
    setViewState(null);
    if (!imageUrl) return;
    (async () => {
      try {
        const loaded = await loadOmeZarr(absoluteUrl(imageUrl), { type: "multiscales" });
        const pyramid = loaded.data as unknown as ZarrSource[];
        pyramid.forEach((level, i) => chunkCache?.attach(level._data, `${imageUrl}#${i}`));
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

  // Labels load on first use and then stay: the Labels switch and highlights
  // only rewrite a colour lookup, never the loaded volume.
  const [labelsWanted, setLabelsWanted] = useState(false);
  useEffect(() => {
    if (showLabels) setLabelsWanted(true);
  }, [showLabels]);
  const wantLabels = Boolean(labelsUrl) && labelsWanted;
  useEffect(() => {
    let cancelled = false;
    setLabels(null);
    setLabelsError("");
    if (!wantLabels) return;
    (async () => {
      try {
        const lab = await loadOmeZarr(absoluteUrl(labelsUrl), { type: "multiscales" });
        const pyramid = lab.data as unknown as ZarrSource[];
        pyramid.forEach((level, i) => chunkCache?.attach(level._data, `${labelsUrl}#${i}`));
        if (!cancelled) setLabels(pyramid);
      } catch (err) {
        if (!cancelled) setLabelsError(errorText(err));
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantLabels, labelsUrl]);

  const onLevelsRef = useLatest(onLevels);
  useEffect(() => {
    if (image) onLevelsRef.current?.(image, labels);
  }, [image, labels, onLevelsRef]);

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
  // Labels share the image's grid, so the same voxel box cuts both.
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
    return { level, box, cells: labels ? matchingLevel(labels, level) : null };
  }, [levels, labels, frame, cx, cy, window_size_um, budget, regionScale, regionBudget, regionCx, regionCy]);
  // The dock's first step: a level coarse enough to arrive at once.
  const coarseScale = coarse?.scale ?? 0;
  const coarseBudget = coarse?.budget ?? 0;
  const coarseTarget: WindowTarget | null = useMemo(() => {
    if (!levels || !coarseScale || regionScale) return null;
    const level = pickLevel(levels, frame, window_size_um * coarseScale, coarseBudget);
    const box = windowBox(level, frame, cx, cy, window_size_um);
    return { level, box, cells: labels ? matchingLevel(labels, level) : null };
  }, [levels, labels, frame, cx, cy, window_size_um, coarseScale, coarseBudget, regionScale]);
  const labelsMismatch = Boolean(wantLabels && labels && target && !target.cells);

  const { shown, shownIsCoarse, imageError, cellsError } = useShownWindow({
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
  // identity, from memory here). Labels arriving for the same window leave it be.
  const shownImage = shown?.image ?? null;
  const loader = useMemo(() => (shownImage ? [shownImage] : null), [shownImage]);
  // Tags each volume Viv reads with its window, so the shader draws the labels
  // of the image Viv is drawing (see CellVolume).
  const onViewportLoad = useMemo(
    () => (shownImage ? (volumes: { data: unknown }[]) => markVivVolume(volumes[0]?.data, shownImage) : undefined),
    [shownImage],
  );
  const cells = shown?.cells ?? null;
  const hasCells = Boolean(cells);
  // The label texture a layer draws now (set from the draw, once uploaded).
  const [gpuCells, setGpuCells] = useState<CellVolume | null>(null);
  const onCellsBound = useCallback((c: CellVolume | null) => setGpuCells(c), []);
  const cellsOnGpu = Boolean(cells && gpuCells === cells);
  const cellGroups = showLabels ? groups : null;
  const imagePalette = useMemo(() => paletteLut(render.palette), [render.palette]);

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
  const extentZ = base ? ozUm + axisSize(base, "z") * szUm : ozUm;
  const half = window_size_um / 2;
  const winX = clampRange(window_cx - half, window_cx + half, oxUm, extentX);
  const winY = clampRange(window_cy - half, window_cy + half, oyUm, extentY);
  const stackZ: Range = [ozUm, extentZ];

  const xShown = clampRange(cut[0], cut[1], winX[0], winX[1]);
  const yShown = clampRange(cut[2], cut[3], winY[0], winY[1]);
  const zShown = clampRange(cut[4], cut[5], stackZ[0], stackZ[1]);

  // Cuts in the loaded volume's voxel space, already clamped to the requested
  // window (so a panning volume is clipped to the frame). Viv's texture stores
  // rows reversed: a Y cut on data rows [a, b] is texture rows [height - b, height - a].
  const xSlice = useMemo(() => {
    const step = levelVoxel ? levelVoxel[2] : 1;
    const x0 = shownBox ? shownBox.x0 : 0;
    return clampRange((xShown[0] - oxUm) / step - x0, (xShown[1] - oxUm) / step - x0, 0, shownW);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [xShown[0], xShown[1], oxUm, shownW, shownBox?.x0, levelVoxel?.[2]]);
  const ySlice = useMemo(() => {
    const step = levelVoxel ? levelVoxel[1] : 1;
    const y0 = shownBox ? shownBox.y0 : 0;
    const [a, b] = clampRange((yShown[0] - oyUm) / step - y0, (yShown[1] - oyUm) / step - y0, 0, shownH);
    return [shownH - b, shownH - a] as [number, number];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yShown[0], yShown[1], oyUm, shownH, shownBox?.y0, levelVoxel?.[1]]);
  // Place the loaded volume in the requested window's world frame: x shifts by
  // the boxes' x0 offset; y by their y1 offset, because texture rows run reversed.
  const panX = shownBox && liveBox ? shownBox.x0 - liveBox.x0 : 0;
  const panY = shownBox && liveBox ? liveBox.y1 - shownBox.y1 : 0;
  const volumeMatrix = useMemo(
    () => (panX === 0 && panY === 0 ? Z_UP : Z_UP.clone().translate([panX, panY * ry, 0])),
    [panX, panY, ry],
  );
  const zSlice = useMemo(() => {
    const scale = levelVoxel ? levelVoxel[0] : 1;
    return clampRange((zShown[0] - ozUm) / scale, (zShown[1] - ozUm) / scale, 0, levelDepth);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zShown[0], zShown[1], ozUm, levelDepth, levelVoxel?.[0]]);

  // Centre of the whole window box in world units (physical scale, then Z_UP).
  // Deliberately not the cut region's centre: cross-sections must not move the cube.
  const aimTarget = useMemo(
    () => Array.from(Z_UP.transformPoint([winW / 2, (winH / 2) * ry, (levelDepth / 2) * rz])),
    [winW, winH, ry, rz, levelDepth],
  );
  fixedTargetRef.current = aimTarget;

  // Fit the nominal window (not the clamped box, so the zoom holds at edges) and
  // the full stack height, as each preset sees the box.
  const fits = useMemo((): Record<ViewPreset, Fit[]> | null => {
    if (!level) return null;
    const wx = Math.min(axisSize(level.source, "x"), window_size_um / (sxUm * level.factor[2]));
    const wy = Math.min(axisSize(level.source, "y"), window_size_um / (syUm * level.factor[1])) * ry;
    const depth = levelDepth * rz;
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
  }, [level, window_size_um, sxUm, syUm, ry, levelDepth, rz]);
  const framing = useLatest({ fits, box });

  useEffect(() => {
    if (fits && !viewState) setViewState(homeView(home, fits, box));
  }, [fits, viewState, box, home]);
  // A fixed camera (no controller) always frames the window: it follows the
  // window's size and the view's (a preview mounted hidden is measured later).
  useEffect(() => {
    if (!interactive && fits) setViewState(homeView(home, fits, box));
  }, [interactive, fits, box, home]);

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
    const { fits: f, box: b } = framing.current;
    if (f) setViewState(homeView(home, f, b));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetTick]);

  // A preset turns the camera, or with `reframeOnPreset` frames the window as
  // that preset's home view. A camera already at the preset is left alone, so
  // echoing onPreset back (or orbiting to within a preset's tolerance) never
  // snaps the camera.
  useEffect(() => {
    if (!preset) return;
    const { fits: f, box: b } = framing.current;
    setViewState((prev) => {
      if (!prev || presetOf(prev) === preset) return prev;
      return reframeOnPreset && f ? homeView(preset, f, b) : { ...prev, ...PRESETS[preset] };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset]);

  const cameraPreset = presetOf(viewState);
  const onPresetRef = useLatest(onPreset);
  useLayoutEffect(() => {
    onPresetRef.current?.(cameraPreset);
  }, [cameraPreset, onPresetRef]);

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
      setViewState((prev) => (prev && viewStatesEqual(prev, clamped) ? prev : clamped));
      return clamped;
    },
    [],
  );

  // One channel, the image; cells come from the label texture beside it. The
  // cube shader colours the image from `imagePalette`; `colors` is unused by it
  // and only satisfies Viv's props.
  const contrastLimits = useMemo(() => [[contrast[0], contrast[1]]] as [number, number][], [contrast[0], contrast[1]]);

  const cubeFrame: CubeFrame | null = useMemo(
    () =>
      // No frame around an empty window (Inspect outside the volume).
      levelVoxel && winW > 0 && winH > 0
        ? { size: [winW, winH * ry, levelDepth * rz], umPerUnit: levelVoxel[2], zOriginUm: ozUm, dark }
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [winW, winH, ry, rz, levelDepth, levelVoxel?.[2], ozUm, dark],
  );

  // Map geometry on the stack's top face, placed in the requested window like
  // the frame (so it slides with the window, as the volume does) and clipped to it.
  const lvx = levelVoxel?.[2] ?? 1;
  const lvy = levelVoxel?.[1] ?? 1;
  const placedOverlays = useMemo(() => {
    if (!overlays?.length || !liveBox || !cubeFrame) return null;
    const { x0, y1 } = liveBox;
    // Texture rows run reversed: the window's top edge (row y0) is at world y = height.
    const toWorld = ([x, y]: [number, number]): [number, number] => [
      (x - oxUm) / lvx - x0,
      (y1 - (y - oyUm) / lvy) * ry,
    ];
    return placeOverlays(overlays, toWorld, { x0: 0, x1: winW, y0: 0, y1: winH * ry }, levelDepth * rz);
  }, [overlays, liveBox, cubeFrame, oxUm, oyUm, lvx, lvy, ry, rz, winW, winH, levelDepth]);

  const views = useMemo(
    () => [new FramedVolumeView({ id: "3d", target: aimTarget, useFixedAxis: true, controller: interactive } as never)],
    [aimTarget, interactive],
  );
  const onRenderedRef = useLatest(onRendered);
  const deckProps = useMemo(
    () => ({
      onAfterRender: ({ gl }: { gl: WebGL2RenderingContext }) =>
        onRenderedRef.current?.(gl.canvas as HTMLCanvasElement),
    }),
    [onRenderedRef],
  );
  const layerProps = useMemo(
    () =>
      loader
        ? [
            {
              loader,
              onViewportLoad,
              contrastLimits,
              colors: IMAGE_COLORS,
              channelsVisible: ONE_CHANNEL_VISIBLE,
              selections: ONE_CHANNEL,
              xSlice,
              ySlice,
              zSlice,
              resolution: 0,
              extensions: CUBE_EXTENSIONS[mode],
              cellVolume: cells,
              cellGroups,
              onCellsBound,
              imagePalette,
              render,
              modelMatrix: volumeMatrix,
              frameMatrix: Z_UP,
              clippingPlanes: [],
              cubeFrame,
              cubeOverlays: placedOverlays,
            },
          ]
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      loader,
      onViewportLoad,
      contrastLimits,
      xSlice,
      ySlice,
      zSlice,
      mode,
      cells,
      cellGroups,
      onCellsBound,
      imagePalette,
      render,
      cubeFrame,
      placedOverlays,
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
  const settled = Boolean(shown && target && shown.level.index === target.level.index);
  const refining = !settled && !error && !imageError && !outside;
  // The image failed with nothing kept on screen.
  const loadError = error || (refineFailed ? "" : imageError);

  // Labels only show over a loaded image, so an image failure fails them too.
  const labelsFailure = labelsError || cellsError || error || (refineFailed ? "" : imageError);
  let status = "";
  if (!image) status = error || "Loading volume…";
  else if (imageError && !refineFailed) status = `Could not load this window: ${imageError}`;
  else if (outside) status = "Inspect window is outside the volume";
  // The image is open but no window has arrived yet: nothing is drawn.
  else if (!shown) status = "Loading window…";
  else if (labelsMismatch) status = "Labels are on a different grid from the image";
  else if (showLabels && labelsFailure === TOO_MANY_CELLS) status = TOO_MANY_CELLS;
  else if (showLabels && labelsFailure) status = `Could not load labels: ${labelsFailure}`;

  let labelsState: CubeLoadState["labels"] = "off";
  if (showLabels) {
    if (labelsMismatch || labelsFailure) labelsState = "error";
    else labelsState = hasCells ? "on" : "loading";
  }
  const highlighted = showLabels && hasCells ? groups.filter((g) => g.labels.length > 0) : NO_GROUPS;
  const legend = showLegend ? highlighted : NO_GROUPS;
  const channels = showLabels && cellsOnGpu ? 2 : 1;
  const levelIndex = level ? level.index : 0;

  const contrastMax = base && base.dtype === "Uint8" ? 255 : Math.max(255, Math.ceil(contrast[1] * 4));

  // Layout effects: the caller's readout and data-* mirrors update before paint.
  const onLoadStateRef = useLatest(onLoadState);
  useLayoutEffect(() => {
    onLoadStateRef.current?.({
      labels: labelsState,
      channels,
      pan: [panX, panY],
      level: levelIndex,
      refining,
      refineError,
      imageError: loadError,
    });
  }, [labelsState, channels, panX, panY, levelIndex, refining, refineError, loadError, onLoadStateRef]);

  // Reported once the image is open: before that the volume has no extent.
  const onBoundsRef = useLatest(onBounds);
  const hasExtent = Boolean(base);
  useLayoutEffect(() => {
    if (!hasExtent) return;
    onBoundsRef.current?.({ winX, winY, stackZ, volumeX: [oxUm, extentX], volumeY: [oyUm, extentY], contrastMax });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasExtent, winX[0], winX[1], winY[0], winY[1], stackZ[0], stackZ[1], extentX, extentY, contrastMax, onBoundsRef]);

  return (
    <div
      ref={hostRef}
      className={cn("volume-cube__view relative w-full overflow-hidden rounded-md", background && "bg-neutral-950")}
      style={{ height }}
      data-labels={labelsState}
      data-channels={channels}
      data-label-format={cellsOnGpu ? "rg8" : "none"}
      data-label-cells={cells?.count ?? 0}
      data-highlight={highlighted.length}
      data-render={mode}
      data-pan={`${panX},${panY}`}
      data-palette={render.palette}
      data-image-gamma={render.imageGamma}
      data-level={shown?.level.index ?? -1}
      data-refining={String(refining)}
      data-overlays={placedOverlays?.count ?? 0}
      data-zoom={viewState ? viewState.zoom.toFixed(2) : ""}
      data-pitch={viewState ? Math.round(viewState.rotationX) : ""}
    >
      {layerProps && displayViewStates ? (
        <VivViewer
          {...({
            layerProps,
            views,
            viewStates: displayViewStates,
            onViewStateChange,
            useDevicePixels: false,
            deckProps,
          } as unknown as React.ComponentProps<typeof VivViewer>)}
        />
      ) : null}
      {status ? <p className="p-4 text-sm text-neutral-400">{status}</p> : null}
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

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
