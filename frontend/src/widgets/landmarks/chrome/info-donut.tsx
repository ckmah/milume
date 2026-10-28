import { createPortal } from "react-dom";
import { useLayoutEffect, useMemo, useRef, useState } from "react";

import { cn } from "@/lib/utils";

import type { CompositionSlice } from "./info-stats";
import {
  donutSliceAngles,
  donutSlicePath,
  typeIndexFromSliceKey,
} from "./info-donut-math";
import { useWidgetPortal } from "./widget-portal-context";

const VIEW = 200;
const CX = VIEW / 2;
const CY = VIEW / 2;
const INNER_R = 66;
const OUTER_R = 82;
const ACTIVE_OUTER_DELTA = 10;

const TOOLTIP_CLASS =
  "pointer-events-none grid min-w-[8rem] items-start gap-1.5 rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl";

const TOOLTIP_OFFSET = 12;
const TOOLTIP_MARGIN = 4;

function clampTooltipPosition(
  anchor: { x: number; y: number },
  size: { width: number; height: number },
  bounds: DOMRect,
): { left: number; top: number } {
  let left = anchor.x + TOOLTIP_OFFSET;
  let top = anchor.y + TOOLTIP_OFFSET;
  if (left + size.width > bounds.right - TOOLTIP_MARGIN) {
    left = anchor.x - size.width - TOOLTIP_OFFSET;
  }
  if (top + size.height > bounds.bottom - TOOLTIP_MARGIN) {
    top = anchor.y - size.height - TOOLTIP_OFFSET;
  }
  const maxLeft = bounds.right - size.width - TOOLTIP_MARGIN;
  const maxTop = bounds.bottom - size.height - TOOLTIP_MARGIN;
  left = Math.min(Math.max(bounds.left + TOOLTIP_MARGIN, left), maxLeft);
  top = Math.min(Math.max(bounds.top + TOOLTIP_MARGIN, top), maxTop);
  return { left, top };
}

function InfoDonutTooltip({
  slice,
  pct,
  anchor,
}: {
  slice: CompositionSlice;
  pct: string;
  anchor: { x: number; y: number };
}) {
  const portalRoot = useWidgetPortal();
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [fixedPos, setFixedPos] = useState<{ left: number; top: number } | null>(
    null,
  );

  useLayoutEffect(() => {
    const el = tooltipRef.current;
    const boundsEl = portalRoot ?? document.documentElement;
    const bounds = boundsEl.getBoundingClientRect();
    const rect = el?.getBoundingClientRect();
    if (!rect?.width) {
      setFixedPos({ left: anchor.x + TOOLTIP_OFFSET, top: anchor.y + TOOLTIP_OFFSET });
      return;
    }
    setFixedPos(clampTooltipPosition(anchor, rect, bounds));
  }, [anchor.x, anchor.y, portalRoot, slice.key, pct]);

  if (!portalRoot || !fixedPos) return null;

  return createPortal(
    <div
      ref={tooltipRef}
      className={cn(TOOLTIP_CLASS, "fixed z-[100]")}
      data-testid="info-donut-tooltip"
      style={{ left: fixedPos.left, top: fixedPos.top }}
    >
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate font-medium text-foreground">{slice.label}</span>
        <span className="whitespace-nowrap text-muted-foreground tabular-nums">
          {slice.value.toLocaleString()} cells · {pct}%
        </span>
      </div>
    </div>,
    portalRoot,
  );
}

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
  const [tooltipAnchor, setTooltipAnchor] = useState({ x: 0, y: 0 });

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

  const syncTooltipAnchor = (clientX: number, clientY: number) => {
    setTooltipAnchor({ x: clientX, y: clientY });
  };

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
          const d = donutSlicePath({
            cx: CX,
            cy: CY,
            innerR: INNER_R,
            outerR,
            startDeg,
            endDeg,
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
                syncTooltipAnchor(e.clientX, e.clientY);
              }}
              onMouseMove={(e) => syncTooltipAnchor(e.clientX, e.clientY)}
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
        <InfoDonutTooltip slice={tooltipSlice} pct={pct} anchor={tooltipAnchor} />
      ) : null}
    </div>
  );
}
