import { useEffect, useState } from "react";

import { FieldDescription } from "@/components/ui/field";
import { Tabs, TabsContent, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

import type { EngineHandle } from "../engine";
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
import {
  CategoriesControls,
  EmbeddingCombobox,
  NumericObsCombobox,
} from "./explore-panel";
import { GenesCombobox } from "./genes-legend";
import { InfoPanel } from "./info-panel";
import { MinimiseColorChip } from "./minimise-color-chip";
import { PanelBand, PanelGridScroll } from "./primitives";
import { RasterSection } from "./raster-section";
import { EMBEDDED_PANEL, PILL_TABS_TRIGGER, STACK_GAP_SM } from "./sections";
import { TactSlidingTabsList } from "./sliding-tabs";

/**
 * Soft Float right dock: pinned color pills + info plot; overlay-scroll
 * color controls underneath. One Tabs root keeps the switcher wired.
 */
export function RightChromeStack({
  lm,
  engine = null,
  minimise = false,
  rightCardExpanded = true,
  onExpandRightCard,
}: {
  lm: LandmarksModel;
  engine?: EngineHandle | null;
  minimise?: boolean;
  /** When minimise is on, false shows the single color chip row only. */
  rightCardExpanded?: boolean;
  onExpandRightCard?: () => void;
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
  const chipMode = minimise && !rightCardExpanded;

  return (
    <div
      className={cn(
        EMBEDDED_PANEL,
        "landmarks__explore-panel landmarks-float-clip flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden pt-1.5",
      )}
      data-testid="info-explore-stack"
    >
      {chipMode ? (
        <MinimiseColorChip lm={lm} onExpand={() => onExpandRightCard?.()} />
      ) : null}
      <div
        className={cn(
          "landmarks__chrome-stack-body flex min-h-0 flex-1 flex-col",
          chipMode && "hidden",
        )}
      >
        <Tabs
          value={colorBy}
          onValueChange={onColorBy}
          className="flex min-h-0 flex-1 flex-col gap-2"
          data-testid="explore-color-by"
        >
          <div className="landmarks-panel-grid__inset-x shrink-0">
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
          </div>
          <span className="sr-only absolute" data-testid="explore-coloring-by">
            {detail}
          </span>

          <div className="landmarks-panel-grid__inset-x shrink-0">
            <InfoPanel lm={lm} engine={engine} embedded bare />
          </div>

          <div className="landmarks-panel-grid__inset-x shrink-0">
            <RasterSection lm={lm} />
          </div>

          <PanelBand className="landmarks-panel-section--open flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            <PanelGridScroll data-testid="explore-panel">
              <div data-testid="explore-color-controls">
                <TabsContent value="categories" className="m-0 flex-none">
                  <CategoriesControls lm={lm} signal={colorBy} />
                </TabsContent>
                <TabsContent value="numeric" className="m-0 flex-none">
                  <NumericObsCombobox lm={lm} />
                </TabsContent>
                <TabsContent value="genes" className="m-0 flex-none">
                  {lm.gene_names.length ? (
                    <GenesCombobox lm={lm} />
                  ) : (
                    <FieldDescription>
                      No genes loaded. Pass genes=… to LandmarksWidget (default:
                      all var names) or call set_expression.
                    </FieldDescription>
                  )}
                </TabsContent>
                <TabsContent value="embedding" className="m-0 flex-none">
                  <div className={STACK_GAP_SM}>
                    <EmbeddingCombobox lm={lm} />
                  </div>
                </TabsContent>
              </div>
            </PanelGridScroll>
          </PanelBand>
        </Tabs>
      </div>
    </div>
  );
}
