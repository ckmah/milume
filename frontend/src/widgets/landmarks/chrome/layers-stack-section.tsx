import { useMemo, useState } from "react";
import { ChevronRightIcon, EyeIcon, EyeOffIcon, LayersIcon } from "lucide-react";

import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
import { FieldDescription } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

import type { CategoryColumn } from "../helpers";
import type { LandmarksModel } from "../use-landmarks-model";
import { COMBO_INPUT, META_LINE, STACK_GAP_SM } from "./sections";
import { SoftFloatSliderRow } from "./soft-float-slider";
import { useWidgetPortalContainer } from "./use-widget-portal";

const MAX_VISIBLE_CHANNELS = 6;

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
  const [channelCapHint, setChannelCapHint] = useState(false);
  const hasImage = Boolean(volume?.image_url);
  const channels = lm._image_channels?.length ? lm._image_channels : volume?.channels ?? [];
  const visibleChannel = channels.find((c) => c.visible && !c.constant_zero);
  const imageLabel = visibleChannel?.name ?? channels[0]?.name ?? "Image";
  const imageVisible = lm._image_visible !== false;
  const imageAlpha = lm._image_alpha ?? 0.55;
  const defaultContrast = visibleChannel?.contrast_limits ??
    volume?.contrast_limits ?? [0, 255];

  const displayChannels = useMemo(
    () => channels.filter((c) => !c.constant_zero),
    [channels],
  );

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
          <div
            className={cn(
              "landmarks-layer-row flex h-auto w-full items-center justify-start text-xs text-foreground",
              imageOpen && "landmarks-layer-row--active",
            )}
          >
            <Button
              type="button"
              variant="ghost"
              className="h-auto min-w-0 flex-1 justify-start gap-0 px-0 text-xs text-foreground hover:bg-transparent"
              aria-expanded={imageOpen}
              data-testid="layers-image-row"
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
                Image · {imageLabel}
              </span>
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="landmarks-layer-icon size-6 shrink-0"
              aria-label={imageVisible ? "Hide image layer" : "Show image layer"}
              data-testid="layer-toggle-image"
              onClick={() => lm.setImageVisible(!imageVisible)}
            >
              {imageVisible ? (
                <EyeIcon className="size-[0.875rem] opacity-70" />
              ) : (
                <EyeOffIcon className="size-[0.875rem] opacity-70" />
              )}
            </Button>
          </div>
          {imageOpen ? (
            <div className="flex flex-col gap-2 px-2.5 pt-1.5 pb-1">
              <SoftFloatSliderRow
                caption="Contrast"
                aria-label="Image contrast"
                min={defaultContrast[0]}
                max={defaultContrast[1]}
                step={1}
                value={[
                  visibleChannel?.contrast_limits?.[0] ?? defaultContrast[0],
                  visibleChannel?.contrast_limits?.[1] ?? defaultContrast[1],
                ]}
                readout={`${Math.round(visibleChannel?.contrast_limits?.[0] ?? defaultContrast[0])}–${Math.round(visibleChannel?.contrast_limits?.[1] ?? defaultContrast[1])}`}
                onValueChange={(v) => {
                  if (!visibleChannel) return;
                  lm.patchImageChannel(visibleChannel.name, {
                    contrast_limits: [v[0]!, v[1]!],
                  });
                }}
              />
              <SoftFloatSliderRow
                caption="Alpha"
                aria-label="Image alpha"
                min={0}
                max={1}
                step={0.01}
                value={[imageAlpha]}
                readout={imageAlpha.toFixed(2)}
                onValueChange={(v) => lm.setImageAlpha(v[0] ?? 0.55)}
              />
              {displayChannels.length > 1 ? (
                <div className="flex flex-col gap-1">
                  <p className={META_LINE}>Channels</p>
                  {displayChannels.map((ch) => (
                    <div
                      key={ch.name}
                      className="flex items-center justify-between gap-2 text-[11px]"
                    >
                      <span className="truncate">{ch.name}</span>
                      <Switch
                        size="sm"
                        checked={ch.visible}
                        aria-label={`Show ${ch.name}`}
                        data-testid={`layer-channel-${ch.name}`}
                        onCheckedChange={(next) => {
                          if (next) {
                            const visibleCount = displayChannels.filter((c) => c.visible).length;
                            if (visibleCount >= MAX_VISIBLE_CHANNELS) {
                              setChannelCapHint(true);
                              return;
                            }
                          }
                          setChannelCapHint(false);
                          lm.patchImageChannel(ch.name, { visible: next });
                        }}
                      />
                    </div>
                  ))}
                  {channelCapHint ? (
                    <p className="m-0 text-[11px] text-foreground/80">
                      At most {MAX_VISIBLE_CHANNELS} channels at once.
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
