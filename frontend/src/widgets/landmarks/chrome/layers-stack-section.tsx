import { useState } from "react";
import { ChevronRightIcon, EyeIcon, LayersIcon } from "lucide-react";

import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
import { FieldDescription } from "@/components/ui/field";
import { cn } from "@/lib/utils";

import type { CategoryColumn } from "../helpers";
import type { LandmarksModel } from "../use-landmarks-model";
import { COMBO_INPUT, META_LINE, STACK_GAP_SM } from "./sections";
import { useWidgetPortalContainer } from "./use-widget-portal";

export function layersStackCount(lm: LandmarksModel): number {
  let n = lm.category_columns.length > 0 ? 1 : 0;
  if (lm.volume?.image_url) n += 1;
  return n;
}

function CategoryColumnPicker({
  columns,
  active,
  onPick,
}: {
  columns: CategoryColumn[];
  active: string;
  onPick: (col: CategoryColumn) => void;
}) {
  const [wrapRef, portalEl] = useWidgetPortalContainer();
  if (!columns.length) {
    return (
      <FieldDescription>No category columns on this AnnData.</FieldDescription>
    );
  }
  const value = active || columns[0]?.name || "";

  return (
    <div ref={wrapRef} className={STACK_GAP_SM}>
      <Combobox
        items={columns.map((c) => c.name)}
        value={value || null}
        onValueChange={(next) => {
          if (typeof next !== "string" || !next) return;
          const col = columns.find((c) => c.name === next);
          if (col) onPick(col);
        }}
      >
        <ComboboxInput
          className={COMBO_INPUT}
          aria-label="Cells category column"
          readOnly
        />
        <ComboboxContent container={portalEl} className="text-[11px]">
          <ComboboxEmpty className="text-[11px]">No columns</ComboboxEmpty>
          <ComboboxList>
            {(name) => (
              <ComboboxItem key={String(name)} value={String(name)} className="py-1 text-[11px]">
                {String(name)}
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
    </div>
  );
}

/** Layers accordion body — Cells (active category) and optional Image (volume). */
export function LayersStackSection({ lm }: { lm: LandmarksModel }) {
  const { category_columns, active_category, volume } = lm;
  const activeCol =
    category_columns.find((c) => c.name === active_category) ||
    category_columns[0] ||
    null;
  const [imageOpen, setImageOpen] = useState(false);
  const hasImage = Boolean(volume?.image_url);
  const contrast = volume?.contrast_limits ?? [0, 255];

  if (!category_columns.length && !hasImage) {
    return (
      <FieldDescription className="px-2.5 pb-2">
        No layers yet. Load category columns or a volume image in the notebook.
      </FieldDescription>
    );
  }

  return (
    <div className="landmarks-layers-stack flex flex-col gap-1 pb-2">
      {category_columns.length ? (
        <div className="landmarks-layers-stack__row">
          <div className="landmarks-layer-row justify-between text-xs text-foreground">
            <span className="inline-flex min-w-0 items-center gap-1.5">
              <LayersIcon className="landmarks-layer-icon size-[0.875rem] shrink-0 opacity-70" />
              <span className="truncate">
                Cells · {activeCol?.name ?? "category"}
              </span>
            </span>
            <EyeIcon className="landmarks-layer-icon size-[0.875rem] shrink-0 opacity-70" aria-hidden />
          </div>
          <div className="px-2.5 pt-1">
            <CategoryColumnPicker
              columns={category_columns}
              active={active_category}
              onPick={(col) => {
                lm.setActiveCategory(col);
                lm.select("", -1);
              }}
            />
          </div>
        </div>
      ) : null}

      {hasImage ? (
        <div className="landmarks-layers-stack__row">
          <button
            type="button"
            className={cn(
              "landmarks-layer-row w-full text-xs text-foreground",
              imageOpen && "landmarks-layer-row--active",
            )}
            aria-expanded={imageOpen}
            onClick={() => setImageOpen((v) => !v)}
          >
            <ChevronRightIcon
              className={cn(
                "landmarks-layer-icon size-[0.875rem] shrink-0 transition-transform",
                imageOpen && "rotate-90",
              )}
              aria-hidden
            />
            <span className="min-w-0 flex-1 truncate text-left">
              Image · DAPI
            </span>
            <EyeIcon className="landmarks-layer-icon size-[0.875rem] shrink-0 opacity-70" aria-hidden />
          </button>
          {imageOpen ? (
            <div className="flex flex-col gap-1.5 px-2.5 pt-1.5 pb-1">
              <p className={META_LINE}>
                Contrast {Math.round(contrast[0])}–{Math.round(contrast[1])}
              </p>
              <p className={META_LINE}>Alpha 0.55</p>
              <p className="m-0 text-[10px] text-foreground/65">
                More: palette, gamma… (Inspect toolbar)
              </p>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
