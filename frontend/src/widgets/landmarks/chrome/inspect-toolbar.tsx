import { useId, useLayoutEffect, useState } from "react";
import {
  BoxIcon,
  ChevronDownIcon,
  CircleDot,
  HandIcon,
  ImageIcon,
  RotateCcwIcon,
  SquareSplitVerticalIcon,
  Tags,
} from "lucide-react";

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

import { ChromeLoadIndicator } from "./load-indicator";
import type { Range, ViewPreset } from "@/widgets/volume-cube/CubeControls";
import { PALETTES, type PaletteName, paletteLut } from "@/widgets/volume-cube/palettes";
import type { CubeCut } from "@/widgets/volume-cube/VolumeCube";

import type { CubeSettings, CubeSettingsPatch } from "../use-cube-settings";
import type { AdjustSection as Section } from "../use-inspect-cube";
import {
  CHIP_CLASS,
  TOOLBAR_CAPTION,
  TOOLBAR_CLASS,
  ToolbarDivider,
  ChromeTooltip,
  chromeHitTextClass,
  chromeHitWideClass,
  chromeMenuClass,
} from "./primitives";
import { IconBtn, ToolStack } from "./selection-toolbar";
import { SoftFloatCapsuleSlider, SoftFloatSliderRow } from "./soft-float-slider";
import { useWidgetPortal } from "./widget-portal-context";


const GAMMA_LOG2 = 2.32;

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

/** A section's Show switch, beside its title ("Show image", "Show labels"). */
type ShowSwitch = { checked: boolean; disabled?: boolean; onChange: (on: boolean) => void };

/**
 * One titled group of the Adjust panel, with a Reset for its sliders and, for
 * Image and Labels, a Show switch after the title. Reset leaves the switch be.
 */
function AdjustSection({
  title,
  show,
  onReset,
  testId,
  named = true,
  children,
}: {
  title: string;
  show?: ShowSwitch;
  onReset: () => void;
  testId?: string;
  /** False when the panel around it is already a region named `title`: one region, not two of the same name. */
  named?: boolean;
  children: React.ReactNode;
}) {
  const id = useId();
  return (
    <section aria-labelledby={named ? id : undefined} data-testid={testId}>
      <div className="landmarks-adjust__head">
        <div className="flex items-center gap-1.5">
          <h3 id={id} className={cn(TOOLBAR_CAPTION, "m-0")}>
            {title}
          </h3>
          {show ? (
            <Switch
              size="sm"
              aria-label={`Show ${title.toLowerCase()}`}
              checked={show.checked}
              disabled={show.disabled}
              onCheckedChange={show.onChange}
            />
          ) : null}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          aria-label={`Reset ${title.toLowerCase()}`}
          className={cn(chromeHitTextClass, "landmarks-adjust__reset")}
          onClick={onReset}
        >
          Reset
        </Button>
      </div>
      <div className="landmarks-slider-stack">{children}</div>
    </section>
  );
}

type Projection = CubeSettings["imageMode"];

/** A layer's Additive | MIP toggle, as a captioned row of its Adjust column. */
function ProjectionRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: Projection;
  onChange: (v: Projection) => void;
}) {
  return (
    <div className="landmarks-slider-row">
      <Label className="landmarks-slider-caption">Mode</Label>
      <ToggleGroup
        type="single"
        size="sm"
        spacing={1}
        aria-label={label}
        className="landmarks-adjust__control gap-0.5"
        value={value}
        onValueChange={(v) => v && onChange(v as Projection)}
      >
        <ToggleGroupItem value="additive" className={cn(chromeHitTextClass, "flex-1")}>
          Additive
        </ToggleGroupItem>
        <ToggleGroupItem value="mip" title="Maximum intensity projection" className={cn(chromeHitTextClass, "flex-1")}>
          MIP
        </ToggleGroupItem>
      </ToggleGroup>
    </div>
  );
}

const SLIDER_HIT =
  '.landmarks-slider-control, [data-slot="slider"], [data-slot="slider-thumb"], [data-slot="slider-track"]';

