import { useMemo, useState } from "react";

import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import { FLOAT_PANEL } from "@/widgets/landmarks/chrome/sections";

import { orderStops, transectField } from "../geometry";
import { TransectMap } from "../TransectMap";
import type { Band, Field, Scene } from "../types";
import type { OptionProps } from "./types";

const WINDOW = 0.2;

function nearest(scene: Scene, field: Field, t: number) {
  let best = Infinity;
  let offset = 0;
  const bands: Record<Band, number> = { low: 0, mid: 0, high: 0 };
  let gene = 0;
  let n = 0;
  for (const cell of scene.cells) {
    const pos = field.byIndex[cell.index];
    if (!pos) continue;
    const distance = Math.abs(pos.t - t);
    if (distance < best) {
      best = distance;
      offset = pos.offset;
    }
    if (distance <= WINDOW) {
      bands[cell.band] += 1;
      gene += cell.gene;
      n += 1;
    }
  }
  return { offset, bands, geneMean: n ? gene / n : 0, n };
}

function fmt(value: number) {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}`;
}

export function OptionC({ scene }: OptionProps) {
  const ordered = useMemo(() => orderStops(scene.stops, scene.stops.map((stop) => stop.id)), [scene.stops]);
  const field = useMemo(() => transectField(scene.cells, ordered), [scene.cells, ordered]);
  const [probeT, setProbeT] = useState(() => (field ? field.tMax * 0.25 : 0));
  if (!field) {
    return <div data-testid="transect-option-c" className="relative h-full w-full" />;
  }
  const local = nearest(scene, field, probeT);
  const orderLabel = ordered.map((stop) => stop.label).join(", ");

  return (
    <div data-testid="transect-option-c" className="relative h-full w-full">
      <TransectMap
        scene={scene}
        ordered={ordered}
        field={field}
        shade="ramp"
        probeT={probeT}
        onPointer={(hit) => {
          if (hit.t != null) setProbeT(hit.t);
        }}
      />
      <aside data-testid="transect-readout" className={cn(FLOAT_PANEL, "absolute right-3 top-16 z-10 w-64")}>
        <div className="flex flex-col gap-2 p-3">
          <div>
            <p className="tact-label">Probe on path</p>
            <p className="font-[family-name:var(--tact-mono)] text-[10px] text-[var(--tact-muted)]">{orderLabel}</p>
          </div>
          <dl className="grid grid-cols-[4.5rem_1fr] gap-y-1 font-[family-name:var(--tact-mono)] text-xs text-[var(--tact-ink)]">
            <dt className="text-[var(--tact-muted)]">t</dt>
            <dd>{probeT.toFixed(2)}</dd>
            <dt className="text-[var(--tact-muted)]">side</dt>
            <dd>{fmt(local.offset)} µm</dd>
            <dt className="text-[var(--tact-muted)]">{scene.geneName}</dt>
            <dd>{local.n ? local.geneMean.toFixed(2) : "no cells"}</dd>
            <dt className="text-[var(--tact-muted)]">bands</dt>
            <dd>
              {local.n
                ? `low ${local.bands.low}  mid ${local.bands.mid}  high ${local.bands.high}`
                : "no cells in range"}
            </dd>
          </dl>
          <Slider
            aria-label="Position along transect"
            min={0}
            max={field.tMax}
            step={field.tMax / 40}
            value={[probeT]}
            onValueChange={(value) => setProbeT(value[0] ?? 0)}
          />
          <p className="font-[family-name:var(--tact-mono)] text-[10px] text-[var(--tact-muted)]">
            mock straight-line. {scene.compositionNote}
          </p>
        </div>
      </aside>
    </div>
  );
}
