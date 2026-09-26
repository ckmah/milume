import type React from "react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Matrix4 } from "@math.gl/core";
import { VivViewer, loadOmeZarr } from "@hms-dbmi/viv";

import { Badge } from "@/components/ui/badge";

import type { ChunkCache } from "./chunk-cache";
import {
  CUBE_EXTENSIONS,
  EMPTY_CELL_LUT,
  type HighlightGroup,
  type RenderSettings,
  buildCellLut,
} from "./cell-lut-extension";
import type { Range, ViewPreset } from "./CubeControls";
import { type CubeFrame, FramedVolumeView } from "./frame-layers";
import { paletteLut } from "./palettes";
import { type WindowTarget, levelVoxelSize, useShownWindow } from "./use-shown-window";
import {
  type Box,
  type Frame,
  type Level,
  type ZarrSource,
  LabelVolumeSource,
  MAX_TEXTURE_AXIS,
  WINDOW_VOXEL_BUDGET,
  axisSize,
  boxIsEmpty,
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
  channels: 1 | 2;
  pan: [number, number];
  /** The displayed level. */
  level: number;
  /** A coarser level is shown while the target level loads. */
  refining: boolean;
  /** Set when the target level failed and the coarse view stays: `Could not refine: <message>`. */
  refineError?: string;
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
  /** Applied when it changes. */
  preset: ViewPreset | null;
  /** Bump to reset the camera. */
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
  /** Decoded chunks shared across the widget's cubes. */
  chunkCache?: ChunkCache | null;
  /** Hold the cache's background prefetch while this cube's target loads. */
  pausesPrefetch?: boolean;
  /** Called after each deck render. */
  onRendered?: (canvas: HTMLCanvasElement) => void;
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
/** Camera tilt runs from head-on (0°, perpendicular to Z) to straight down (90°). */
const MIN_PITCH = 0;
const MAX_PITCH = 90;
const PRESETS: Record<ViewPreset, { rotationX: number; rotationOrbit: number }> = {
  // Orbit 0 from above shows x right and y down, the same as the Landmarks map.
  top: { rotationX: 90, rotationOrbit: 0 },
  iso: { rotationX: ISO_PITCH, rotationOrbit: 45 },
  side: { rotationX: 0, rotationOrbit: 0 },
};
const HOME_ZOOM_BACKOFF = 0.3;
const NO_GROUPS: HighlightGroup[] = [];
/** Coalesce the separate window_cx / window_cy updates of one inspect click. */
const WINDOW_DEBOUNCE_MS = 120;

const IMAGE_COLOR: [number, number, number] = [220, 225, 230];

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

/** Home camera frames the inspect window, in the window source's world units. */
function isoHome(fit: { width: number; height: number }, view: { width: number; height: number }): ViewState {
  const zoom = Math.log2(Math.min(view.width / fit.width, view.height / fit.height)) - HOME_ZOOM_BACKOFF;
  return {
    id: "3d",
    target: [0, 0, 0],
    zoom,
    ...PRESETS.iso,
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
  chunkCache = null,
  pausesPrefetch = false,
  onRendered,
}: VolumeCubeProps) {
  const hostRef = useRef<HTMLDivElement>(null);
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
        const width = Math.max(320, Math.round(rect.width));
        const height = Math.max(360, Math.round(rect.height));
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
  }, []);

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

  const { shown, imageError, cellsError } = useShownWindow({
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
  // The window asked for right now, before the debounced fetch catches up.
  const liveBox = useMemo(
    () => (level ? windowBox(level, frame, window_cx, window_cy, window_size_um) : null),
    [level, frame, window_cx, window_cy, window_size_um],
  );

  // Voxel size at the shown level, and world scale relative to X (Viv's convention).
  const levelVoxel: [number, number, number] | null = level ? levelVoxelSize(frame, level) : null;
  const ry = levelVoxel ? levelVoxel[1] / levelVoxel[2] : 1;
  const rz = levelVoxel ? levelVoxel[0] / levelVoxel[2] : 1;

  // Viv is only handed sources whose fetch has resolved, so a new loader swaps
  // in at once (VolumeLayer refetches per loader identity, from memory here).
  const loader = useMemo(() => {
    if (!shown) return null;
    return shown.cells ? [new LabelVolumeSource(shown.image, shown.cells)] : [shown.image];
  }, [shown]);
  const hasCells = Boolean(shown?.cells);
  const cellLut = useMemo(() => (showLabels ? buildCellLut(groups) : EMPTY_CELL_LUT), [showLabels, groups]);
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
  // the full stack height, which is what stands vertical on screen.
  const fit = useMemo(() => {
    if (!level) return null;
    const wx = Math.min(axisSize(level.source, "x"), window_size_um / (sxUm * level.factor[2]));
    const wy = Math.min(axisSize(level.source, "y"), window_size_um / (syUm * level.factor[1])) * ry;
    // Screen footprint of the upright box at orbit 45 and ISO_PITCH: the horizontal
    // diagonal across, and the stack height foreshortened plus the tilted top face.
    const pitch = (ISO_PITCH * Math.PI) / 180;
    const diagonal = Math.hypot(wx, wy);
    const height = levelDepth * rz * Math.cos(pitch) + diagonal * Math.sin(pitch);
    // Room for the axis labels drawn just outside the box.
    return { width: diagonal * 1.12, height: height * 1.12 };
  }, [level, window_size_um, sxUm, syUm, ry, levelDepth, rz]);

  useEffect(() => {
    if (fit && !viewState) setViewState(isoHome(fit, box));
  }, [fit, viewState, box]);

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

  // Reset reframes the window from the iso home; the first tick is the mount.
  const resetTickRef = useRef(resetTick);
  useEffect(() => {
    if (resetTickRef.current === resetTick) return;
    resetTickRef.current = resetTick;
    if (fit) setViewState(isoHome(fit, box));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetTick]);

  // A camera already at the preset is left alone, so echoing onPreset back
  // (or orbiting to within a preset's tolerance) never snaps the camera.
  useEffect(() => {
    if (!preset) return;
    setViewState((prev) => (prev && presetOf(prev) !== preset ? { ...prev, ...PRESETS[preset] } : prev));
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

  // Channel 0 is the image; channel 1, once labels load, the signed label ids.
  // The cube shader colours both (the image from `imagePalette`, cells from
  // `cellLut`); `colors` is unused by it and only satisfies Viv's props.
  const selections = useMemo(() => (hasCells ? [{ c: 0 }, { c: 1 }] : [{}]), [hasCells]);
  const channelsVisible = useMemo(() => selections.map(() => true), [selections]);
  const contrastLimits = useMemo(
    () => [[contrast[0], contrast[1]], ...(hasCells ? [[0, 1]] : [])] as [number, number][],
    [contrast[0], contrast[1], hasCells],
  );
  const colors = useMemo(() => [IMAGE_COLOR, ...(hasCells ? [[0, 0, 0]] : [])], [hasCells]);

  const cubeFrame: CubeFrame | null = useMemo(
    () =>
      // No frame around an empty window (Inspect outside the volume).
      levelVoxel && winW > 0 && winH > 0
        ? { size: [winW, winH * ry, levelDepth * rz], umPerUnit: levelVoxel[2], zOriginUm: ozUm, dark }
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [winW, winH, ry, rz, levelDepth, levelVoxel?.[2], ozUm, dark],
  );

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
              contrastLimits,
              colors,
              channelsVisible,
              selections,
              xSlice,
              ySlice,
              zSlice,
              resolution: 0,
              extensions: CUBE_EXTENSIONS[mode],
              cellLut,
              imagePalette,
              render,
              modelMatrix: volumeMatrix,
              frameMatrix: Z_UP,
              clippingPlanes: [],
              cubeFrame,
            },
          ]
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      loader,
      contrastLimits,
      colors,
      channelsVisible,
      selections,
      xSlice,
      ySlice,
      zSlice,
      mode,
      cellLut,
      imagePalette,
      render,
      cubeFrame,
      volumeMatrix,
    ],
  );

  const outside = target
    ? boxIsEmpty(regionScale ? windowBox(target.level, frame, cx, cy, window_size_um) : target.box)
    : false;
  // A failed target with a coarser view already shown keeps that view; the error
  // goes to the caller's title bar rather than over the canvas.
  const refineFailed = Boolean(imageError && shown && target && shown.level.index !== target.level.index);
  const refineError = refineFailed ? `Could not refine: ${imageError}` : "";
  const settled = Boolean(shown && target && shown.level.index === target.level.index);
  const refining = !settled && !error && !imageError && !outside;

  // Labels only show over a loaded image, so an image failure fails them too.
  const labelsFailure = labelsError || cellsError || error || (refineFailed ? "" : imageError);
  let status = "";
  if (!image) status = error || "Loading volume…";
  else if (imageError && !refineFailed) status = `Could not load this window: ${imageError}`;
  else if (outside) status = "Inspect window is outside the volume";
  else if (labelsMismatch) status = "Labels are on a different grid from the image";
  else if (showLabels && labelsFailure) status = `Could not load labels: ${labelsFailure}`;

  let labelsState: CubeLoadState["labels"] = "off";
  if (showLabels) {
    if (labelsMismatch || labelsFailure) labelsState = "error";
    else labelsState = hasCells ? "on" : "loading";
  }
  const highlighted = showLabels && hasCells ? groups.filter((g) => g.labels.length > 0) : NO_GROUPS;
  const legend = showLegend ? highlighted : NO_GROUPS;
  const channels = hasCells ? 2 : 1;
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
    });
  }, [labelsState, channels, panX, panY, levelIndex, refining, refineError, onLoadStateRef]);

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
      className="volume-cube__view relative w-full overflow-hidden rounded-md bg-neutral-950"
      style={{ height }}
      data-labels={labelsState}
      data-channels={channels}
      data-highlight={highlighted.length}
      data-render={mode}
      data-pan={`${panX},${panY}`}
      data-palette={render.palette}
      data-image-gamma={render.imageGamma}
      data-level={shown?.level.index ?? -1}
      data-refining={String(refining)}
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

/** Whether one box fits `budget` voxels and the 3D texture axis limit. */
function fitsBudget(b: Box, budget: number): boolean {
  const d = b.z1 - b.z0;
  const h = b.y1 - b.y0;
  const w = b.x1 - b.x0;
  return d * h * w <= budget && Math.max(d, h, w) <= MAX_TEXTURE_AXIS;
}
