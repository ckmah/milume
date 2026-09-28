import { useEffect, useState } from "react";

import { Card, CardContent } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
} from "@/components/ui/collapsible";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
import { FieldDescription } from "@/components/ui/field";
import { ItemGroup } from "@/components/ui/item";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Tabs,
  TabsContent,
  TabsTrigger,
} from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { ChevronRightIcon } from "lucide-react";

import type { CategoryColumn } from "../helpers";
import type { LandmarksModel } from "../use-landmarks-model";
import {
  activateCategories,
  activateEmbedding,
  activateGenes,
  colorSignal,
  colorSignalDetail,
  type ColorSignal,
} from "./coloring";
import { GenesCombobox } from "./genes-legend";
import { LayerRow } from "./primitives";
import {
  EMBEDDED_PANEL,
  FLOAT_PANEL,
  FLOAT_PANEL_CLIP,
  PANEL_INSET,
  PANEL_SCROLL,
  PILL_TABS_TRIGGER,
  COMBO_INPUT,
  STACK_GAP_SM,
} from "./sections";
import { SoftFloatSlidingTabsList } from "./sliding-tabs";
import { useWidgetPortalContainer } from "./use-widget-portal";

const AVATAR_MAX = 5;

function SubcategoryAvatars({ col }: { col: CategoryColumn }) {
  const labels = col.labels || [];
  const palette = col.palette || [];
  const shown = labels.slice(0, AVATAR_MAX);
  const extra = labels.length - shown.length;
  return (
    <span className="inline-flex shrink-0 items-center justify-end" aria-hidden>
      {shown.map((label, i) => (
        <span
          key={`${col.name}-${label}`}
          title={label}
          className="size-2.5 rounded-full ring-1 ring-background"
          style={{
            background:
              palette[i % Math.max(palette.length, 1)] ||
              "var(--muted-foreground)",
            // Light stack overlap — keep dots distinct in both views.
            marginLeft: i === 0 ? 0 : -1,
          }}
        />
      ))}
      {extra > 0 ? (
        <span className="ml-0.5 text-[9px] font-medium text-foreground/75">
          +{extra}
        </span>
      ) : null}
    </span>
  );
}


export function EmbeddingCombobox({ lm }: { lm: LandmarksModel }) {
  const keys = lm.raster_embedding_keys || [];
  const value = lm.raster_embedding_key || keys[0] || "";
  const [wrapRef, portalEl] = useWidgetPortalContainer();

  if (!keys.length) {
    return (
      <FieldDescription>
        No embeddings in <code className="text-[0.7rem]">obsm</code>. Compute
        PCA (or another embedding) in the notebook.
      </FieldDescription>
    );
  }

  return (
    <div ref={wrapRef} className={STACK_GAP_SM}>
      <Combobox
        items={keys}
        value={value || null}
        onValueChange={(next) => {
          if (typeof next === "string" && next) {
            lm.setRasterEmbeddingKey(next);
          }
        }}
      >
        <ComboboxInput
          placeholder="Select embedding"
          className={COMBO_INPUT}
          aria-label="Embedding key"
        />
        <ComboboxContent container={portalEl} className="text-[11px]">
          <ComboboxEmpty className="text-[11px]">No embeddings</ComboboxEmpty>
          <ComboboxList>
            {(item) => {
              const name = String(item);
              return (
                <ComboboxItem key={name} value={name} className="py-1 text-[11px]">
                  {name}
                </ComboboxItem>
              );
            }}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
    </div>
  );
}

