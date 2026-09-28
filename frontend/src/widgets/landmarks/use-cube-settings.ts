import { useCallback, useState } from "react";

import { DEFAULT_RENDER, type RenderSettings } from "@/widgets/volume-cube/palettes";
import type { ViewPreset } from "@/widgets/volume-cube/CubeControls";
import type { CubeBounds } from "@/widgets/volume-cube/VolumeCube";

import type { RelativeCut } from "./cube-cut";

/** Client-local state of the Inspect cube window and its context toolbar. */
export type CubeSettings = {
  open: boolean;
  mode: "additive" | "mip";
  preset: ViewPreset | null;
  resetTick: number;
  showLabels: boolean;
  render: RenderSettings;
  contrast: [number, number];
  /** X/Y relative to the inspect window, Z absolute (see cube-cut.ts). */
  cut: RelativeCut;
  bounds: CubeBounds | null;
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
    mode: "additive",
    preset: "iso",
    resetTick: 0,
    showLabels: false,
    render: DEFAULT_RENDER,
    contrast: initialContrast,
    cut: initialCut,
    bounds: null,
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
