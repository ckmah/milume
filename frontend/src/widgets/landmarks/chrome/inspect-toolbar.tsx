import { useId, useState } from "react";
import { BoxIcon, ChevronDownIcon, CircleDotIcon, RotateCcwIcon, ScissorsIcon, SunMediumIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { Range, ViewPreset } from "@/widgets/volume-cube/CubeControls";
import { PALETTES, type PaletteName, paletteLut } from "@/widgets/volume-cube/palettes";
import type { CubeCut } from "@/widgets/volume-cube/VolumeCube";

import type { CubeSettings, CubeSettingsPatch } from "../use-cube-settings";
import {
  CHIP_CLASS,
  ChromeTooltip,
  TOOLBAR_CAPTION,
  TOOLBAR_CLASS,
  ToolbarDivider,
  chromeHitTextClass,
  chromeHitWideClass,
  chromeMenuClass,
} from "./primitives";
import { IconBtn, ToolStack } from "./selection-toolbar";
import { SoftFloatCapsuleSlider, SoftFloatSliderRow } from "./soft-float-slider";


const GAMMA_LOG2 = 2.32;

type Panel = "cuts" | "image" | "cells";

function gradientCss(name: PaletteName): string {
  const { data } = paletteLut(name);
  const stops = Array.from({ length: 9 }, (_, i) => {
    const k = Math.round((i / 8) * 255) * 4;
    return `rgb(${data[k]} ${data[k + 1]} ${data[k + 2]})`;
  });
  return `linear-gradient(90deg, ${stops.join(", ")})`;
}

function PaletteSwatch({ name }: { name: PaletteName }) {
  return (
    <span
      aria-hidden
      className={cn(CHIP_CLASS, "h-2.5 w-8 shrink-0 rounded-full")}
      style={{ backgroundImage: gradientCss(name) }}
    />
  );
}

/**
 * A range row (cuts, contrast) on the shared Soft Float slider: renders live
 * while dragging (`onLive`) and commits once on release (`onCommit`), so the
 * synced trait changes once per gesture. Thumbs are "<label>, minimum/maximum".
 */
function RangeRow({
  label,
  unit,
  min,
  max,
  step,
  value,
  offset = 0,
  onLive,
  onCommit,
}: {
  label: string;
  unit: string;
  min: number;
  max: number;
  step: number;
  value: Range;
  /** Shown values are value - offset (e.g. µm from the window edge). */
  offset?: number;
  onLive: (v: Range) => void;
  onCommit: (v: Range) => void;
}) {
  const lo = Math.round(value[0] - offset);
  const hi = Math.round(value[1] - offset);
  return (
    <SoftFloatSliderRow
      caption={label}
      aria-label={label}
      min={min}
      max={max}
      step={step}
      value={value}
      readout={`${lo}–${hi}${unit ? ` ${unit}` : ""}`}
      onValueChange={(v) => onLive([v[0]!, v[1]!])}
      onValueCommit={(v) => onCommit([v[0]!, v[1]!])}
    />
  );
}

/**
 * Context bar while Inspect has a cube open: camera, projection, palette,
 * labels, then Cuts / Image / Cells panels that rise above their buttons.
 * Cuts render live and commit `volume_cut` on release (`onCutCommit`).
 */
export function InspectToolbar({
  settings,
  patch,
  labelsAvailable,
  cut,
  cutRanges,
  onCutLive,
  onCutCommit,
}: {
  settings: CubeSettings;
  patch: (p: CubeSettingsPatch) => void;
  labelsAvailable: boolean;
  /** The cut as shown, inside the window (absolute µm). */
  cut: CubeCut;
  /** Clamped window X/Y and the stack's Z; null until the volume is open. */
  cutRanges: { x: Range; y: Range; z: Range } | null;
  onCutLive: (cut: CubeCut) => void;
  onCutCommit: (cut: CubeCut) => void;
}) {
  const labelsId = useId();
  const [panel, setPanel] = useState<Panel | null>(null);
  const [menuContainer, setMenuContainer] = useState<HTMLElement | null>(null);
  // The cube sizes the contrast range from the contrast it draws; hold the max
  // from pointer down to commit so it cannot run away under the dragged thumb.
  const [heldContrastMax, setHeldContrastMax] = useState<number | null>(null);
  const { bounds, render } = settings;
  const toggle = (p: Panel) => setPanel((cur) => (cur === p ? null : p));

  const withAxis = (axis: 0 | 1 | 2, v: Range): CubeCut => {
    const next = [...cut] as CubeCut;
    next[axis * 2] = v[0];
    next[axis * 2 + 1] = v[1];
    return next;
  };
  const cutRow = (axis: 0 | 1 | 2, label: string, range: Range, fromEdge: boolean) => (
    <RangeRow
      label={label}
      unit="µm"
      min={range[0]}
      max={range[1]}
      step={1}
      value={[cut[axis * 2]!, cut[axis * 2 + 1]!]}
      offset={fromEdge ? range[0] : 0}
      onLive={(v) => onCutLive(withAxis(axis, v))}
      onCommit={(v) => onCutCommit(withAxis(axis, v))}
    />
  );

  const contrastMax =
    heldContrastMax ?? bounds?.contrastMax ?? Math.max(255, Math.ceil(settings.contrast[1] * 4));
  const gammaLog2 = Math.log2(render.imageGamma);

  return (
    <TooltipProvider delayDuration={80} skipDelayDuration={0}>
      <div
        className="landmarks__chrome-context"
        data-testid="context-inspect-toolbar"
        data-placement="dock"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        onWheel={(e) => e.stopPropagation()}
      >
        <div
          ref={(node) => setMenuContainer(node?.closest(".spatial-rx-widget, .landmarks") as HTMLElement | null)}
          className={TOOLBAR_CLASS}
          data-testid="context-toolbar-l1"
        >
          <ToggleGroup
            type="single"
            size="sm"
            spacing={1}
            aria-label="Camera"
            className="gap-0.5"
            value={settings.preset ?? ""}
            onValueChange={(v) => v && patch({ preset: v as ViewPreset })}
          >
            <ToggleGroupItem value="top" aria-label="Top view" className={chromeHitTextClass}>
              Top
            </ToggleGroupItem>
            <ToggleGroupItem value="iso" aria-label="Oblique view" className={chromeHitTextClass}>
              Iso
            </ToggleGroupItem>
            <ToggleGroupItem value="side" aria-label="Side view" className={chromeHitTextClass}>
              Side
            </ToggleGroupItem>
          </ToggleGroup>
          <ToolbarDivider />
          <ToggleGroup
            type="single"
            size="sm"
            spacing={1}
            aria-label="Projection"
            className="gap-0.5"
            value={settings.mode}
            onValueChange={(v) => v && patch({ mode: v as CubeSettings["mode"] })}
          >
            <ToggleGroupItem value="additive" aria-label="Additive" className={chromeHitTextClass}>
              Additive
            </ToggleGroupItem>
            <ToggleGroupItem value="mip" aria-label="Maximum intensity" className={chromeHitTextClass}>
              MIP
            </ToggleGroupItem>
          </ToggleGroup>
          <ToolbarDivider />
          <DropdownMenu>
            <ChromeTooltip label="Palette">
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Palette"
                  className={chromeHitWideClass}
                >
                  <PaletteSwatch name={render.palette} />
                  <ChevronDownIcon aria-hidden className="size-2.5 shrink-0 opacity-70" />
                </Button>
              </DropdownMenuTrigger>
            </ChromeTooltip>
            <DropdownMenuContent
              side="top"
              align="center"
              sideOffset={8}
              container={menuContainer}
              className={chromeMenuClass}
              onCloseAutoFocus={(e) => e.preventDefault()}
            >
              <DropdownMenuRadioGroup
                value={render.palette}
                onValueChange={(v) => patch({ render: { palette: v as PaletteName } })}
              >
                {PALETTES.map((name) => (
                  <DropdownMenuRadioItem key={name} value={name} className="gap-2 py-1 text-xs">
                    <PaletteSwatch name={name} />
                    {name}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          <div className="flex items-center gap-1.5 px-1.5">
            <Switch
              id={labelsId}
              size="sm"
              aria-label="Labels"
              checked={settings.showLabels}
              disabled={!labelsAvailable}
              onCheckedChange={(on) => patch({ showLabels: on })}
            />
            <Label htmlFor={labelsId} className={TOOLBAR_CAPTION}>
              Labels
            </Label>
          </div>
          <ToolbarDivider />
          <ToolStack
            open={panel === "cuts"}
            panel={
              <div className="landmarks-slider-stack w-80" data-testid="context-cube-cuts">
                {cutRanges ? (
                  <>
                    {cutRow(0, "X cut", cutRanges.x, true)}
                    {cutRow(1, "Y cut", cutRanges.y, true)}
                    {cutRow(2, "Z cut", cutRanges.z, false)}
                  </>
                ) : (
                  <p className={cn(TOOLBAR_CAPTION, "m-0 py-1")}>Loading volume…</p>
                )}
              </div>
            }
          >
            <IconBtn title="Cuts" active={panel === "cuts"} expandable onClick={() => toggle("cuts")}>
              <ScissorsIcon className="size-4" />
            </IconBtn>
          </ToolStack>
          <ToolStack
            open={panel === "image"}
            panel={
              <div className="landmarks-slider-stack w-80" data-testid="context-cube-image">
                <div
                  onPointerDownCapture={() => setHeldContrastMax(contrastMax)}
                  onLostPointerCapture={() => setHeldContrastMax(null)}
                >
                  <RangeRow
                    label="Contrast"
                    unit=""
                    min={0}
                    max={contrastMax}
                    step={1}
                    value={settings.contrast}
                    onLive={(v) => patch({ contrast: v })}
                    onCommit={(v) => {
                      patch({ contrast: v });
                      setHeldContrastMax(null);
                    }}
                  />
                </div>
                <SoftFloatCapsuleSlider
                  aria-label="Image alpha"
                  caption="Alpha"
                  min={0}
                  max={1}
                  step={0.05}
                  value={render.imageAlpha}
                  displayValue={render.imageAlpha.toFixed(2)}
                  onValueChange={(v) => patch({ render: { imageAlpha: v } })}
                />
                <SoftFloatCapsuleSlider
                  aria-label="Image gamma"
                  caption="Gamma"
                  min={-GAMMA_LOG2}
                  max={GAMMA_LOG2}
                  step={0.05}
                  value={gammaLog2}
                  displayValue={(2 ** gammaLog2).toFixed(2)}
                  onValueChange={(v) => patch({ render: { imageGamma: 2 ** v } })}
                />
              </div>
            }
          >
            <IconBtn title="Image" active={panel === "image"} expandable onClick={() => toggle("image")}>
              <SunMediumIcon className="size-4" />
            </IconBtn>
          </ToolStack>
          <ToolStack
            open={panel === "cells"}
            panel={
              <div className="landmarks-slider-stack w-80" data-testid="context-cube-cells">
                <SoftFloatCapsuleSlider
                  aria-label="Cell alpha"
                  caption="Alpha"
                  min={0}
                  max={1}
                  step={0.05}
                  value={render.cellAlpha}
                  displayValue={render.cellAlpha.toFixed(2)}
                  onValueChange={(v) => patch({ render: { cellAlpha: v } })}
                />
              </div>
            }
          >
            <IconBtn title="Cells" active={panel === "cells"} expandable onClick={() => toggle("cells")}>
              <CircleDotIcon className="size-4" />
            </IconBtn>
          </ToolStack>
          <ToolbarDivider />
          <IconBtn title="Reset view" onClick={() => patch({ resetTick: settings.resetTick + 1 })}>
            <RotateCcwIcon className="size-4" />
          </IconBtn>
        </div>
      </div>
    </TooltipProvider>
  );
}

/** Inspect without a 3D image: the square still places, there is no cube. */
export function InspectNoVolumePill() {
  return (
    <div className="landmarks__chrome-context" data-testid="context-inspect-no-volume">
      <div className={cn(TOOLBAR_CLASS, TOOLBAR_CAPTION, "landmarks-toolbar--text")}>
        <BoxIcon aria-hidden className="size-3.5" />
        No 3D image: build the widget from a SpatialData with a 3D image
      </div>
    </div>
  );
}
