import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactElement,
} from "react";
import { ChevronRightIcon } from "lucide-react";

import { FieldDescription } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { GroupBody, GroupChevron } from "@/components/ui/group-rise";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

import { channelDisplayColor } from "@/widgets/volume-cube/tint-palette";

import type { ImageChannelRow, LandmarksModel } from "../use-landmarks-model";
import { ChannelColorPicker } from "./channel-color-picker";
import { cellSizeControl, knownUmPerUnit } from "./layers-size";
import { formatSliderReadout } from "./slider-readout";
import { PanelRow } from "./primitives";
import { TactSliderRow } from "./slider-row";

const MAX_VISIBLE_CHANNELS = 6;

function channelAlpha(ch: ImageChannelRow, fallback: number): number {
  return typeof ch.alpha === "number" && Number.isFinite(ch.alpha)
    ? Math.min(1, Math.max(0, ch.alpha))
    : fallback;
}

function contrastCeiling(name: string, hi: number, domain: Map<string, number>): number {
  const seeded = domain.get(name);
  if (seeded != null) return seeded;
  const next = Math.max(255, Math.ceil(hi * 4));
  domain.set(name, next);
  return next;
}

function imageSliderRows({
  ch,
  fallbackAlpha,
  domain,
  solo,
  lm,
}: {
  ch: ImageChannelRow;
  fallbackAlpha: number;
  domain: Map<string, number>;
  solo: boolean;
  lm: LandmarksModel;
}): ReactElement[] {
  const lo = ch.contrast_limits?.[0] ?? 0;
  const hi = ch.contrast_limits?.[1] ?? 255;
  const ceiling = contrastCeiling(ch.name, hi, domain);
  const alpha = channelAlpha(ch, fallbackAlpha);
  const contrastLabel = `${ch.name} contrast`;
  const opacityLabel = `${ch.name} opacity`;
  return [
    <TactSliderRow
      key={`${ch.name}-contrast`}
      inline
      className="landmarks-slider-row--contrast"
      caption={contrastLabel}
      aria-label={contrastLabel}
      testId={solo ? "layer-image-contrast" : `layer-channel-contrast-${ch.name}`}
      min={0}
      max={ceiling}
      step={1}
      value={[lo, hi]}
      readout={`${formatSliderReadout(lo, 1)}–${formatSliderReadout(hi, 1)}`}
      onValueChange={(v) => {
        lm.patchImageChannel(ch.name, { contrast_limits: [v[0]!, v[1]!] });
      }}
    />,
    <TactSliderRow
      key={`${ch.name}-opacity`}
      inline
      className="landmarks-slider-row--alpha"
      caption={opacityLabel}
      aria-label={opacityLabel}
      testId={solo ? "layer-image-opacity" : `layer-channel-opacity-${ch.name}`}
      min={0}
      max={1}
      step={0.01}
      value={[alpha]}
      readout={formatSliderReadout(alpha, 0.01)}
      onValueChange={(v) => lm.patchImageChannel(ch.name, { alpha: v[0] ?? alpha })}
    />,
  ];
}

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
  onFocus?: () => void;
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
    <PanelRow
      role="button"
      tabIndex={0}
      data-testid={`layer-channel-row-${ch.name}`}
      className="landmarks-image-channel-row"
      onClick={() => onToggle(!ch.visible)}
      onFocus={() => onFocus?.()}
      onKeyDown={onRowKey}
      lead={<ChannelColorPicker name={ch.name} color={tint} onColorChange={onColor} />}
      end={
        <Switch
          size="sm"
          checked={ch.visible}
          aria-label={`Show ${ch.name}`}
          data-testid={`layer-channel-${ch.name}`}
          onCheckedChange={(next) => onToggle(next)}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        />
      }
    >
      <span className="landmarks-image-channel-row__name">{ch.name}</span>
    </PanelRow>
  );
}

