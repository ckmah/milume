import { cn } from "@/lib/utils";

import { formatLegendValue } from "../helpers";
import type { LandmarksModel } from "../use-landmarks-model";
import { obsPaletteGradient } from "./obs-ramp-math";

export function isObsNumericColor(lm: LandmarksModel): boolean {
  return lm.color_mode === "obs";
}

/**
 * Sequential obs ramp: column title plus vmin/vmax beside the bar
 * (same footprint as the single-gene expression strip).
 */
export function ObsRampLegend({
  lm,
  className,
}: {
  lm: LandmarksModel;
  className?: string;
}) {
  if (!isObsNumericColor(lm)) return null;
  const palette = lm.point_palette || [];
  if (!palette.length) return null;

  const title = lm.legend_title || "";
  const vmin = lm.color_vmin;
  const vmax = lm.color_vmax;
  const diverging = lm.color_diverging || (vmin < 0 && vmax > 0);

  return (
    <div
      className={cn("flex max-w-full flex-col items-end gap-0.5", className)}
      data-testid="obs-ramp-legend"
    >
      {title ? (
        <p className="m-0 max-w-full truncate text-[11px] font-semibold text-foreground">
          {title}
        </p>
      ) : null}
      <div className="flex items-stretch gap-1.5">
        <div
          className={cn(
            "flex flex-col justify-between py-0.5 text-[11px] font-medium tabular-nums text-foreground/70",
            diverging ? "min-h-14" : "min-h-10",
          )}
          data-testid="obs-ramp-scale"
        >
          <span data-testid="obs-ramp-vmax">{formatLegendValue(vmax)}</span>
          {diverging ? (
            <span
              className="text-foreground"
              data-testid="obs-ramp-vzero"
            >
              {formatLegendValue(0)}
            </span>
          ) : null}
          <span data-testid="obs-ramp-vmin">{formatLegendValue(vmin)}</span>
        </div>
        <div
          className={cn(
            "w-2.5 shrink-0 rounded-full border border-border/60",
            diverging ? "h-14" : "h-10",
          )}
          style={{ background: obsPaletteGradient(palette) }}
          role="img"
          aria-label={`${title || "Observation"} scale`}
        />
      </div>
    </div>
  );
}
