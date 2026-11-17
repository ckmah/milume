import { useCallback, useEffect, useId, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  ColorSelector,
  ColorSelectorItem,
  ColorSelectorList,
} from "@/components/ui/color-selector";
import { Input } from "@/components/ui/input";
import { SpringPopover, type PopoverBox } from "@/components/ui/spring-popover";
import { cn } from "@/lib/utils";
import { parseChannelHex } from "@/widgets/volume-cube/tint-palette";

import { useWidgetPortalContainer } from "./use-widget-portal";

/** Fluorescence colours. Saturated and separable on a black image. */
export const CHANNEL_COLOR_SWATCHES = [
  { value: "#ffffff", label: "White" },
  { value: "#3d7dff", label: "Blue" },
  { value: "#00d5ff", label: "Cyan" },
  { value: "#3ddc3d", label: "Green" },
  { value: "#ffd60a", label: "Yellow" },
  { value: "#ff8a00", label: "Orange" },
  { value: "#ff3b3b", label: "Red" },
  { value: "#ff3df0", label: "Magenta" },
] as const;

const GAP = 8;
const PAD = 8;

function placeBesideAnchor(
  anchor: DOMRect,
  panel: DOMRect,
  root: DOMRect,
  dock: DOMRect | null,
): PopoverBox {
  let left = (dock?.right ?? anchor.right) + GAP;
  let top = anchor.top;
  let origin = "left top";
  if (left + panel.width > root.right - PAD) {
    left = Math.min(anchor.left, (dock?.left ?? anchor.left));
    top = anchor.bottom + GAP;
    origin = "left top";
  }
  if (top + panel.height > root.bottom - PAD) {
    top = root.bottom - PAD - panel.height;
  }
  if (left + panel.width > root.right - PAD) {
    left = root.right - PAD - panel.width;
  }
  left = Math.max(root.left + PAD, left);
  top = Math.max(root.top + PAD, top);
  return { left, top, origin };
}

export function ChannelColorPicker({
  name,
  color,
  onColorChange,
  open: openProp,
  defaultOpen = false,
  onOpenChange,
}: {
  name: string;
  color: string;
  /** A hex writes that color. `null` clears it back to the channel default. */
  onColorChange: (next: string | null) => void;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [wrapRef, portalEl] = useWidgetPortalContainer();
  const anchorRef = useRef<HTMLButtonElement>(null);
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const open = openProp ?? uncontrolledOpen;
  const setOpen = useCallback(
    (next: boolean) => {
      if (openProp === undefined) setUncontrolledOpen(next);
      onOpenChange?.(next);
    },
    [onOpenChange, openProp],
  );
  const [draft, setDraft] = useState(color);
  const fieldId = useId();
  const swatchValue = CHANNEL_COLOR_SWATCHES.some((swatch) => swatch.value === color) ? color : "";
  const draftInvalid = draft.trim().length > 0 && parseChannelHex(draft) == null;

  useEffect(() => {
    setDraft(color);
  }, [color]);

  const place = useCallback((anchor: DOMRect, panel: DOMRect) => {
    const rootEl = anchorRef.current?.closest(".milume-widget");
    const dock = anchorRef.current?.closest(".landmarks__chrome-dock--left");
    const root =
      rootEl?.getBoundingClientRect() ??
      new DOMRect(0, 0, window.innerWidth, window.innerHeight);
    return placeBesideAnchor(anchor, panel, root, dock?.getBoundingClientRect() ?? null);
  }, []);

  const applyHex = (raw: string) => {
    setDraft(raw);
    const next = parseChannelHex(raw);
    if (next) onColorChange(next);
  };

  return (
    <div ref={wrapRef} className="contents">
      <Button
        ref={anchorRef}
        type="button"
        variant="ghost"
        size="icon-xs"
        className={cn(
          "landmarks-channel-color-dot rounded-full p-0",
          "hover:bg-[var(--lm-hit-hover-bg)] data-[state=open]:bg-[var(--lm-hit-hover-bg)]",
        )}
        data-testid={`channel-color-${name}`}
        data-state={open ? "open" : "closed"}
        aria-label={`Color for ${name}: ${color}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={(event) => {
          event.stopPropagation();
          setOpen(!open);
        }}
        onPointerDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") event.stopPropagation();
        }}
      >
        <span
          className="landmarks-layer-swatch pointer-events-none rounded-full"
          style={{ backgroundColor: color }}
          aria-hidden
        />
      </Button>
      <SpringPopover
        open={open}
        onOpenChange={setOpen}
        portal={portalEl}
        anchorRef={anchorRef}
        place={place}
        testId={`channel-color-picker-${name}`}
        className="landmarks-float landmarks-float--panel w-44 p-2.5"
      >
        <div className="flex items-center gap-2">
          <span
            className="landmarks-layer-swatch shrink-0 rounded-full"
            style={{ backgroundColor: color }}
            aria-hidden
          />
          <p className="m-0 min-w-0 flex-1 truncate text-xs font-medium leading-4">{name} color</p>
        </div>
        <ColorSelector
          className="mt-2"
          value={swatchValue}
          name={`${name}-color`}
          onValueChange={(next) => onColorChange(next)}
          onClick={(event) => {
            const target = event.target;
            if (target instanceof Element && target.closest("label")) setOpen(false);
          }}
        >
          <ColorSelectorList>
            {CHANNEL_COLOR_SWATCHES.map((swatch) => (
              <ColorSelectorItem
                key={swatch.value}
                value={swatch.value}
                color={swatch.value}
                label={swatch.label}
                data-testid={`channel-color-swatch-${swatch.label}`}
              />
            ))}
          </ColorSelectorList>
        </ColorSelector>
        <label className="mt-2 block text-[11px] text-muted-foreground" htmlFor={fieldId}>
          Hex
        </label>
        <Input
          id={fieldId}
          value={draft}
          spellCheck={false}
          aria-invalid={draftInvalid || undefined}
          data-testid={`channel-color-hex-${name}`}
          className="mt-1 h-7 px-2 font-mono text-xs tabular-nums"
          onChange={(event) => applyHex(event.target.value)}
          onKeyDown={(event) => event.stopPropagation()}
        />
        <Button
          type="button"
          variant="ghost"
          size="xs"
          className="mt-1 h-6 px-1 text-xs text-muted-foreground"
          onClick={() => onColorChange(null)}
        >
          Reset
        </Button>
      </SpringPopover>
    </div>
  );
}
