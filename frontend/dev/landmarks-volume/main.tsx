import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";

import "@/styles/globals.css";
import "@/widgets/landmarks/landmarks.css";
import type { AnyModel } from "@/widgets/landmarks/helpers";
import { LandmarksView } from "@/widgets/landmarks/LandmarksView";

import { loadFixtureModel } from "../mock-model";

/**
 * Landmarks over a toy SpatialData (`public/toy.sdata.zarr`): Inspect opens the
 * floating cube. The engine exposes `window.__landmarksEngine` / `__landmarksModel`.
 */
function LandmarksVolumeHarness() {
  const [hostEl, setHostEl] = useState<HTMLElement | null>(null);
  const [model, setModel] = useState<AnyModel | null>(null);
  const [loadError, setLoadError] = useState("");

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

  if (loadError) return <p className="p-4 text-sm text-destructive">{loadError}</p>;

  return (
    <div className="dark min-h-screen bg-neutral-950 p-3 text-neutral-100">
      <div ref={setHostEl} className="w-full min-w-0">
        {hostEl && model ? (
          <LandmarksView model={model} hostEl={hostEl} defaultHeight={820} />
        ) : (
          <p className="p-4 text-sm text-muted-foreground">Loading fixture…</p>
        )}
      </div>
    </div>
  );
}

const root = document.getElementById("root");
if (!root) throw new Error("missing #root");
createRoot(root).render(<LandmarksVolumeHarness />);
