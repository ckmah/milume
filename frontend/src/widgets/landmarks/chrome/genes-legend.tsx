import { InfoIcon } from "lucide-react";

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
import { Switch } from "@/components/ui/switch";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import { GENE_COLORS, MAX_ACTIVE_GENES } from "../helpers";
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
  const { gene_columns, active_genes } = lm;
  const names = gene_columns.map((g) => g.name);
  const selected = active_genes || [];
  const atMax = selected.length >= MAX_ACTIVE_GENES;
  const [wrapRef, portalEl] = useWidgetPortalContainer();
  const anchor = useComboboxAnchor();

  return (
    <div ref={wrapRef} className="flex min-w-0 flex-col gap-2">
      <Combobox
        items={names}
        multiple
        value={selected}
        onValueChange={(next) => {
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
                  <ColorSwatch color={GENE_COLORS[i % GENE_COLORS.length]} />
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
                  <ColorSwatch
                    color={
                      selIdx >= 0
                        ? GENE_COLORS[selIdx % GENE_COLORS.length]
                        : undefined
                    }
                  />
                  {name}
                </ComboboxItem>
              );
            }}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
      <GenesScaleToggles lm={lm} />
    </div>
  );
}
