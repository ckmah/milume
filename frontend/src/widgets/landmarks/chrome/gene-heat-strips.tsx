import { cn } from "@/lib/utils";

import { formatLegendValue } from "../helpers";
import { HEAT_BIN_COUNT_FLOOR, INFO_HEAT_BINS, type GeneHeatRow } from "./info-stats";
import { CHART_CAPTION, DATA_CARD_BODY } from "./sections";

function GeneHeatStripRow({ row }: { row: GeneHeatRow }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2" data-testid="gene-heat-row">
      <div className="flex min-w-0 items-center gap-1.5">
        <span
          className="size-2 shrink-0 rounded-sm"
          style={{ background: row.color }}
          aria-hidden
        />
        <span className={cn(DATA_CARD_BODY, "min-w-0 truncate font-normal")} title={row.name}>
          {row.name}
        </span>
        <div
          className="flex h-5 min-w-0 flex-1 gap-px overflow-hidden rounded-[calc(var(--radius)-2px)]"
          role="img"
          aria-label={`${row.name} expression bins`}
        >
          {row.bins.map((fill, i) => (
            <div
              key={i}
              className="min-w-0 flex-1"
              style={{
                background: fill
                  ? `color-mix(in oklab, ${row.color} ${Math.round((HEAT_BIN_COUNT_FLOOR + (1 - HEAT_BIN_COUNT_FLOOR) * fill) * 100)}%, var(--background))`
                  : "var(--muted)",
              }}
            />
          ))}
        </div>
      </div>
      <span className={cn(DATA_CARD_BODY, "shrink-0 tabular-nums text-foreground/80")}>
        {row.pct}%
      </span>
    </div>
  );
}

export function GeneHeatStrips({
  rows,
  xMax = 1,
}: {
  rows: GeneHeatRow[];
  xMax?: number;
}) {
  if (!rows.length) return null;
  return (
    <div className="flex w-full flex-col gap-2" data-testid="gene-heat-strips">
      <div className="flex flex-col gap-1.5">
        {rows.map((row) => (
          <GeneHeatStripRow key={row.name} row={row} />
        ))}
      </div>
      <div className="flex items-center gap-2">
        <span className={CHART_CAPTION}>expression</span>
        <span className={CHART_CAPTION}>0</span>
        <div className="h-1.5 min-w-0 flex-1 rounded-full bg-gradient-to-r from-background via-foreground/20 to-foreground/70" />
        <span className={cn(CHART_CAPTION, "tabular-nums")}>{formatLegendValue(xMax)}</span>
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
