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
  colorSignal,
  colorSignalDetail,
  type ColorSignal,
} from "./coloring";
import {
  CategoriesControls,
  EmbeddingCombobox,
} from "./explore-panel";
import { GenesCombobox } from "./genes-legend";
import { InfoPanel } from "./info-panel";
import { RasterSection } from "./raster-section";
import { EMBEDDED_PANEL, PILL_TABS_TRIGGER, STACK_GAP_SM } from "./sections";
import { SoftFloatSlidingTabsList } from "./sliding-tabs";

/**
 * Soft Float right dock: pinned color pills + info plot; overlay-scroll
 * color controls underneath. One Tabs root keeps the switcher wired.
 */
export function RightChromeStack({
  lm,
  engine = null,
}: {
  lm: LandmarksModel;
  engine?: EngineHandle | null;
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

  return (
    <div
      className={cn(
        EMBEDDED_PANEL,
        "landmarks__explore-panel flex h-full min-h-0 w-full flex-1 flex-col",
      )}
      data-testid="info-explore-stack"
    >
      <div
        className={cn(
          "landmarks__chrome-stack landmarks-float-clip flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden",
          // Top inset on the stack; bottom inset is a shrink-0 spacer below the
          // scrollport so it never steals height from the controls.
          "pt-1.5",
        )}
      >
        <Tabs
          value={colorBy}
          onValueChange={onColorBy}
          className="flex min-h-0 flex-1 flex-col gap-2"
          data-testid="explore-color-by"
        >
          <div className="shrink-0 px-2.5">
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
          </div>
          <span className="sr-only absolute" data-testid="explore-coloring-by">
            {detail}
          </span>

          <div className="shrink-0 px-2.5">
            <InfoPanel lm={lm} engine={engine} embedded bare />
          </div>

          <div className="shrink-0 px-2.5">
            <RasterSection lm={lm} />
          </div>

          {/* Match left Layers: overlay-scroll owns inline pad + scrollbar lane. */}
          <div
            className="landmarks-overlay-scroll min-h-0 flex-1"
            data-testid="explore-panel"
          >
            <div data-testid="explore-color-controls">
              <TabsContent value="categories" className="m-0 flex-none">
                <CategoriesControls lm={lm} signal={colorBy} />
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
          </div>
        </Tabs>
        {/* Matches pt-1.5; shrink-0 so it stays when the dock hits max-height. */}
        <div className="h-1.5 shrink-0" aria-hidden />
      </div>
    </div>
  );
}