const LAYER_MENU_HIT =
  ".landmarks-layer-panel, [data-slot='dropdown-menu-content'], [data-testid^='layer-toggle-']";

/** Document listeners see the shadow host in a notebook. The real control is on composedPath. */
function pointerInLayerMenu(e: PointerEvent): boolean {
  const hit = (node: EventTarget | null) =>
    node instanceof Element && Boolean(node.closest(LAYER_MENU_HIT));
  const path = typeof e.composedPath === "function" ? e.composedPath() : [];
  return path.some(hit) || hit(e.target);
}

/** Layer visibility on left click; settings panel on right click (same stack as Cross-section). */
function LayerControl({
  testId,
  title,
  icon,
  active,
  disabled,
  open,
  onOpenChange,
  onToggle,
  panel,
}: {
  testId: string;
  title: string;
  icon: React.ReactNode;
  active: boolean;
  disabled?: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onToggle: () => void;
  panel: React.ReactNode;
}) {
  return (
    // A panel group: the engine's Esc handler finds the open trigger here and
    // clicks it, which closes only this menu (never the cube or Inspect).
    <span data-inspect-panel-group="" className="contents">
    <ToolStack open={open} align="start" panel={panel}>
      <ChromeTooltip label={`${title} · right-click for settings`}>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          data-testid={testId}
          disabled={disabled}
          className={cn(chromeHitWideClass, "gap-1 px-2")}
          aria-label={`${title}. Right-click for settings menu.`}
          aria-pressed={active}
          aria-expanded={open}
          aria-haspopup="dialog"
          onPointerDown={(e) => {
            if (e.button !== 0) return;
            e.preventDefault();
            if (!disabled) onToggle();
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (!disabled) onOpenChange(!open);
          }}
          onClick={(e) => {
            // Pointer clicks toggle the layer on pointerdown. A click with no
            // pointer (the engine's Esc, or the keyboard) closes an open menu.
            if (e.detail === 0 && open) onOpenChange(false);
          }}
        >
          {icon}
          <span className="text-xs font-medium">{title}</span>
          <ChevronDownIcon aria-hidden className="size-2.5 shrink-0 opacity-70" />
        </Button>
      </ChromeTooltip>
    </ToolStack>
    </span>
  );
}

/**
 * Context bar while Inspect has a cube open: camera, Move, Reset view, and
 * Image / Labels / Points toggles. Right-click a layer for its settings menu.
 */
