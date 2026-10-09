import type { PlotBootstrap } from "../use-plot-bootstrap";
import { ChromeLoadIndicator } from "./load-indicator";

/** Covers the map until deck.gl is interactive. */
export function PlotLoadIndicator({ bootstrap }: { bootstrap: PlotBootstrap }) {
  if (bootstrap.state === "ready") return null;
  const phase = bootstrap.state === "error" ? "error" : "loading";
  const message =
    bootstrap.state === "error"
      ? bootstrap.message
      : "Loading map…";
  return (
    <ChromeLoadIndicator
      testId="plot-bootstrap"
      phase={phase}
      message={message}
      overlay
    />
  );
}
