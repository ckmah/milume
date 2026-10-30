import { cn } from "@/lib/utils";

import type { CompositionSlice } from "./info-stats";
import { typeIndexFromSliceKey } from "./info-donut-math";

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
  const total = slices.reduce((acc, s) => acc + s.value, 0);
  if (!total) return null;

  return (
    <div
      className={cn("flex h-6 w-full gap-px overflow-hidden rounded-[var(--radius)]", className)}
      role="img"
      aria-label="Category composition"
      data-testid="info-stacked-bar"
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