export function InspectToolbar({
  settings,
  patch,
  labelsAvailable,
  pointsAvailable,
  cut,
  cutRanges,
  onCutLive,
  onCutCommit,
  onReset,
}: {
  settings: CubeSettings;
  patch: (p: CubeSettingsPatch) => void;
  labelsAvailable: boolean;
  pointsAvailable: boolean;
  cut: CubeCut;
  cutRanges: { x: Range; y: Range; z: Range } | null;
  onCutLive: (cut: CubeCut) => void;
  onCutCommit: (cut: CubeCut) => void;
  onReset: (section: Section | "all") => void;
}) {
  const [crossOpen, setCrossOpen] = useState(false);
  const [imageOpen, setImageOpen] = useState(false);
  const [labelsOpen, setLabelsOpen] = useState(false);
  const [pointsOpen, setPointsOpen] = useState(false);
  const [tuning, setTuning] = useState(false);
  // Layout, not a passive effect: the listener has to be on window before this
  // gesture's pointerup, and a click can end in the same frame.
  useLayoutEffect(() => {
    if (!tuning) return;
    // Capture moving onto the thumb while the button is still down is not a release.
    const end = (event: Event) => {
      if (event.type === "lostpointercapture" && (event as PointerEvent).buttons !== 0) return;
      setTuning(false);
    };
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    window.addEventListener("lostpointercapture", end);
    return () => {
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      window.removeEventListener("lostpointercapture", end);
    };
  }, [tuning]);
  const layerMenuOpen = imageOpen || labelsOpen || pointsOpen;
  useLayoutEffect(() => {
    if (!layerMenuOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (pointerInLayerMenu(e)) return;
      setImageOpen(false);
      setLabelsOpen(false);
      setPointsOpen(false);
      setTuning(false);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [layerMenuOpen]);
  const menuContainer = useWidgetPortal();
  const [heldContrastMax, setHeldContrastMax] = useState<number | null>(null);
  const { bounds, render } = settings;

  const onPanelPointerDownCapture = (e: React.PointerEvent) => {
    const target = e.target;
    if (!(target instanceof Element) || !target.closest(SLIDER_HIT)) return;
    setTuning(true);
  };

  const closeInspectPanels = () => {
    setCrossOpen(false);
    setImageOpen(false);
    setLabelsOpen(false);
    setPointsOpen(false);
    setTuning(false);
  };

  const openLayerPanel = (layer: "image" | "labels" | "points", open: boolean) => {
    if (!open) {
      if (layer === "image") setImageOpen(false);
      if (layer === "labels") setLabelsOpen(false);
      if (layer === "points") setPointsOpen(false);
      return;
    }
    setCrossOpen(false);
    setImageOpen(layer === "image");
    setLabelsOpen(layer === "labels");
    setPointsOpen(layer === "points");
  };

  const layerPanel = (title: string, body: React.ReactNode) => (
    <div
      className="landmarks-adjust landmarks-layer-panel"
      data-inspect-panel-group=""
      data-tuning={tuning ? "true" : undefined}
      role="region"
      aria-label={title}
      onPointerDownCapture={onPanelPointerDownCapture}
    >
      {body}
    </div>
  );

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

  const crossPanel = (
    <div
      className="landmarks-adjust landmarks-cross"
      data-testid="context-cube-cross"
      data-tuning={tuning ? "true" : undefined}
      role="region"
      aria-label="Cross-section"
      onPointerDownCapture={onPanelPointerDownCapture}
    >
      <AdjustSection title="Cross-section" testId="context-cube-cuts" named={false} onReset={() => onReset("cuts")}>
        {cutRanges ? (
          <>
            {cutRow(0, "X cut", cutRanges.x, true)}
            {cutRow(1, "Y cut", cutRanges.y, true)}
            {cutRow(2, "Z cut", cutRanges.z, false)}
          </>
        ) : (
          <ChromeLoadIndicator
            testId="inspect-cross-load"
            phase="loading"
            message="Loading volume…"
            className="py-1"
          />
        )}
      </AdjustSection>
    </div>
  );

  const closePanelsOnEsc = (e: React.KeyboardEvent) => {
    if (e.key !== "Escape") return;
    if (!crossOpen && !imageOpen && !labelsOpen && !pointsOpen) return;
    if ((e.target as Element | null)?.closest?.("[data-slot='dropdown-menu-content']")) return;
    closeInspectPanels();
  };

  const contrastMax =
    heldContrastMax ?? bounds?.contrastMax ?? Math.max(255, Math.ceil(settings.contrast[1] * 4));
  const gammaLog2 = Math.log2(render.imageGamma);

  const imageMenu = (
    <AdjustSection title="Image" testId="adjust-image" onReset={() => onReset("image")}>
      <ProjectionRow
        label="Image projection"
        value={settings.imageMode}
        onChange={(imageMode) => patch({ imageMode })}
      />
      <div className="landmarks-slider-row">
        <Label className="landmarks-slider-caption">Palette</Label>
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label="Palette"
              className={cn(chromeHitWideClass, "landmarks-adjust__control justify-start gap-2")}
            >
              <PaletteSwatch name={render.palette} />
              <span className="flex-1 truncate text-left text-xs">{render.palette}</span>
              <ChevronDownIcon aria-hidden className="size-2.5 shrink-0 opacity-70" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            side="top"
            align="start"
            sideOffset={4}
            container={menuContainer}
            collisionBoundary={menuContainer ? [menuContainer] : undefined}
            collisionPadding={12}
            className={chromeMenuClass}
            onCloseAutoFocus={(e) => e.preventDefault()}
            onInteractOutside={(e) => {
              if ((e.target as Element | null)?.closest?.(".landmarks-layer-panel")) e.preventDefault();
            }}
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
      </div>
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
    </AdjustSection>
  );

  const labelsMenu = (
    <AdjustSection title="Labels" testId="adjust-labels" onReset={() => onReset("labels")}>
      <ProjectionRow
        label="Labels projection"
        value={settings.labelMode}
        onChange={(labelMode) => patch({ labelMode })}
      />
      <SoftFloatCapsuleSlider
        aria-label="Label alpha"
        caption="Alpha"
        min={0}
        max={1}
        step={0.05}
        value={render.cellAlpha}
        displayValue={render.cellAlpha.toFixed(2)}
        onValueChange={(v) => patch({ render: { cellAlpha: v } })}
      />
    </AdjustSection>
  );

  const pointsMenu = (
    <AdjustSection title="Points" testId="adjust-points" onReset={() => onReset("points")}>
      <p className={cn(TOOLBAR_CAPTION, "m-0 py-1")}>
        {pointsAvailable
          ? "Cell centres from the map layer."
          : "Switch the map to points to show scatter in the cube."}
      </p>
    </AdjustSection>
  );

  return (
    <TooltipProvider delayDuration={80} skipDelayDuration={0}>
      <div
        className="landmarks__chrome-context"
        data-testid="context-inspect-toolbar"
        data-placement="dock"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        onWheel={(e) => e.stopPropagation()}
        onKeyDown={closePanelsOnEsc}
      >
        <div className={TOOLBAR_CLASS} data-testid="context-toolbar-l1">
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
          {/* Pans the window with a plain drag in the cube (Shift+drag pans without it). */}
          <IconBtn
            title="Move"
            active={settings.move}
            disabled={!settings.open}
            onClick={() => patch({ move: !settings.move })}
          >
            <HandIcon className="size-4" />
          </IconBtn>
          <IconBtn title="Reset view" onClick={() => patch({ resetTick: settings.resetTick + 1 })}>
            <RotateCcwIcon className="size-4" />
          </IconBtn>
          <ToolbarDivider />
          <LayerControl
            testId="layer-toggle-image"
            title="Image"
            icon={<ImageIcon className="size-4" />}
            active={settings.showImage}
            open={imageOpen}
            onOpenChange={(open) => openLayerPanel("image", open)}
            onToggle={() => patch({ showImage: !settings.showImage })}
            panel={layerPanel("Image", imageMenu)}
          />
          <LayerControl
            testId="layer-toggle-labels"
            title="Labels"
            icon={<Tags className="size-4" />}
            active={settings.showLabels}
            disabled={!labelsAvailable}
            open={labelsOpen}
            onOpenChange={(open) => openLayerPanel("labels", open)}
            onToggle={() => patch({ showLabels: !settings.showLabels })}
            panel={layerPanel("Labels", labelsMenu)}
          />
          <LayerControl
            testId="layer-toggle-points"
            title="Points"
            icon={<CircleDot className="size-4" />}
            active={settings.showPoints}
            disabled={!pointsAvailable}
            open={pointsOpen}
            onOpenChange={(open) => openLayerPanel("points", open)}
            onToggle={() => patch({ showPoints: !settings.showPoints })}
            panel={layerPanel("Points", pointsMenu)}
          />
          <span data-inspect-panel-group="" className="contents">
            <ToolStack open={crossOpen} align="end" panel={crossPanel}>
              <IconBtn
                title="Cross-section"
                testId="context-cross-toggle"
                active={crossOpen}
                expandable
                ariaExpanded={crossOpen}
                ariaHasPopup="dialog"
                onClick={() => {
                  if (crossOpen) {
                    setCrossOpen(false);
                    setTuning(false);
                    return;
                  }
                  setImageOpen(false);
                  setLabelsOpen(false);
                  setPointsOpen(false);
                  setCrossOpen(true);
                  setTuning(false);
                }}
              >
                <SquareSplitVerticalIcon className="size-4" />
              </IconBtn>
            </ToolStack>
          </span>
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
