import { useCallback, useEffect, useMemo, useState, type KeyboardEvent } from "react";
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
import type { ImageChannelRow, LandmarksModel } from "../use-landmarks-model";
import { COMBO_INPUT, META_LINE, STACK_GAP_SM } from "./sections";
import { SoftFloatSliderRow } from "./soft-float-slider";
import { useWidgetPortalContainer } from "./use-widget-portal";

const MAX_VISIBLE_CHANNELS = 6;
const CHANNEL_TINTS = [
  "#6eb5ff",
  "#ff8844",
  "#55cc88",
  "#cc66cc",
  "#ffdd44",
  "#44dddd",
  "#ff66aa",
  "#aabb44",
] as const;

function channelTint(ch: ImageChannelRow, index: number): string {
  if (ch.color) return ch.color;
  return CHANNEL_TINTS[index % CHANNEL_TINTS.length] ?? "#cccccc";
}

function formatImageHeaderLabel(channels: ImageChannelRow[]): string {
  const on = channels.filter((c) => c.visible);
  if (!on.length) return "Image";
  if (on.length === 1) return `Image · ${on[0]!.name}`;
  if (on.length === 2) return `Image · ${on[0]!.name} + ${on[1]!.name}`;
  return `Image · ${on.length} channels`;
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

function ImageChannelRowControl({
  ch,
  index,
  onFocus,
  onToggle,
}: {
  ch: ImageChannelRow;
  index: number;
  onFocus: () => void;
  onToggle: (next: boolean) => void;
}) {
  const tint = channelTint(ch, index);

  const onRowKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onToggle(!ch.visible);
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      data-testid={`layer-channel-row-${ch.name}`}
      className="landmarks-image-channel-row"
      onClick={() => onToggle(!ch.visible)}
      onFocus={onFocus}
      onKeyDown={onRowKey}
    >
      <span
        className="landmarks-layer-swatch shrink-0 rounded-full"
        style={{ backgroundColor: tint }}
        aria-hidden
      />
      <span className="landmarks-image-channel-row__name">{ch.name}</span>
      <Switch
        size="sm"
        checked={ch.visible}
        aria-label={`Show ${ch.name}`}
        data-testid={`layer-channel-${ch.name}`}
        onCheckedChange={(next) => onToggle(next)}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      />
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
  const [focusedChannel, setFocusedChannel] = useState<string | null>(null);
  const hasImage = Boolean(volume?.image_url);
  const channels = lm._image_channels?.length ? lm._image_channels : volume?.channels ?? [];
  const imageVisible = lm._image_visible !== false;
  const imageAlpha = lm._image_alpha ?? 0.55;

  const displayChannels = useMemo(
    () => channels.filter((c) => !c.constant_zero),
    [channels],
  );

  const visibleChannels = useMemo(
    () => displayChannels.filter((c) => c.visible),
    [displayChannels],
  );

  const imageHeaderLabel = useMemo(
    () => formatImageHeaderLabel(displayChannels),
    [displayChannels],
  );

  const contrastChannel = useMemo(() => {
    if (focusedChannel) {
      const focused = displayChannels.find((c) => c.name === focusedChannel);
      if (focused?.visible) return focused;
    }
    return visibleChannels[0] ?? displayChannels[0] ?? null;
  }, [displayChannels, focusedChannel, visibleChannels]);

  useEffect(() => {
    if (!contrastChannel) return;
    if (focusedChannel && displayChannels.some((c) => c.name === focusedChannel)) return;
    setFocusedChannel(contrastChannel.name);
  }, [contrastChannel, displayChannels, focusedChannel]);

  const defaultContrast = contrastChannel?.contrast_limits ??
    volume?.contrast_limits ?? [0, 255];

  const toggleChannel = useCallback(
    (name: string, next: boolean) => {
      if (next) {
        const visibleCount = displayChannels.filter((c) => c.visible).length;
        if (visibleCount >= MAX_VISIBLE_CHANNELS) {
          setChannelCapHint(true);
          return;
        }
      }
      setChannelCapHint(false);
      lm.patchImageChannel(name, { visible: next });
      if (next) {
        setFocusedChannel(name);
      } else if (name === focusedChannel) {
        const fallback =
          displayChannels.find((c) => c.visible && c.name !== name)?.name ??
          visibleChannels.find((c) => c.name !== name)?.name ??
          null;
        setFocusedChannel(fallback);
      }
    },
    [displayChannels, focusedChannel, lm, visibleChannels],
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
          <div
            className="landmarks-layer-row justify-between text-xs text-foreground"
            data-testid="layers-cells-row"
          >
            <span className="inline-flex min-w-0 items-center gap-1.5">
              <LayersIcon className="landmarks-layer-icon size-[0.875rem] shrink-0 opacity-70" />
              <span className="landmarks-layer-label truncate">
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
              "landmarks-layer-row justify-between text-xs text-foreground",
              imageOpen && "landmarks-layer-row--active",
            )}
            data-testid="layers-image-header"
          >
            <Button
              type="button"
              variant="ghost"
              className="landmarks-layers-image-trigger h-full min-h-0 min-w-0 flex-1 justify-start gap-1.5 px-0 text-xs font-normal text-foreground hover:bg-transparent"
              aria-expanded={imageOpen}
              data-testid="layers-image-row"
              onClick={() => setImageOpen((v) => !v)}
            >
              <ChevronRightIcon
                className={cn(
                  "landmarks-layer-icon size-[0.875rem] shrink-0 opacity-70 transition-transform",
                  imageOpen && "rotate-90",
                )}
                aria-hidden
              />
              <span className="landmarks-layer-label min-w-0 flex-1 truncate text-left">
                {imageHeaderLabel}
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
              <div className="landmarks-slider-stack landmarks-image-controls">
                <SoftFloatSliderRow
                  className="landmarks-slider-row--contrast"
                  caption={
                    contrastChannel ? `${contrastChannel.name} contrast` : "Contrast"
                  }
                  aria-label={
                    contrastChannel
                      ? `${contrastChannel.name} contrast`
                      : "Image contrast"
                  }
                  testId="layer-image-contrast"
                  min={defaultContrast[0]}
                  max={defaultContrast[1]}
                  step={1}
                  value={[
                    contrastChannel?.contrast_limits?.[0] ?? defaultContrast[0],
                    contrastChannel?.contrast_limits?.[1] ?? defaultContrast[1],
                  ]}
                  readout={`${Math.round(contrastChannel?.contrast_limits?.[0] ?? defaultContrast[0])}–${Math.round(contrastChannel?.contrast_limits?.[1] ?? defaultContrast[1])}`}
                  onValueChange={(v) => {
                    if (!contrastChannel) return;
                    lm.patchImageChannel(contrastChannel.name, {
                      contrast_limits: [v[0]!, v[1]!],
                    });
                  }}
                />
                <SoftFloatSliderRow
                  className="landmarks-slider-row--alpha"
                  caption="Alpha"
                  aria-label="Image alpha"
                  min={0}
                  max={1}
                  step={0.01}
                  value={[imageAlpha]}
                  readout={imageAlpha.toFixed(2)}
                  onValueChange={(v) => lm.setImageAlpha(v[0] ?? 0.55)}
                />
              </div>
              {displayChannels.length > 1 ? (
                <div className="flex flex-col gap-1">
                  <p className={META_LINE}>Channels</p>
                  <div
                    className="landmarks-image-channel-list"
                    data-testid="layer-channel-list"
                  >
                    {displayChannels.map((ch, index) => (
                      <ImageChannelRowControl
                        key={ch.name}
                        ch={ch}
                        index={index}
                        onFocus={() => setFocusedChannel(ch.name)}
                        onToggle={(next) => toggleChannel(ch.name, next)}
                      />
                    ))}
                  </div>
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

export function layersStackCount(lm: LandmarksModel): number {
  let n = lm.category_columns.length > 0 ? 1 : 0;
  if (lm.volume?.image_url) n += 1;
  return n;
}
