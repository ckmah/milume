import { SIMILARITY_LEGEND_CSS } from "../helpers";
import type { LandmarksModel } from "../use-landmarks-model";
import { META_LINE, STACK_GAP_SM } from "./sections";

/**
 * Probe-mode similarity chrome (points + raster). View (Points/Raster) lives in
 * the Soft Float View CTA — not in Explore. Legend only while probe is on.
 * Gene mode with no selection: hover is inert until genes are chosen.
 */
export function RasterSection({ lm }: { lm: LandmarksModel }) {
  const probeOn =
    lm.mode === "probe" || !!lm.raster_similarity_enabled;
  const status = lm.raster_status || "";
  const genesMode =
    lm.render_mode === "raster"
      ? lm.raster_basis === "genes"
      : lm.color_mode === "continuous";
  const genesHoverInert =
    genesMode && !(lm.active_genes || []).length;

  if (!probeOn) return null;

  let statusText: string | null = null;
  if (status === "computing") {
    statusText = "Computing raster…";
  } else if (status.startsWith("error:")) {
    statusText = status;
  }

  return (
    <div
      className={STACK_GAP_SM}
      data-testid="raster-section"
      data-testid-legend="raster-legend"
    >
      <p className="m-0 text-[11px] font-medium text-foreground">Similarity</p>
      <div
        className="h-2.5 w-full rounded-sm"
        style={{ background: SIMILARITY_LEGEND_CSS }}
        role="img"
        aria-label="Similarity to hovered or pinned cell"
        title={
          genesHoverInert
            ? "Select genes, then hover or click to pin similarity"
            : "Hover a cell to scrub similarity; click to pin"
        }
        data-testid="raster-legend"
      />
      <div className="flex justify-between text-[10px] tabular-nums text-foreground/70">
        <span>0</span>
        <span>0.5</span>
        <span>1</span>
      </div>
      {statusText ? (
        <p className={META_LINE} data-testid="raster-status">
          {statusText}
        </p>
      ) : (
        <span className="sr-only" data-testid="raster-status">
          Ready
        </span>
      )}
    </div>
  );
}