function CategoryCollapsibleRow({
  col,
  lm,
  signal,
  active_category,
  selected_kind,
  selected_index,
}: {
  col: CategoryColumn;
  lm: LandmarksModel;
  signal: ColorSignal;
  active_category: string;
  selected_kind: string;
  selected_index: number;
}) {
  const [open, setOpen] = useState(false);
  const isShown = signal === "categories" && col.name === active_category;

  const activate = () => {
    lm.setActiveCategory(col);
    lm.select("", -1);
  };

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="group/cat">
      <div
        className={cn(
          "landmarks-cat-trigger text-xs font-medium text-foreground/70",
          isShown && "landmarks-cat-trigger--active text-foreground",
        )}
      >
        <button
          type="button"
          className="landmarks-cat-chevron"
          aria-label={open ? `Collapse ${col.name}` : `Expand ${col.name}`}
          aria-expanded={open}
          onClick={(e) => {
            e.stopPropagation();
            setOpen((v) => !v);
          }}
        >
          <ChevronRightIcon
            className={cn(
              "landmarks-layer-icon landmarks-cat-chevron-icon size-[0.875rem] shrink-0",
              open && "landmarks-cat-chevron-icon--open",
            )}
          />
        </button>
        <button
          type="button"
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-[var(--lm-layer-row-gap,0.375rem)] text-left outline-none"
          onClick={() => {
            activate();
          }}
        >
          <span className="min-w-0 flex-1 truncate">
            {col.name}
            <span
              className="font-normal text-foreground/70"
              title="Unique subcategories"
            >
              {" "}
              ({(col.labels || []).length})
            </span>
          </span>
        </button>
        {/* Right-edge avatars (points view) — flush to the row end. */}
        <span className="landmarks-cat-avatars">
          <SubcategoryAvatars col={col} />
        </span>
      </div>
      <CollapsibleContent className="landmarks-cat-sublist overflow-hidden pl-4">
        <div className="landmarks-cat-sublist-inner">
          <ItemGroup className="gap-0 p-0">
            {(col.labels || []).map((label, i) => (
              <LayerRow
                key={`${col.name}-${label}`}
                active={
                  selected_kind === "type" &&
                  col.name === active_category &&
                  selected_index === i
                }
                color={
                  (col.palette || [])[
                    i % Math.max((col.palette || []).length, 1)
                  ]
                }
                label={label}
                onSelect={() => lm.selectType(col, i)}
              />
            ))}
          </ItemGroup>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

export function CategoriesControls({
  lm,
  signal,
}: {
  lm: LandmarksModel;
  signal: ColorSignal;
}) {
  const {
    category_columns,
    active_category,
    selected_kind,
    selected_index,
  } = lm;
  const rasterOn = (lm.render_mode || "points") === "raster";

  if (!category_columns.length) {
    return (
      <FieldDescription>
        No category columns loaded on this AnnData.
      </FieldDescription>
    );
  }

  if (rasterOn) {
    return (
      <RadioGroup
        value={active_category || ""}
        onValueChange={(name) => {
          const col = category_columns.find((c) => c.name === name);
          if (!col) return;
          lm.setActiveCategory(col);
          lm.select("", -1);
        }}
        className="flex flex-col gap-0"
        aria-label="Category"
        data-testid="explore-category-radios"
      >
        {category_columns.map((col: CategoryColumn) => {
          const id = `cat-radio-${col.name}`;
          const selected = col.name === active_category;
          const unique = (col.labels || []).length;
          return (
            <Label
              key={col.name}
              htmlFor={id}
              className={cn(
                // Match selection / landmark LayerRow height (landmarks-cat-trigger).
                "landmarks-cat-trigger cursor-pointer gap-[var(--lm-layer-row-gap,0.375rem)] text-xs leading-none font-medium text-foreground/70",
                "hover:text-foreground",
                selected && "landmarks-cat-trigger--active text-foreground",
              )}
            >
              <RadioGroupItem
                value={col.name}
                id={id}
                className="size-[var(--lm-layer-swatch)] border-foreground/25 shadow-none"
              />
              <span className="min-w-0 flex-1 truncate">
                {col.name}
                <span
                  className="font-normal text-foreground/70"
                  title="Unique subcategories"
                >
                  {" "}
                  ({unique})
                </span>
              </span>
              <span className="landmarks-cat-avatars">
                <SubcategoryAvatars col={col} />
              </span>
            </Label>
          );
        })}
      </RadioGroup>
    );
  }

  return (
    <div className="flex flex-col gap-0">
      {category_columns.map((col: CategoryColumn) => (
        <CategoryCollapsibleRow
          key={col.name}
          col={col}
          lm={lm}
          signal={signal}
          active_category={active_category}
          selected_kind={selected_kind}
          selected_index={selected_index}
        />
      ))}
    </div>
  );
}

/**

 * Right-dock explore chrome: geometry, explicit Color-by control, then the
 * active signal's options. Info is a sibling card above this panel.
 */
export function ExplorePanel({
  lm,
  embedded = false,
}: {
  lm: LandmarksModel;
  embedded?: boolean;
}) {
  const modelSignal = colorSignal(lm);
  const [colorBy, setColorBy] = useState<ColorSignal>(modelSignal);

  useEffect(() => {
    setColorBy(modelSignal);
  }, [modelSignal]);

  const onColorBy = (next: string) => {
    if (next !== "categories" && next !== "genes" && next !== "embedding") {
      return;
    }
    setColorBy(next);
    if (next === "categories") activateCategories(lm);
    else if (next === "genes") activateGenes(lm);
    else activateEmbedding(lm);
  };

  const detail = colorSignalDetail(lm, colorBy);

  const body = (
    <div className="flex flex-col gap-2.5 pb-1.5">
      <Tabs
        value={colorBy}
        onValueChange={onColorBy}
        className={STACK_GAP_SM}
        data-testid="explore-color-by"
      >
        <SoftFloatSlidingTabsList value={colorBy} aria-label="Color">
          {(lm.category_columns?.length ?? 0) > 0 ? (
            <TabsTrigger value="categories" className={PILL_TABS_TRIGGER}>
              category
            </TabsTrigger>
          ) : null}
          <TabsTrigger value="genes" className={PILL_TABS_TRIGGER}>
            genes
          </TabsTrigger>
          <TabsTrigger value="embedding" className={PILL_TABS_TRIGGER}>
            embed
          </TabsTrigger>
        </SoftFloatSlidingTabsList>
        <span className="sr-only" data-testid="explore-coloring-by">
          {detail}
        </span>

        <div className="pt-0.5" data-testid="explore-color-controls">
          <TabsContent value="categories" className="m-0">
            <CategoriesControls lm={lm} signal={colorBy} />
          </TabsContent>
          <TabsContent value="genes" className="m-0">
            {lm.gene_columns.length ? (
              <GenesCombobox lm={lm} />
            ) : (
              <FieldDescription>
                No genes loaded. Pass genes=… to LandmarksWidget (default: all
                var names) or call set_expression.
              </FieldDescription>
            )}
          </TabsContent>
          <TabsContent value="embedding" className="m-0">
            <div className={STACK_GAP_SM}>
              <EmbeddingCombobox lm={lm} />
            </div>
          </TabsContent>
        </div>
      </Tabs>

    </div>
  );

  if (embedded) {
    return (
      <div
        className={cn("landmarks__explore-panel", EMBEDDED_PANEL)}
        data-testid="explore-panel"
      >
        <div
          className={            cn(
              PANEL_SCROLL,
              "min-w-0 overflow-x-hidden",
              PANEL_INSET,
            )}
        >
          {body}
        </div>
      </div>
    );
  }

  return (
    <div className="landmarks__explore-panel">
      <Card className={FLOAT_PANEL} data-testid="explore-panel">
        <div className={FLOAT_PANEL_CLIP}>
          <CardContent
            className={            cn(
              PANEL_SCROLL,
              "min-w-0 overflow-x-hidden",
              PANEL_INSET,
            )}
          >
            {body}
          </CardContent>
        </div>
      </Card>
    </div>
  );
}
