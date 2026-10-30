import { cn } from "@/lib/utils";

import { formatLegendValue } from "../helpers";
import {
  HEAT_BIN_COUNT_FLOOR,
  INFO_HEAT_BINS,
  type NumericHeatStripData,
} from "./info-stats";
import { CHART_CAPTION } from "./sections";

function paletteColorAt(palette: string[], t: number): string {
  if (!palette.length) return "var(--muted-foreground)";
  const u = Math.max(0, Math.min(1, t));
  const idx = u * (palette.length - 1);
  const lo = Math.floor(idx);
  return palette[Math.min(palette.length - 1, lo)];
}

function binBackground(
  palette: string[],
  hue: number,
  count: number,
  peak: number,
): string {
  if (!count) return "var(--muted)";
  const base = paletteColorAt(palette, hue);
  const lift = HEAT_BIN_COUNT_FLOOR + (1 - HEAT_BIN_COUNT_FLOOR) * (count / peak);
  return `color-mix(in oklab, ${base} ${Math.round(lift * 100)}%, var(--background))`;
}

/** Numeric obs heat strip (24 bins) with value axis and cells-at-level legend. */
export function NumHeatStrip({
  data,
  palette,
  title,
  className,
}: {
  data: NumericHeatStripData;
  palette: string[];
  title?: string;
  className?: string;
}) {
  const peak = Math.max(...data.counts, 1);
  const maxTick = data.capped
    ? `≥${formatLegendValue(data.scaleMax)}`
    : formatLegendValue(data.hi);

  return (
    <div
      className={cn("flex w-full min-w-0 flex-col gap-1.5", className)}
      data-testid="num-heat-strip"
    >
      {title ? (
        <p className="m-0 truncate text-xs font-medium text-foreground" title={title}>
          {title}
        </p>
      ) : null}
      <div
        className="flex h-6 w-full gap-px overflow-hidden rounded-[var(--radius)]"
        role="img"
        aria-label={`${title || "Numeric column"} distribution`}
      >
        {data.counts.map((count, i) => (
          <div
            key={i}
            className="min-w-0 flex-1"
            style={{
              background: binBackground(palette, data.hues[i], count, peak),
            }}
          />
        ))}
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className={CHART_CAPTION}>value</span>
        <span className={cn(CHART_CAPTION, "tabular-nums")}>
          {formatLegendValue(data.lo)}
        </span>
        <span className={cn(CHART_CAPTION, "tabular-nums")} data-testid="num-heat-max">
          {maxTick}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <span className={cn(CHART_CAPTION, "shrink-0")}>cells at level</span>
        <div className="flex min-w-0 flex-1 items-center gap-1">
          {[0.25, 0.5, 0.75, 1].map((t) => (
            <div
              key={t}
              className="h-2 flex-1 rounded-sm bg-foreground/15"
              style={{ opacity: HEAT_BIN_COUNT_FLOOR + (1 - HEAT_BIN_COUNT_FLOOR) * t }}
            />
          ))}
        </div>
        <span className={cn(CHART_CAPTION, "shrink-0")}>few — many</span>
      </div>
    </div>
  );
}

export { INFO_HEAT_BINS };
