import { cn } from "@/lib/utils";

import type { CompositionSlice } from "./info-stats";
import { typeIndexFromSliceKey } from "./info-donut-math";

function StackedBarTrack({
  slices,
  className,
  activeTypeIndex,
  testId = "info-stacked-bar",
}: {
  slices: CompositionSlice[];
  className?: string;
  activeTypeIndex?: number | null;
  testId?: string;
}) {
  const total = slices.reduce((acc, s) => acc + s.value, 0);
  if (!total) return null;

  return (
    <div
      className={cn("flex w-full gap-px overflow-hidden rounded-[var(--radius)]", className)}
      role="img"
      aria-label="Category composition"
      data-testid={testId}
    >
      {slices.map((slice) => {
        const pct = (slice.value / total) * 100;
        if (pct <= 0) return null;
        const typeIdx = typeIndexFromSliceKey(slice.key);
        const active =
          activeTypeIndex != null &&
          typeIdx != null &&
          typeIdx === activeTypeIndex;
        return (
          <div
            key={slice.key}
            className={cn("min-w-0 shrink-0", active && "ring-1 ring-foreground/40 ring-inset")}
            style={{
              flexGrow: slice.value,
              flexBasis: 0,
              background: slice.fill,
            }}
            title={`${slice.label}: ${slice.value.toLocaleString()} cells`}
          />
        );
      })}
    </div>
  );
}

/** 24px stacked summary bar — same slice order and colours as the composition donut. */
export function InfoStackedBar({
  slices,
  className,
  activeTypeIndex,
}: {
  slices: CompositionSlice[];
  className?: string;
  activeTypeIndex?: number | null;
}) {
  return (
    <StackedBarTrack
      slices={slices}
      className={cn("h-6", className)}
      activeTypeIndex={activeTypeIndex}
    />
  );
}

/** Selection scope: labelled 24px selection bar over 8px all-cells bar (same type order). */
export function InfoCategoryComposition({
  allSlices,
  selectionSlices,
  selectionLabel,
  activeTypeIndex,
}: {
  allSlices: CompositionSlice[];
  selectionSlices: CompositionSlice[];
  selectionLabel: string;
  activeTypeIndex?: number | null;
}) {
  return (
    <div className="flex w-full flex-col gap-1.5" data-testid="info-category-composition">
      <div className="flex min-w-0 items-center gap-2" data-testid="info-selection-bar-row">
        <span className="landmarks-info-bar-gutter shrink-0 truncate" title={selectionLabel}>
          {selectionLabel}
        </span>
        <StackedBarTrack
          slices={selectionSlices}
          className="h-6 min-w-0 flex-1"
          activeTypeIndex={activeTypeIndex}
          testId="info-selection-bar"
        />
      </div>
      <div className="flex min-w-0 items-center gap-2" data-testid="info-allcells-bar-row">
        <span className="landmarks-info-bar-gutter shrink-0">All cells</span>
        <StackedBarTrack
          slices={allSlices}
          className="h-2 min-w-0 flex-1"
          testId="info-allcells-bar"
        />
      </div>
    </div>
  );
}
