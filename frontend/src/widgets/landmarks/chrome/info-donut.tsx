import { useMemo, useState } from "react";

import { cn } from "@/lib/utils";

import type { CompositionSlice } from "./info-stats";
import {
  donutSliceAngles,
  typeIndexFromSliceKey,
  wobbleDonutSlicePath,
} from "./info-donut-math";

const VIEW = 200;
const CX = VIEW / 2;
const CY = VIEW / 2;
const INNER_R = 66;
const OUTER_R = 82;
const ACTIVE_OUTER_DELTA = 10;

const TOOLTIP_CLASS =
  "pointer-events-none grid min-w-[8rem] items-start gap-1.5 rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl";

export function InfoDonut({
  slices,
  scopeCount,
  activeTypeIndex,
}: {
  slices: CompositionSlice[];
  scopeCount: number;
  activeTypeIndex: number | null;
}) {
  const total = useMemo(
    () => slices.reduce((acc, s) => acc + s.value, 0),
    [slices],
  );

  const angles = useMemo(
    () => donutSliceAngles(slices, total),
    [slices, total],
  );

  const [hoverKey, setHoverKey] = useState<string | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  const tooltipSlice = useMemo(() => {
    const key = hoverKey;
    if (!key) return null;
    return slices.find((s) => s.key === key) ?? null;
  }, [hoverKey, slices]);

  const showTooltip = tooltipSlice != null && total > 0;
  const pct =
    tooltipSlice && total > 0
      ? ((tooltipSlice.value / total) * 100).toFixed(1)
      : "0";

  return (
    <div
      className="relative aspect-square h-full w-full"
      data-testid="info-donut"
      onMouseLeave={() => setHoverKey(null)}
    >
      <svg
        viewBox={`0 0 ${VIEW} ${VIEW}`}
        className="h-full w-full"
        role="img"
        aria-label="Cell type composition"
      >
        {angles.map(({ key, startDeg, endDeg }) => {
          const slice = slices.find((s) => s.key === key);
          if (!slice) return null;
          const typeIdx = typeIndexFromSliceKey(key);
          const active =
            activeTypeIndex != null &&
            typeIdx != null &&
            typeIdx === activeTypeIndex;
          const outerR = OUTER_R + (active ? ACTIVE_OUTER_DELTA : 0);
          const d = wobbleDonutSlicePath({
            cx: CX,
            cy: CY,
            innerR: INNER_R,
            outerR,
            startDeg,
            endDeg,
            sliceKey: key,
          });
          if (!d) return null;
          return (
            <path
              key={key}
              d={d}
              fill={slice.fill}
              stroke="none"
              className="cursor-default"
              data-testid="info-donut-segment"
              data-slice-key={key}
              onMouseEnter={(e) => {
                setHoverKey(key);
                const rect = e.currentTarget
                  .closest("[data-testid='info-donut']")
                  ?.getBoundingClientRect();
                if (!rect) return;
                setTooltipPos({
                  x: e.clientX - rect.left,
                  y: e.clientY - rect.top,
                });
              }}
              onMouseMove={(e) => {
                const rect = e.currentTarget
                  .closest("[data-testid='info-donut']")
                  ?.getBoundingClientRect();
                if (!rect) return;
                setTooltipPos({
                  x: e.clientX - rect.left,
                  y: e.clientY - rect.top,
                });
              }}
            />
          );
        })}
        <text
          x={CX}
          y={CY}
          textAnchor="middle"
          dominantBaseline="middle"
          pointerEvents="none"
        >
          <tspan
            x={CX}
            y={CY - 6}
            className="fill-foreground text-lg font-semibold tabular-nums"
          >
            {scopeCount.toLocaleString()}
          </tspan>
          <tspan
            x={CX}
            y={CY + 12}
            className="fill-muted-foreground text-[0.65rem]"
          >
            cells
          </tspan>
        </text>
      </svg>
      {showTooltip && tooltipSlice ? (
        <div
          className={cn(TOOLTIP_CLASS, "absolute z-10")}
          data-testid="info-donut-tooltip"
          style={{
            left: tooltipPos.x + 12,
            top: tooltipPos.y + 12,
          }}
        >
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="truncate font-medium text-foreground">
              {tooltipSlice.label}
            </span>
            <span className="whitespace-nowrap text-muted-foreground tabular-nums">
              {tooltipSlice.value.toLocaleString()} cells · {pct}%
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
