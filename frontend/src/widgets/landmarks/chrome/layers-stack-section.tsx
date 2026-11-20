import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { ChevronRightIcon } from "lucide-react";

import { FieldDescription } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

import { channelDisplayColor } from "@/widgets/volume-cube/tint-palette";

import type { ImageChannelRow, LandmarksModel } from "../use-landmarks-model";
import { ChannelColorPicker } from "./channel-color-picker";
import { META_LINE } from "./sections";
import { cellSizeControl, knownUmPerUnit } from "./layers-size";
import { formatSliderReadout } from "./slider-readout";
import { TactSliderRow } from "./slider-row";

const MAX_VISIBLE_CHANNELS = 6;

function formatImageHeaderLabel(channels: ImageChannelRow[]): string {
  const on = channels.filter((c) => c.visible);
  if (!on.length) return "Image";
  if (on.length === 1) return `Image · ${on[0]!.name}`;
  if (on.length === 2) return `Image · ${on[0]!.name} + ${on[1]!.name}`;
  return `Image · ${on.length} channels`;
}

function ImageChannelRowControl({
  ch,
  index,
  solo,
  onFocus,
  onToggle,
  onColor,
}: {
  ch: ImageChannelRow;
  index: number;
  solo: boolean;
  onFocus: () => void;
  onToggle: (next: boolean) => void;
  onColor: (next: string | null) => void;
}) {
  const tint = channelDisplayColor(ch.color, index, solo);

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
      <ChannelColorPicker name={ch.name} color={tint} onColorChange={onColor} />
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

/** Layers accordion body — Cells (map style) and optional Image (volume). */
export function LayersStackSection({ lm }: { lm: LandmarksModel }) {
  const { category_columns, volume, active_category } = lm;
  const [cellsOpen, setCellsOpen] = useState(true);
  const [imageOpen, setImageOpen] = useState(false);
  const contrastDomain = useRef(new Map<string, number>());
  const [channelCapHint, setChannelCapHint] = useState(false);
  const [focusedChannel, setFocusedChannel] = useState<string | null>(null);
  const hasImage = Boolean(volume?.image_url);
  const channels = lm._image_channels?.length ? lm._image_channels : volume?.channels ?? [];
  const imageVisible = lm._image_visible !== false;
  const imageAlpha = lm._image_alpha ?? 0.55;
  const pointSize = lm.point_size ?? 1;
  const cellsVisible = lm._cells_visible !== false;
  const cellsOpacity = lm._cells_opacity ?? 0.8;
  const umPerUnit = knownUmPerUnit(lm._um_per_unit);
  const sizeControl = useMemo(
    () => cellSizeControl(pointSize, umPerUnit, lm.x_bounds),
    [lm.x_bounds, pointSize, umPerUnit],
  );
  const activeCol =
    category_columns.find((c) => c.name === active_category) ||
    category_columns[0] ||
    null;
  const cellsHeader =
    activeCol?.name && activeCol.name !== "category"
      ? `Cells · ${activeCol.name}`
      : "Cells";
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
  const contrastMax = useMemo(() => {
    const name = contrastChannel?.name ?? "image";
    const hi = defaultContrast[1] ?? 255;
    const seeded = contrastDomain.current.get(name);
    if (seeded != null) return seeded;
    const next = Math.max(255, Math.ceil(hi * 4));
    contrastDomain.current.set(name, next);
    return next;
  }, [contrastChannel?.name, defaultContrast]);

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
      <FieldDescription className="px-0 pb-2">
        No layers yet. Load category columns or a volume image in the notebook.
      </FieldDescription>
    );
  }

  return (
    <div className="landmarks-layers-stack flex flex-col gap-0.5 pb-2">
      {category_columns.length ? (
        <div className="landmarks-layers-stack__row">
          <div
            className="landmarks-layer-row justify-between text-xs text-foreground"
            data-testid="layers-cells-row"
          >
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="landmarks-cat-chevron shrink-0"
              aria-expanded={cellsOpen}
              aria-label={cellsOpen ? "Collapse cells layer" : "Expand cells layer"}
              data-testid="layers-cells-header"
              onClick={() => setCellsOpen((v) => !v)}
            >
              <ChevronRightIcon
                className={cn(
                  "landmarks-layer-icon landmarks-cat-chevron-icon size-[0.875rem] shrink-0 opacity-70",
                  cellsOpen && "landmarks-cat-chevron-icon--open",
                )}
                aria-hidden
              />
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="landmarks-layers-image-trigger h-full min-h-0 min-w-0 flex-1 justify-start gap-1.5 px-0 text-xs font-normal text-foreground hover:bg-transparent"
              onClick={() => setCellsOpen((v) => !v)}
            >
              <span
                className={cn(
                  "landmarks-layer-label min-w-0 flex-1 truncate text-left",
                  !cellsVisible && "opacity-45",
                )}
              >
                {cellsHeader}
              </span>
            </Button>
            <Switch
              size="sm"
              className="shrink-0"
              checked={cellsVisible}
              aria-label={cellsVisible ? "Hide cells layer" : "Show cells layer"}
              data-testid="layer-toggle-cells"
              onCheckedChange={(next) => lm.setCellsVisible(next)}
            />
          </div>
          {cellsOpen ? (
            <div className="landmarks-layers-stack__nested flex flex-col gap-2 pb-1">
              <div className="landmarks-slider-stack">
                <TactSliderRow
                  className="landmarks-slider-row--point-size"
                  caption={sizeControl.caption}
                  aria-label={umPerUnit != null ? "Cell dot diameter" : "Cell point size"}
                  testId="layer-cells-point-size"
                  min={sizeControl.min}
                  max={sizeControl.max}
                  step={sizeControl.step}
                  disabled={!cellsVisible}
                  value={[sizeControl.value]}
                  formatValue={(v) => `${formatSliderReadout(v, sizeControl.step)} ${sizeControl.unit}`}
                  onValueChange={(v) => {
                    const next = v[0];
                    if (next == null || !cellsVisible) return;
                    lm.setPointSize(sizeControl.toPointSize(next));
                  }}
                />
                <TactSliderRow
                  className="landmarks-slider-row--cells-opacity"
                  caption="Opacity"
                  aria-label="Cells opacity"
                  testId="layer-cells-opacity"
                  min={0}
                  max={1}
                  step={0.01}
                  value={[cellsOpacity]}
                  onValueChange={(v) => lm.setCellsOpacity(v[0] ?? cellsOpacity)}
                />
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {hasImage ? (
        <div className="landmarks-layers-stack__row">
          <div
            className="landmarks-layer-row justify-between text-xs text-foreground"
            data-testid="layers-image-header"
          >
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="landmarks-cat-chevron shrink-0"
              aria-expanded={imageOpen}
              aria-label={imageOpen ? "Collapse image layer" : "Expand image layer"}
              data-testid="layers-image-row"
              onClick={() => setImageOpen((v) => !v)}
            >
              <ChevronRightIcon
                className={cn(
                  "landmarks-layer-icon landmarks-cat-chevron-icon size-[0.875rem] shrink-0 opacity-70",
                  imageOpen && "landmarks-cat-chevron-icon--open",
                )}
                aria-hidden
              />
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="landmarks-layers-image-trigger h-full min-h-0 min-w-0 flex-1 justify-start gap-1.5 px-0 text-xs font-normal text-foreground hover:bg-transparent"
              onClick={() => setImageOpen((v) => !v)}
            >
              <span className="landmarks-layer-label min-w-0 flex-1 truncate text-left">
                {imageHeaderLabel}
              </span>
            </Button>
            <Switch
              size="sm"
              className="shrink-0"
              checked={imageVisible}
              aria-label={imageVisible ? "Hide image layer" : "Show image layer"}
              data-testid="layer-toggle-image"
              onCheckedChange={(next) => lm.setImageVisible(next)}
            />
          </div>
          {imageOpen ? (
            <div className="landmarks-layers-stack__nested flex flex-col gap-2 pb-1">
              <div className="landmarks-slider-stack landmarks-image-controls">
                <TactSliderRow
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
                  min={0}
                  max={contrastMax}
                  step={1}
                  value={[
                    contrastChannel?.contrast_limits?.[0] ?? defaultContrast[0],
                    contrastChannel?.contrast_limits?.[1] ?? defaultContrast[1],
                  ]}
                  readout={`${formatSliderReadout(contrastChannel?.contrast_limits?.[0] ?? defaultContrast[0], 1)}–${formatSliderReadout(contrastChannel?.contrast_limits?.[1] ?? defaultContrast[1], 1)}`}
                  onValueChange={(v) => {
                    if (!contrastChannel) return;
                    lm.patchImageChannel(contrastChannel.name, {
                      contrast_limits: [v[0]!, v[1]!],
                    });
                  }}
                />
                <TactSliderRow
                  className="landmarks-slider-row--alpha"
                  caption="Opacity"
                  aria-label="Image opacity"
                  testId="layer-image-opacity"
                  min={0}
                  max={1}
                  step={0.01}
                  value={[imageAlpha]}
                  readout={formatSliderReadout(imageAlpha, 0.01)}
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
                        solo={ch.visible && visibleChannels.length === 1}
                        onFocus={() => setFocusedChannel(ch.name)}
                        onToggle={(next) => toggleChannel(ch.name, next)}
                        onColor={(next) => lm.patchImageChannel(ch.name, { color: next })}
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
