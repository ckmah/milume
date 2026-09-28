import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

export type ViewPreset = "top" | "iso" | "side";
export type RenderMode = "additive" | "mip";
export type Range = [number, number];

/**
 * A range slider that renders live while dragging and commits once on release.
 *
 * Dragging updates only the cube (local state); the synced trait, and every
 * notebook cell that reads it, changes once per gesture instead of per frame.
 */
export function RangeControl({
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
  const shown = [Math.round(value[0] - offset), Math.round(value[1] - offset)];
  return (
    <div className="grid grid-cols-[4.5rem_1fr_5.5rem] items-center gap-2">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Slider
        aria-label={label}
        className="h-2 [&_[data-slot=slider-range]]:bg-blue-500/70"
        min={min}
        max={max}
        step={step}
        value={value}
        minStepsBetweenThumbs={0}
        onValueChange={(v) => onLive([v[0]!, v[1]!])}
        onValueCommit={(v) => onCommit([v[0]!, v[1]!])}
      />
      <span className="text-right text-xs tabular-nums text-muted-foreground">
        {shown[0]}–{shown[1]} {unit}
      </span>
    </div>
  );
}

/** Local mirror of a synced range: follows the trait, lets a drag lead it. */
export function useLiveRange(trait: Range): [Range, (v: Range) => void] {
  const [live, setLive] = useState<Range>(trait);
  useEffect(() => setLive(trait), [trait[0], trait[1]]);
  return [live, setLive];
}

export function CubeControls({
  preset,
  onPreset,
  onReset,
  mode,
  onMode,
  labelsAvailable,
  showLabels,
  onShowLabels,
  cuts,
  contrast,
}: {
  preset: ViewPreset | null;
  onPreset: (p: ViewPreset) => void;
  onReset: () => void;
  mode: RenderMode;
  onMode: (m: RenderMode) => void;
  labelsAvailable: boolean;
  showLabels: boolean;
  onShowLabels: (on: boolean) => void;
  cuts: {
    x: { bounds: Range; value: Range; onLive: (v: Range) => void; onCommit: (v: Range) => void };
    y: { bounds: Range; value: Range; onLive: (v: Range) => void; onCommit: (v: Range) => void };
    z: { bounds: Range; value: Range; onLive: (v: Range) => void; onCommit: (v: Range) => void };
  };
  contrast: { max: number; value: Range; onLive: (v: Range) => void; onCommit: (v: Range) => void };
}) {
  return (
    <div className="mt-2 flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" size="sm" variant="outline" onClick={onReset}>
          Reset
        </Button>
        <ToggleGroup
          type="single"
          size="sm"
          variant="outline"
          aria-label="Camera"
          value={preset ?? ""}
          onValueChange={(v) => v && onPreset(v as ViewPreset)}
        >
          <ToggleGroupItem value="top" aria-label="Top view">
            Top
          </ToggleGroupItem>
          <ToggleGroupItem value="iso" aria-label="Oblique view">
            Iso
          </ToggleGroupItem>
          <ToggleGroupItem value="side" aria-label="Side view">
            Side
          </ToggleGroupItem>
        </ToggleGroup>
        <ToggleGroup
          type="single"
          size="sm"
          variant="outline"
          aria-label="Projection"
          value={mode}
          onValueChange={(v) => v && onMode(v as RenderMode)}
        >
          <ToggleGroupItem value="additive" aria-label="Additive">
            Additive
          </ToggleGroupItem>
          <ToggleGroupItem value="mip" aria-label="Maximum intensity">
            MIP
          </ToggleGroupItem>
        </ToggleGroup>
        <div className="flex items-center gap-2">
          <Switch
            id="volume-cube-labels"
            size="sm"
            checked={showLabels}
            disabled={!labelsAvailable}
            onCheckedChange={onShowLabels}
          />
          <Label htmlFor="volume-cube-labels">Labels</Label>
        </div>
      </div>
      <RangeControl
        label="X cut"
        unit="µm"
        min={cuts.x.bounds[0]}
        max={cuts.x.bounds[1]}
        step={1}
        value={cuts.x.value}
        offset={cuts.x.bounds[0]}
        onLive={cuts.x.onLive}
        onCommit={cuts.x.onCommit}
      />
      <RangeControl
        label="Y cut"
        unit="µm"
        min={cuts.y.bounds[0]}
        max={cuts.y.bounds[1]}
        step={1}
        value={cuts.y.value}
        offset={cuts.y.bounds[0]}
        onLive={cuts.y.onLive}
        onCommit={cuts.y.onCommit}
      />
      <RangeControl
        label="Z cut"
        unit="µm"
        min={cuts.z.bounds[0]}
        max={cuts.z.bounds[1]}
        step={1}
        value={cuts.z.value}
        onLive={cuts.z.onLive}
        onCommit={cuts.z.onCommit}
      />
      <RangeControl
        label="Contrast"
        unit=""
        min={0}
        max={contrast.max}
        step={1}
        value={contrast.value}
        onLive={contrast.onLive}
        onCommit={contrast.onCommit}
      />
    </div>
  );
}
