import { useCallback, useState } from "react";

import { DEFAULT_RENDER, type RenderSettings } from "@/widgets/volume-cube/palettes";
import type { ViewPreset } from "@/widgets/volume-cube/CubeControls";
import type { CubeBounds } from "@/widgets/volume-cube/VolumeCube";

import type { RelativeCut } from "./cube-cut";

/** Client-local state of the Inspect cube window and its context toolbar. */
export type CubeSettings = {
  open: boolean;
  /** Projection of the image in the cube: accumulated samples or maximum intensity. */
  imageMode: "additive" | "mip";
  /** Projection of the labels: accumulated front to back or the strongest sample. */
  labelMode: "additive" | "mip";
  preset: ViewPreset | null;
  resetTick: number;
  /** The image in the cube views (dock and preview); off leaves only labels. */
  showImage: boolean;
  /** Default on: a store with labels opens showing its cells. */
  showLabels: boolean;
  /** Scatter points from the 2D layer inside the cube. */
  showPoints: boolean;
  render: RenderSettings;
  contrast: [number, number];
  /** X/Y relative to the inspect window, Z absolute (see cube-cut.ts). */
  cut: RelativeCut;
  bounds: CubeBounds | null;
  /** The Move tool: a plain drag in the cube pans the window instead of orbiting. */
  move: boolean;
  /** The open cube's load: a level still loading, all loaded, or failed (the Inspect pill's chip). */
  load: "refining" | "ready" | "error";
  /** Why the load failed, when `load` is "error". */
  loadError: string;
};

export type CubeSettingsPatch = Omit<Partial<CubeSettings>, "render"> & {
  render?: Partial<RenderSettings>;
};

/** Shallow-merging settings; `render` merges one level deeper. */
export function useCubeSettings(
  initialContrast: [number, number],
  initialCut: RelativeCut,
): [CubeSettings, (patch: CubeSettingsPatch) => void] {
  const [settings, setSettings] = useState<CubeSettings>(() => ({
    open: false,
    imageMode: "additive",
    labelMode: "additive",
    preset: "top",
    resetTick: 0,
    showImage: true,
    showLabels: true,
    showPoints: false,
    render: DEFAULT_RENDER,
    contrast: initialContrast,
    cut: initialCut,
    bounds: null,
    move: false,
    load: "refining",
    loadError: "",
  }));
  const patch = useCallback((p: CubeSettingsPatch) => {
    setSettings((prev) => {
      const { render, ...rest } = p;
      const differs = (a: object, b: object) =>
        Object.entries(b).some(([k, v]) => !Object.is((a as Record<string, unknown>)[k], v));
      // Drag placements re-send `open: true` every move; keep the state then.
      if (!differs(prev, rest) && !(render && differs(prev.render, render))) return prev;
      return { ...prev, ...rest, render: render ? { ...prev.render, ...render } : prev.render };
    });
  }, []);
  return [settings, patch];
}
