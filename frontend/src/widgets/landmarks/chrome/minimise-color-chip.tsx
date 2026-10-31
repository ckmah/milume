import { ChevronDownIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import type { LandmarksModel } from "../use-landmarks-model";
import { colorSignal, type ColorSignal } from "./coloring";
import { SubcategoryAvatars } from "./explore-panel";

function chipPrefix(signal: ColorSignal): string {
  if (signal === "categories") return "category";
  if (signal === "numeric") return "num";
  if (signal === "genes") return "genes";
  return "embed";
}

function chipValue(lm: LandmarksModel, signal: ColorSignal): string {
  if (signal === "categories") {
    const col =
      lm.category_columns.find((c) => c.name === lm.active_category) ||
      lm.category_columns[0];
    if (!col) return "None";
    const n = (col.labels || []).length;
    return `${col.name} (${n})`;
  }
  if (signal === "numeric") {
    return lm.legend_title || lm.color || "None";
  }
  if (signal === "genes") {
    const genes = lm.active_genes || [];
    return genes.length ? `${genes.length} genes` : "None";
  }
  return (
    lm.raster_embedding_key || lm.raster_embedding_keys?.[0] || "None"
  );
}

/**
 * Option-3 right dock: one chip row keeps the active coloring visible while minimise is on.
 */
export function MinimiseColorChip({
  lm,
  onExpand,
}: {
  lm: LandmarksModel;
  onExpand: () => void;
}) {
  const signal = colorSignal(lm);
  const prefix = chipPrefix(signal);
  const value = chipValue(lm, signal);
  const col =
    signal === "categories"
      ? lm.category_columns.find((c) => c.name === lm.active_category) ||
        lm.category_columns[0] ||
        null
      : null;

  return (
    <div className="landmarks-minimise-color-chip px-2.5 pt-1.5 pb-1" data-testid="minimise-color-chip">
      <Button
        type="button"
        variant="ghost"
        className={cn(
          "landmarks-minimise-color-chip__btn h-8 w-full justify-between gap-1 rounded-md px-2 font-normal text-foreground",
        )}
        aria-expanded={false}
        aria-label="Expand color card"
        data-testid="minimise-color-chip-expand"
        onClick={onExpand}
      >
        <span className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden text-left">
          <span className="shrink-0 text-[0.6875rem] font-medium text-foreground/70">
            {prefix}
          </span>
          <span className="min-w-0 truncate text-xs text-foreground">{value}</span>
          {col ? <SubcategoryAvatars col={col} /> : null}
        </span>
        <ChevronDownIcon className="size-3.5 shrink-0 opacity-70" aria-hidden />
      </Button>
    </div>
  );
}
