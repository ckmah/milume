import { useEffect, useState } from "react";

import type { EngineHandle, PlotBootstrapState } from "./engine";

export type PlotBootstrap = PlotBootstrapState;

const LOADING: PlotBootstrap = { state: "loading" };

export function usePlotBootstrap(engine: EngineHandle | null): PlotBootstrap {
  const [boot, setBoot] = useState<PlotBootstrap>(LOADING);
  useEffect(() => {
    if (!engine) {
      setBoot(LOADING);
      return;
    }
    setBoot(engine.getPlotBootstrap());
    return engine.subscribePlotBootstrap((next) => setBoot(next));
  }, [engine]);
  return boot;
}
