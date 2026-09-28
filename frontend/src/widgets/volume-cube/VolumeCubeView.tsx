import { useCallback, useEffect, useRef, useState } from "react";

import { useNotebookTheme } from "@/hooks/use-notebook-theme";
import { useModel } from "@/hooks/use-model";
import { cn } from "@/lib/utils";

import { DEFAULT_RENDER, type HighlightGroup } from "./cell-lut-extension";
import { CubeControls, type RenderMode, type ViewPreset, useLiveRange } from "./CubeControls";
import { type CubeBounds, type CubeCut, type CubeLoadState, VolumeCube, clampRange } from "./VolumeCube";

type VolumeCubeModel = {
  image_url: string;
  labels_url: string;
  window_cx: number;
  window_cy: number;
  window_size_um: number;
  slice_x_min: number;
  slice_x_max: number;
  slice_y_min: number;
  slice_y_max: number;
  slice_z_min: number;
  slice_z_max: number;
  contrast_limits: [number, number];
  voxel_size_um: [number, number, number];
  origin_um: [number, number, number];
  highlight_groups: HighlightGroup[];
};

const DEFAULT_CONTRAST: [number, number] = [0, 48];
const DEFAULT_VOXEL_SIZE: [number, number, number] = [1, 1, 1];
const DEFAULT_ORIGIN: [number, number, number] = [0, 0, 0];
const NO_GROUPS: HighlightGroup[] = [];
const INITIAL_LOAD: CubeLoadState = { labels: "off", channels: 1, pan: [0, 0], level: 0 };

type AnyModel = {
  get(key: string): unknown;
  set(key: string, value: unknown): void;
  save_changes(): void;
  on(event: string, callback: () => void): void;
  off?(event: string, callback: () => void): void;
};