/** Layers accordion body — Cells (map style) and optional Image (volume). */
export function LayersStackSection({ lm }: { lm: LandmarksModel }) {
  const { category_columns, volume, active_category } = lm;
  const [cellsOpen, setCellsOpen] = useState(true);
  const [imageOpen, setImageOpen] = useState(false);
  const contrastDomain = useRef(new Map<string, number>());
  const [channelCapHint, setChannelCapHint] = useState(false);
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
    },
    [displayChannels, lm],
  );

  if (!category_columns.length && !hasImage) {
    return (
      <FieldDescription className="px-0 pb-2">
        No layers yet. Load category columns or a volume image in the notebook.
      </FieldDescription>
    );
  }

  const multiImage = displayChannels.length > 1;
  const imageBody = (
    <GroupBody
      open={imageOpen}
      className="landmarks-layers-stack__nested landmarks-image-controls flex flex-col gap-1.5 pb-1"
    >
      {multiImage
        ? displayChannels.flatMap((ch, index) => [
            <ImageChannelRowControl
              key={`${ch.name}-row`}
              ch={ch}
              index={index}
              solo={ch.visible && visibleChannels.length === 1}
              onToggle={(next) => toggleChannel(ch.name, next)}
              onColor={(next) => lm.patchImageChannel(ch.name, { color: next })}
            />,
            ...imageSliderRows({
              ch,
              fallbackAlpha: imageAlpha,
              domain: contrastDomain.current,
              solo: false,
              lm,
            }),
          ])
        : displayChannels[0]
          ? imageSliderRows({
              ch: displayChannels[0],
              fallbackAlpha: imageAlpha,
              domain: contrastDomain.current,
              solo: true,
              lm,
            })
          : null}
      {multiImage && channelCapHint ? (
        <p key="channel-cap" className="m-0 text-[11px] text-foreground/80">
          At most {MAX_VISIBLE_CHANNELS} channels at once.
        </p>
      ) : null}
    </GroupBody>
  );

  return (
    <div className="landmarks-layers-stack flex flex-col gap-0.5">
      {category_columns.length ? (
        <div className="landmarks-layers-stack__row">
          <PanelRow
            className="landmarks-layer-row text-xs text-foreground"
            data-testid="layers-cells-row"
            lead={
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
                <GroupChevron open={cellsOpen}>
                  <ChevronRightIcon
                    className="landmarks-layer-icon landmarks-cat-chevron-icon size-[0.875rem] shrink-0 opacity-70"
                    aria-hidden
                  />
                </GroupChevron>
              </Button>
            }
            end={
              <Switch
                size="sm"
                className="shrink-0"
                checked={cellsVisible}
                aria-label={cellsVisible ? "Hide cells layer" : "Show cells layer"}
                data-testid="layer-toggle-cells"
                onCheckedChange={(next) => lm.setCellsVisible(next)}
              />
            }
          >
            <Button
              type="button"
              variant="ghost"
              className="landmarks-layers-image-trigger h-full min-h-0 min-w-0 justify-start px-0 text-xs font-normal text-foreground hover:bg-transparent"
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
          </PanelRow>
          <GroupBody
            open={cellsOpen}
            className="landmarks-layers-stack__nested flex flex-col gap-1.5 pb-1"
          >
            <TactSliderRow
              inline
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
              inline
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
          </GroupBody>
        </div>
      ) : null}

      {category_columns.length && hasImage ? (
        <div className="landmarks-panel-rule" data-panel-rule="" />
      ) : null}
      {hasImage ? (
        <div className="landmarks-layers-stack__row">
          <PanelRow
            className="landmarks-layer-row text-xs text-foreground"
            data-testid="layers-image-header"
            lead={
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
                <GroupChevron open={imageOpen}>
                  <ChevronRightIcon
                    className="landmarks-layer-icon landmarks-cat-chevron-icon size-[0.875rem] shrink-0 opacity-70"
                    aria-hidden
                  />
                </GroupChevron>
              </Button>
            }
            end={
              <Switch
                size="sm"
                className="shrink-0"
                checked={imageVisible}
                aria-label={imageVisible ? "Hide image layer" : "Show image layer"}
                data-testid="layer-toggle-image"
                onCheckedChange={(next) => lm.setImageVisible(next)}
              />
            }
          >
            <Button
              type="button"
              variant="ghost"
              className="landmarks-layers-image-trigger h-full min-h-0 min-w-0 justify-start px-0 text-xs font-normal text-foreground hover:bg-transparent"
              onClick={() => setImageOpen((v) => !v)}
            >
              <span className="landmarks-layer-label min-w-0 flex-1 truncate text-left">
                {imageHeaderLabel}
              </span>
            </Button>
          </PanelRow>
          {multiImage ? (
            <div
              className="landmarks-image-channel-list overflow-x-hidden"
              data-testid="layer-channel-list"
            >
              {imageBody}
            </div>
          ) : (
            imageBody
          )}
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
