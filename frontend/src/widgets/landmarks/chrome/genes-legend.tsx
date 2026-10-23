import { InfoIcon } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxClear,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
  ComboboxValue,
  useComboboxAnchor,
} from "@/components/ui/combobox";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import { filterGeneNamesForPicker } from "../gene-picker-list.js";
import { GENE_AGGREGATES, type GeneAggregate } from "../gene-store.js";
import { GENE_COLORS, MAX_ACTIVE_GENES, geneColor } from "../helpers";
import type { LandmarksModel } from "../use-landmarks-model";
import { colorSignal } from "./coloring";
import { CHIP_CLASS, ChromeTooltip, ColorSwatch } from "./primitives";
import { MUTED_CONTROL } from "./sections";
import { useWidgetPortalContainer } from "./use-widget-portal";

function ScaleInfoTip({ label }: { label: string }) {
  return (
    <ChromeTooltip label={label}>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        className="size-5 text-foreground/55 hover:bg-transparent hover:text-foreground"
        aria-label={label}
        onClick={(e) => e.preventDefault()}
      >
        <InfoIcon />
      </Button>
    </ChromeTooltip>
  );
}

function geneSwatch(index: number, count: number): string | undefined {
  return index < 0 ? undefined : geneColor(index, count);
}

const AGGREGATE_LABEL: Record<GeneAggregate, string> = { mean: "Mean", median: "Median", max: "Max" };

/** 4+ genes: pick how the selected genes' normalized values combine per cell. */
function GenesAggregateControl({ lm }: { lm: LandmarksModel }) {
  const count = lm.active_genes?.length || 0;
  if (count <= GENE_COLORS.length) return null;
  return (
    <div className="flex flex-col gap-1 text-xs text-foreground" data-testid="genes-aggregate">
      <Label className="text-xs font-normal">Combine {count} genes</Label>
      <ToggleGroup
        type="single"
        size="sm"
        spacing={1}
        aria-label="Combine selected genes"
        className="w-full gap-0.5"
        value={lm.genes.aggregate}
        onValueChange={(v) => v && lm.setGeneAggregate(v as GeneAggregate)}
      >
        {GENE_AGGREGATES.map((mode) => (
          <ToggleGroupItem key={mode} value={mode} className="h-6 flex-1 px-2 text-[11px]" data-testid={`genes-aggregate-${mode}`}>
            {AGGREGATE_LABEL[mode]}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  );
}

/** Loading / failure line for genes still arriving from the kernel. */
function GenesLoadStatus({ lm }: { lm: LandmarksModel }) {
  const selected = lm.active_genes || [];
  const pending = lm.genes.pending().filter((n) => selected.includes(n));
  const failed = selected.filter((n) => lm.genes.error(n));
  if (!pending.length && !failed.length) return null;
  return (
    <p className="text-[11px] text-muted-foreground" data-testid="genes-load-status" role="status">
      {pending.length ? `Loading ${pending.length === 1 ? pending[0] : `${pending.length} genes`}…` : null}
      {failed.length ? ` Couldn't load ${failed.join(", ")}: ${lm.genes.error(failed[0]!)}` : null}
    </p>
  );
}

function GenesScaleToggles({ lm }: { lm: LandmarksModel }) {
  const {
    active_genes,
    gene_scale_mode,
    gene_log1p,
    gene_expression_logged,
  } = lm;
  if (colorSignal(lm) !== "genes" || !(active_genes?.length || 0)) return null;

  return (
    <TooltipProvider delayDuration={80} skipDelayDuration={0}>
      <div className="flex flex-col gap-0">
        <div className="landmarks-layer-row justify-between text-xs text-foreground">
          <span className="inline-flex min-w-0 items-center gap-0.5">
            Shared scale
            <ScaleInfoTip label="Max of selected genes" />
          </span>
          <Switch
            size="sm"
            checked={gene_scale_mode === "shared"}
            onCheckedChange={(on) =>
              lm.setGeneScaleMode(on ? "shared" : "independent")
            }
          />
        </div>
        <div className="landmarks-layer-row justify-between text-xs text-foreground">
          <span className="inline-flex min-w-0 items-center gap-0.5">
            log scale
            <ScaleInfoTip label="Compress high expression" />
          </span>
          <Switch
            size="sm"
            checked={!!gene_log1p}
            disabled={!!gene_expression_logged}
            onCheckedChange={(on) => {
              if (!gene_expression_logged) lm.setGeneLog1p(on);
            }}
          />
        </div>
      </div>
    </TooltipProvider>
  );
}

export function GenesCombobox({ lm }: { lm: LandmarksModel }) {
  const { gene_names, active_genes } = lm;
  const names = useMemo(() => gene_names.map((g) => g.name), [gene_names]);
  const selected = active_genes || [];
  const atMax = selected.length >= MAX_ACTIVE_GENES;
  const [wrapRef, portalEl] = useWidgetPortalContainer();
  const anchor = useComboboxAnchor();
  const [filterQuery, setFilterQuery] = useState("");
  const visibleNames = useMemo(
    () => filterGeneNamesForPicker(names, filterQuery),
    [names, filterQuery],
  );

  return (
    <div ref={wrapRef} className="flex min-w-0 flex-col gap-2">
      <Combobox
        items={names}
        filteredItems={visibleNames}
        onInputValueChange={(value) => setFilterQuery(String(value ?? ""))}
        autoHighlight
        multiple
        value={selected}
        onValueChange={(next, details) => {
          // Base UI clears a multi-select on Escape when the popup is closed (#252).
          // Escape should only ever close the popup; × and chip removal clear genes.
          if (details.reason === "escape-key") {
            details.cancel();
            return;
          }
          const arr = Array.isArray(next) ? next.map(String) : [];
          lm.setActiveGenes(arr.slice(0, MAX_ACTIVE_GENES));
        }}
      >
        <div className="relative">
          <ComboboxChips
            ref={anchor}
            className={cn(
              MUTED_CONTROL,
              "min-w-0 w-full flex-wrap rounded-md px-1.5 py-1",
              selected.length > 0 && "pr-8",
            )}
          >
            <ComboboxValue>
              {selected.map((name, i) => (
                <ComboboxChip key={name} className={cn(CHIP_CLASS, "max-w-full gap-1 truncate rounded-md text-[10px]")}>
                  <ColorSwatch color={geneSwatch(i, selected.length)} />
                  {name}
                </ComboboxChip>
              ))}
            </ComboboxValue>
            <ComboboxChipsInput
              placeholder={selected.length ? "" : "Select genes"}
              className="min-w-12 max-w-full text-[11px]"
            />
          </ComboboxChips>
          {selected.length > 0 ? (
            <ComboboxClear className="absolute top-1 right-1" />
          ) : null}
        </div>
        <ComboboxContent container={portalEl} anchor={anchor} className="text-xs">
          <ComboboxEmpty className="text-xs">No genes found.</ComboboxEmpty>
          <ComboboxList>
            {(item) => {
              const name = String(item);
              const selIdx = selected.indexOf(name);
              const disabled = atMax && selIdx < 0;
              return (
                <ComboboxItem
                  key={name}
                  value={name}
                  disabled={disabled}
                  className="py-1 text-xs"
                >
                  <ColorSwatch color={geneSwatch(selIdx, selected.length)} />
                  {name}
                </ComboboxItem>
              );
            }}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
      <GenesLoadStatus lm={lm} />
      <GenesAggregateControl lm={lm} />
      <GenesScaleToggles lm={lm} />
    </div>
  );
}