export function VolumeCubeView({ model, hostEl }: { hostEl: HTMLElement; model: AnyModel }) {
  const dark = useNotebookTheme(hostEl.parentElement);
  const {
    image_url,
    labels_url,
    window_cx,
    window_cy,
    window_size_um,
    slice_x_min,
    slice_x_max,
    slice_y_min,
    slice_y_max,
    slice_z_min,
    slice_z_max,
    contrast_limits,
    voxel_size_um,
    origin_um,
    highlight_groups,
  } = useModel<VolumeCubeModel>(model, [
    "image_url",
    "labels_url",
    "window_cx",
    "window_cy",
    "window_size_um",
    "slice_x_min",
    "slice_x_max",
    "slice_y_min",
    "slice_y_max",
    "slice_z_min",
    "slice_z_max",
    "contrast_limits",
    "voxel_size_um",
    "origin_um",
    "highlight_groups",
  ]);

  const commit = useCallback(
    (patch: Record<string, unknown>) => {
      for (const [k, v] of Object.entries(patch)) model.set(k, v);
      model.save_changes();
    },
    [model],
  );

  const [showLabels, setShowLabels] = useState(false);
  const [mode, setMode] = useState<RenderMode>("additive");
  /** Follows the camera (onPreset); a toolbar pick changes it and the cube applies it. */
  const [preset, setPreset] = useState<ViewPreset | null>(null);
  const [resetTick, setResetTick] = useState(0);
  const [loadState, setLoadState] = useState<CubeLoadState>(INITIAL_LOAD);
  const [reportedBounds, setReportedBounds] = useState<CubeBounds | null>(null);

  const groups = highlight_groups ?? NO_GROUPS;
  // Python highlighting cells is a request to see them: turn Labels on.
  useEffect(() => {
    if (groups.length > 0 && labels_url) setShowLabels(true);
  }, [groups, labels_url]);

  const voxelSize = voxel_size_um ?? DEFAULT_VOXEL_SIZE;
  const origin = origin_um ?? DEFAULT_ORIGIN;
  const [ozUm, oyUm, oxUm] = origin;
  const half = window_size_um / 2;
  const [contrastLo, contrastHi] = contrast_limits ?? DEFAULT_CONTRAST;
  // Until the cube reports its bounds (the image is still loading) the volume has no extent.
  const bounds: CubeBounds = reportedBounds ?? {
    winX: clampRange(window_cx - half, window_cx + half, oxUm, oxUm),
    winY: clampRange(window_cy - half, window_cy + half, oyUm, oyUm),
    stackZ: [ozUm, ozUm],
    volumeX: [oxUm, oxUm],
    volumeY: [oyUm, oyUm],
    contrastMax: Math.max(255, Math.ceil(contrastHi * 4)),
  };
  const { winX, winY, stackZ } = bounds;

  // X/Y cuts follow the window: a full cut stays full, a partial one keeps its
  // place relative to the window's edge. The widget writes the new traits once.
  const prevWindowRef = useRef<{ x0: number; y0: number } | null>(null);
  useEffect(() => {
    const prev = prevWindowRef.current;
    const x0 = window_cx - half;
    const y0 = window_cy - half;
    prevWindowRef.current = { x0, y0 };
    if (!prev || (prev.x0 === x0 && prev.y0 === y0)) return;
    const follow = (lo: number, hi: number, p0: number, n0: number): [number, number] =>
      lo <= p0 + 1e-6 && hi >= p0 + window_size_um - 1e-6 ? [n0, n0 + window_size_um] : [lo - p0 + n0, hi - p0 + n0];
    const [xl, xh] = follow(slice_x_min, slice_x_max, prev.x0, x0);
    const [yl, yh] = follow(slice_y_min, slice_y_max, prev.y0, y0);
    commit({ slice_x_min: xl, slice_x_max: xh, slice_y_min: yl, slice_y_max: yh });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [window_cx, window_cy, window_size_um]);

  // Live mirrors: sliders render every frame and commit to the traits on release.
  const [xLive, setXLive] = useLiveRange([slice_x_min, slice_x_max]);
  const [yLive, setYLive] = useLiveRange([slice_y_min, slice_y_max]);
  const [zLive, setZLive] = useLiveRange([slice_z_min, slice_z_max]);
  const [cLive, setCLive] = useLiveRange([contrastLo, contrastHi]);
  const xShown = clampRange(xLive[0], xLive[1], winX[0], winX[1]);
  const yShown = clampRange(yLive[0], yLive[1], winY[0], winY[1]);
  const zShown = clampRange(zLive[0], zLive[1], stackZ[0], stackZ[1]);
  const cut: CubeCut = [xLive[0], xLive[1], yLive[0], yLive[1], zLive[0], zLive[1]];

  // The cube sizes the contrast range from the contrast it draws, which leads
  // the trait during a drag. Hold the range until the drag commits, so it only
  // follows the committed trait (a moving max under the thumb would run away).
  const contrastDragging = cLive[0] !== contrastLo || cLive[1] !== contrastHi;
  const contrastMaxRef = useRef(bounds.contrastMax);
  if (!contrastDragging) contrastMaxRef.current = bounds.contrastMax;
  const contrastMax = contrastMaxRef.current;

  const readZ = clampRange(slice_z_min, slice_z_max, stackZ[0], stackZ[1]);
  const readX = clampRange(slice_x_min, slice_x_max, winX[0], winX[1]);
  const readY = clampRange(slice_y_min, slice_y_max, winY[0], winY[1]);
  const sliceReadout = `X ${Math.round(readX[0])}–${Math.round(readX[1])} · Y ${Math.round(readY[0])}–${Math.round(readY[1])} · Z ${Math.round(readZ[0])}–${Math.round(readZ[1])}`;
  const highlighted = showLabels && loadState.channels === 2 ? groups.filter((g) => g.labels.length > 0).length : 0;

  return (
    <div
      className={cn("spatial-rx-widget volume-cube relative min-w-0 w-full", dark && "dark")}
      data-labels={loadState.labels}
      data-channels={loadState.channels}
      data-highlight={highlighted}
      data-render={mode}
      data-pan={`${loadState.pan[0]},${loadState.pan[1]}`}
    >
      <VolumeCube
        imageUrl={image_url}
        labelsUrl={labels_url}
        voxelSizeUm={voxelSize}
        originUm={origin}
        windowCx={window_cx}
        windowCy={window_cy}
        windowSizeUm={window_size_um}
        cut={cut}
        contrast={cLive}
        mode={mode}
        preset={preset}
        resetTick={resetTick}
        showLabels={showLabels}
        groups={groups}
        render={DEFAULT_RENDER}
        dark={dark}
        onLoadState={setLoadState}
        onBounds={setReportedBounds}
        onPreset={setPreset}
      />
      <CubeControls
        preset={preset}
        onPreset={setPreset}
        onReset={() => setResetTick((t) => t + 1)}
        mode={mode}
        onMode={setMode}
        labelsAvailable={Boolean(labels_url)}
        showLabels={showLabels}
        onShowLabels={setShowLabels}
        cuts={{
          x: {
            bounds: winX,
            value: xShown,
            onLive: setXLive,
            onCommit: (v) => commit({ slice_x_min: v[0], slice_x_max: v[1] }),
          },
          y: {
            bounds: winY,
            value: yShown,
            onLive: setYLive,
            onCommit: (v) => commit({ slice_y_min: v[0], slice_y_max: v[1] }),
          },
          z: {
            bounds: stackZ,
            value: zShown,
            onLive: setZLive,
            onCommit: (v) => commit({ slice_z_min: v[0], slice_z_max: v[1] }),
          },
        }}
        contrast={{
          max: contrastMax,
          value: cLive,
          onLive: setCLive,
          onCommit: (v) => commit({ contrast_limits: v }),
        }}
      />
      <p className="mt-1 text-xs text-muted-foreground">
        window {Math.round(window_cx)}, {Math.round(window_cy)} · {window_size_um} µm · {sliceReadout}
        {loadState.level > 0 ? ` · level ${loadState.level}` : ""}
      </p>
    </div>
  );
}
