import { useEffect, useState } from "react";

import { Card, CardContent } from "@/components/ui/card";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
import { FieldDescription } from "@/components/ui/field";
import { GroupBody, GroupChevron } from "@/components/ui/group-rise";
import { TooltipProvider } from "@/components/ui/tooltip";
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
  activateNumeric,
  colorSignal,
  colorSignalDetail,
  type ColorSignal,
} from "./coloring";
import { GenesCombobox } from "./genes-legend";
import { ChromeTooltip, LayerRow, PanelRow } from "./primitives";
import {
  EMBEDDED_PANEL,
  FLOAT_PANEL,
  FLOAT_PANEL_CLIP,
  PANEL_INSET,
  PANEL_INSET_Y,
  PANEL_SCROLL,
  PILL_TABS_TRIGGER,
  COMBO_INPUT,
  STACK_GAP_SM,
} from "./sections";
import { TactSlidingTabsList } from "./sliding-tabs";
import { useWidgetPortalContainer } from "./use-widget-portal";
import { isTypeRowActive } from "../type-focus";

const AVATAR_MAX = 5;

export function SubcategoryAvatars({ col }: { col: CategoryColumn }) {
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
          className="landmarks-subcat-avatar size-2.5 ring-1 ring-background"
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
        <span className="ml-0.5 font-medium text-foreground/75 landmarks__legend-overflow">
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


export function NumericObsCombobox({ lm }: { lm: LandmarksModel }) {
  const listed = lm._numeric_obs_columns || [];
  const fallback =
    lm.color_mode === "obs" && (lm.color || lm.legend_title)
      ? [lm.color || lm.legend_title]
      : [];
  const keys = listed.length ? listed : fallback;
  const value = lm.color || lm.legend_title || keys[0] || "";
  const [wrapRef, portalEl] = useWidgetPortalContainer();

  if (!keys.length) {
    return (
      <FieldDescription className="text-xs">
        No numeric <code className="text-xs">obs</code> columns synced yet. Assign{" "}
        <code className="text-xs">w.color</code> to a numeric column in the notebook.
      </FieldDescription>
    );
  }

  return (
    <div ref={wrapRef} className={STACK_GAP_SM} data-testid="numeric-obs-combobox">
      <p className="m-0 text-xs font-medium text-foreground/80">
        obs column{" "}
        <span className="font-normal text-foreground/65">
          {listed.length ? `${listed.length} available` : "1 active"}
        </span>
      </p>
      <Combobox
        items={keys}
        value={value || null}
        onValueChange={(next) => {
          if (typeof next === "string" && next) lm.setColor(next);
        }}
      >
        <ComboboxInput
          placeholder="Select numeric column"
          className={COMBO_INPUT}
          aria-label="Numeric obs column"
        />
        <ComboboxContent container={portalEl} className="text-xs">
          <ComboboxEmpty className="text-xs">No columns</ComboboxEmpty>
          <ComboboxList>
            {(item) => {
              const name = String(item);
              return (
                <ComboboxItem key={name} value={name} className="py-1 text-xs">
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
  selected_type_indices,
}: {
  col: CategoryColumn;
  lm: LandmarksModel;
  signal: ColorSignal;
  active_category: string;
  selected_kind: string;
  selected_index: number;
  selected_type_indices: number[];
}) {
  const [open, setOpen] = useState(false);
  const isShown = signal === "categories" && col.name === active_category;

  const activate = () => {
    lm.setActiveCategory(col);
    lm.select("", -1);
  };

  return (
    <div className="group/cat">
      <ChromeTooltip label={col.name}>
        <PanelRow
          className={cn(
            "landmarks-cat-trigger",
            isShown && "landmarks-cat-trigger--active",
          )}
          data-testid="category-row"
          lead={
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
              <GroupChevron open={open}>
                <ChevronRightIcon className="landmarks-layer-icon landmarks-cat-chevron-icon size-[0.875rem] shrink-0" />
              </GroupChevron>
            </button>
          }
          end={
            <>
              <span className="landmarks-panel-count" title="Unique subcategories">
                ({(col.labels || []).length})
              </span>
              <span className="landmarks-cat-avatars">
                <SubcategoryAvatars col={col} />
              </span>
            </>
          }
        >
          <button
            type="button"
            className="landmarks-layer-label block w-full min-w-0 cursor-pointer truncate text-left outline-none"
            data-testid="category-name"
            onClick={() => {
              activate();
            }}
          >
            {col.name}
          </button>
        </PanelRow>
      </ChromeTooltip>
      <GroupBody open={open} className="flex flex-col">
        {(col.labels || []).map((label, i) => (
          <LayerRow
            key={`${col.name}-${label}`}
            active={isTypeRowActive(i, {
              selected_kind,
              selected_index,
              selected_type_indices,
              active_category,
              columnName: col.name,
            })}
            color={
              (col.palette || [])[
                i % Math.max((col.palette || []).length, 1)
              ]
            }
            label={label}
            onSelect={(e) => lm.selectType(col, i, e)}
          />
        ))}
      </GroupBody>
    </div>
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
    selected_type_indices,
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
      <TooltipProvider delay={80}>
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
              <ChromeTooltip key={col.name} label={col.name}>
                <Label htmlFor={id} className="block">
                  <PanelRow
                    data-testid="category-row"
                    className={cn(
                      "landmarks-cat-trigger cursor-pointer",
                      selected && "landmarks-cat-trigger--active",
                    )}
                    lead={
                      <RadioGroupItem
                        value={col.name}
                        id={id}
                        className="size-[var(--lm-layer-swatch)] border-foreground/25 shadow-none"
                      />
                    }
                    end={
                      <>
                        <span className="landmarks-panel-count" title="Unique subcategories">
                          ({unique})
                        </span>
                        <span className="landmarks-cat-avatars">
                          <SubcategoryAvatars col={col} />
                        </span>
                      </>
                    }
                  >
                    <span
                      className="landmarks-layer-label block w-full min-w-0 truncate"
                      data-testid="category-name"
                    >
                      {col.name}
                    </span>
                  </PanelRow>
                </Label>
              </ChromeTooltip>
            );
          })}
        </RadioGroup>
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider delay={80}>
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
            selected_type_indices={selected_type_indices || []}
          />
        ))}
      </div>
    </TooltipProvider>
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
    if (
      next !== "categories" &&
      next !== "numeric" &&
      next !== "genes" &&
      next !== "embedding"
    ) {
      return;
    }
    setColorBy(next as ColorSignal);
    if (next === "categories") activateCategories(lm);
    else if (next === "numeric") activateNumeric(lm);
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
        <TactSlidingTabsList value={colorBy} aria-label="Color">
          {(lm.category_columns?.length ?? 0) > 0 ? (
            <TabsTrigger value="categories" className={PILL_TABS_TRIGGER}>
              cat
            </TabsTrigger>
          ) : null}
          <TabsTrigger value="numeric" className={PILL_TABS_TRIGGER}>
            num
          </TabsTrigger>
          <TabsTrigger value="genes" className={PILL_TABS_TRIGGER}>
            genes
          </TabsTrigger>
          <TabsTrigger value="embedding" className={PILL_TABS_TRIGGER}>
            embed
          </TabsTrigger>
        </TactSlidingTabsList>
        <span className="sr-only" data-testid="explore-coloring-by">
          {detail}
        </span>

        <div className="pt-0.5" data-testid="explore-color-controls">
          <TabsContent value="categories" className="m-0">
            <CategoriesControls lm={lm} signal={colorBy} />
          </TabsContent>
          <TabsContent value="numeric" className="m-0">
            <NumericObsCombobox lm={lm} />
          </TabsContent>
          <TabsContent value="genes" className="m-0">
            {lm.gene_names.length ? (
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
              PANEL_INSET_Y,
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
              PANEL_INSET_Y,
            )}
          >
            {body}
          </CardContent>
        </div>
      </Card>
    </div>
  );
}
