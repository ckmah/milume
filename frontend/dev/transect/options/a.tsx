import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { FLOAT_PANEL } from "@/widgets/landmarks/chrome/sections";

import { bandColor, orderStops, profileBins, transectField } from "../geometry";
import { TransectMap } from "../TransectMap";
import type { Field, Scene, Stop } from "../types";
import type { OptionProps } from "./types";

function stopTestId(id: string) {
  return id.replace("#", "-");
}

function moveId(ids: string[], id: string, dir: -1 | 1) {
  const index = ids.indexOf(id);
  const next = index + dir;
  if (index < 0 || next < 0 || next >= ids.length) return ids;
  const copy = ids.slice();
  const [item] = copy.splice(index, 1);
  if (!item) return ids;
  copy.splice(next, 0, item);
  return copy;
}

function Profile({ scene, field }: { scene: Scene; field: Field }) {
  const bins = profileBins(scene.cells, field, 8);
  const maxN = Math.max(1, ...bins.map((bin) => bin.n));
  const maxG = Math.max(1e-6, ...bins.map((bin) => bin.geneMean));
  const line = bins
    .map((bin, i) => {
      const x = ((i + 0.5) / bins.length) * 100;
      const y = 100 - (bin.geneMean / maxG) * 100;
      return `${x},${y}`;
    })
    .join(" ");
  return (
    <div
      data-testid="transect-profile"
      className={cn(FLOAT_PANEL, "absolute inset-x-3 bottom-3 z-10")}
    >
      <div className="flex flex-col gap-1 px-3 py-2">
        <p className="tact-label">{scene.geneName} along t</p>
        <div className="relative h-12">
          <div className="flex h-full items-end gap-1">
            {bins.map((bin) => (
              <div key={bin.t0} className="flex h-full flex-1 flex-col justify-end">
                {(["high", "mid", "low"] as const).map((band) => (
                  <div
                    key={band}
                    style={{
                      height: `${(bin.bands[band] / maxN) * 100}%`,
                      background: bandColor(band),
                    }}
                  />
                ))}
              </div>
            ))}
          </div>
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full">
            <polyline points={line} fill="none" stroke="#3d7dff" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
          </svg>
        </div>
        <p className="font-[family-name:var(--tact-mono)] text-[10px] leading-tight text-[var(--tact-muted)]">
          {scene.compositionNote}
        </p>
      </div>
    </div>
  );
}

function StopRow({
  stop,
  index,
  on,
  active,
  onToggle,
  onFocus,
  onUp,
  onDown,
}: {
  stop: Stop;
  index: number;
  on: boolean;
  active: boolean;
  onToggle: () => void;
  onFocus: () => void;
  onUp: () => void;
  onDown: () => void;
}) {
  const tid = stopTestId(stop.id);
  return (
    <div className={cn("flex items-center gap-1", active && "bg-[var(--tact-tone)]")}>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-pressed={on}
        data-testid={`include-${tid}`}
        className="h-7 flex-1 justify-start rounded-none px-1 font-[family-name:var(--tact-mono)] text-xs"
        onClick={() => {
          onToggle();
          onFocus();
        }}
      >
        <span className="inline-block w-4 text-[var(--tact-muted)]">{on ? index + 1 : ""}</span>
        {stop.label}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        aria-label={`Move ${stop.label} earlier`}
        data-testid={`up-${tid}`}
        disabled={!on}
        className="rounded-none"
        onClick={onUp}
      >
        ↑
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        aria-label={`Move ${stop.label} later`}
        data-testid={`down-${tid}`}
        disabled={!on}
        className="rounded-none"
        onClick={onDown}
      >
        ↓
      </Button>
    </div>
  );
}

export function OptionA({ scene }: OptionProps) {
  const [ids, setIds] = useState<string[]>([]);
  const [made, setMade] = useState(false);
  const [active, setActive] = useState<string | null>(null);
  const ordered = useMemo(() => orderStops(scene.stops, ids), [scene.stops, ids]);
  const field = made && ordered.length >= 2 ? transectField(scene.cells, ordered) : null;
  const indexOf = new Map(ordered.map((stop, index) => [stop.id, index]));

  return (
    <div data-testid="transect-option-a" className="relative h-full w-full">
      <TransectMap scene={scene} ordered={ordered} field={field} shade={field ? "both" : "off"} />
      <aside className={cn(FLOAT_PANEL, "absolute left-8 top-16 z-10 w-[calc(100%-2.5rem)] min-[700px]:top-14 min-[700px]:w-64")}>
        <div className="flex flex-col gap-2 p-3">
          <div>
            <p className="tact-label">Transect</p>
            <p className="font-[family-name:var(--tact-mono)] text-[10px] text-[var(--tact-muted)]">
              mock straight-line
            </p>
          </div>
          <div className="flex flex-col">
            {scene.stops.map((stop) => (
              <StopRow
                key={stop.id}
                stop={stop}
                index={indexOf.get(stop.id) ?? -1}
                on={indexOf.has(stop.id)}
                active={active === stop.id}
                onToggle={() =>
                  setIds((prev) => (prev.includes(stop.id) ? prev.filter((id) => id !== stop.id) : [...prev, stop.id]))
                }
                onFocus={() => setActive(stop.id)}
                onUp={() => setIds((prev) => moveId(prev, stop.id, -1))}
                onDown={() => setIds((prev) => moveId(prev, stop.id, 1))}
              />
            ))}
          </div>
          <Button
            type="button"
            size="sm"
            data-testid="transect-make"
            disabled={ordered.length < 2}
            className="rounded-none"
            onClick={() => setMade(true)}
          >
            Make transect
          </Button>
        </div>
      </aside>
      {field ? <Profile scene={scene} field={field} /> : null}
    </div>
  );
}
