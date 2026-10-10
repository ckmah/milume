import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { DialRoot, useDialKit } from "dialkit";
import "dialkit/styles.css";

import "@/styles/globals.css";
import "@/widgets/landmarks/landmarks.css";
import type { AnyModel } from "@/widgets/landmarks/helpers";
import { resetModeDropdownMemory } from "@/widgets/landmarks/chrome/mode-dropdown";
import { LandmarksView } from "@/widgets/landmarks/LandmarksView";

import { loadFixtureModel } from "../mock-model";

/**
 * Harness-only options, read from a query string. `budgets=<preview>,<dock>` (voxels) makes the toy
 * pyramid pick different levels; `window=<µm>` shrinks the Inspect window below the toy volume (256 µm),
 * so moved windows stay inside it.
 */
function optionsFrom(search: string) {
  const params = new URLSearchParams(search);
  const [preview, dock] = (params.get("budgets") ?? "").split(",").map(Number);
  return {
    cubeBudgets: preview && dock ? { preview, dock } : undefined,
    inspectWindowUm: Number(params.get("window")) || undefined,
  };
}

/**
 * Landmarks over a toy SpatialData (`public/toy.sdata.zarr`): a click in Inspect
 * opens the immersive cube over the plot area on release. The engine exposes `window.__landmarksEngine` / `__landmarksModel`.
 */
function LandmarksVolumeHarness() {
  const labels = useDialKit("Labels", {
    cellAlpha: [0.4, 0, 1, 0.05],
  });
  const [hostEl, setHostEl] = useState<HTMLElement | null>(null);
  const [model, setModel] = useState<AnyModel | null>(null);
  const [loadError, setLoadError] = useState("");
  const [options, setOptions] = useState(() => optionsFrom(location.search));

  useEffect(() => {
    let cancelled = false;
    loadFixtureModel()
      .then((m) => {
        if (!cancelled) setModel(m);
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // E2E only: remount the widget on a fresh model without reloading the page (see e2e/fixtures.ts).
  // `query` carries the options a reload would have (`window=100`); none means the defaults.
  useEffect(() => {
    (window as unknown as { __harnessReset?: (query?: string) => Promise<void> }).__harnessReset = async (query = "") => {
      resetModeDropdownMemory();
      setModel(null);
      setOptions(optionsFrom(query));
      const fixture = new URLSearchParams(query).get("fixture");
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );
      setModel(await loadFixtureModel(fixture ?? undefined));
    };
    return () => {
      delete (window as unknown as { __harnessReset?: unknown }).__harnessReset;
    };
  }, []);

  if (loadError) return <p className="p-4 text-sm text-destructive">{loadError}</p>;

  return (
    <div className="dark min-h-screen bg-neutral-950 p-3 text-neutral-100">
      <div ref={setHostEl} className="w-full min-w-0">
        {hostEl && model ? (
          <LandmarksView
            model={model}
            hostEl={hostEl}
            defaultHeight={820}
            cubeBudgets={options.cubeBudgets}
            inspectWindowUm={options.inspectWindowUm}
            labelAlpha={labels.cellAlpha}
          />
        ) : (
          <p className="p-4 text-sm text-muted-foreground">Loading fixture…</p>
        )}
      </div>
      <DialRoot position="bottom-left" theme="dark" />
    </div>
  );
}

// Harness matches remote kernels: every metadata fetch is a comm round trip (no client cache).
(window as unknown as { __volumeCommDisableMetadataCache?: boolean }).__volumeCommDisableMetadataCache = true;

const root = document.getElementById("root");
if (!root) throw new Error("missing #root");
createRoot(root).render(<LandmarksVolumeHarness />);
