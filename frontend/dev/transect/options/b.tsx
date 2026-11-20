import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { FLOAT_PANEL } from "@/widgets/landmarks/chrome/sections";

import { orderStops, profileBins, transectField } from "../geometry";
import { TransectMap } from "../TransectMap";
import type { Field, Scene } from "../types";
import type { OptionProps } from "./types";

function Profile({ scene, field }: { scene: Scene; field: Field }) {
  const bins = profileBins(scene.cells, field, 8);
  const maxN = Math.max(1, ...bins.map((bin) => bin.n));
  return (
    <div data-testid="transect-profile" className={cn(FLOAT_PANEL, "absolute inset-x-3 bottom-3 z-10")}>
      <div className="flex flex-col gap-1 px-3 py-2">
        <p className="tact-label">{scene.geneName} along the click path</p>
        <div className="flex h-12 items-end gap-1">
          {bins.map((bin) => (
            <div key={bin.t0} className="flex h-full flex-1 flex-col justify-end">
              {(["high", "mid", "low"] as const).map((band) => (
                <div
                  key={band}
                  style={{
                    height: `${(bin.bands[band] / maxN) * 100}%`,
                    background: band === "high" ? "#ff0099" : band === "mid" ? "#e36a9a" : "#f3e6d4",
                  }}
                />
              ))}
            </div>
          ))}
        </div>
        <p className="font-[family-name:var(--tact-mono)] text-[10px] leading-tight text-[var(--tact-muted)]">
          {scene.compositionNote}
        </p>
      </div>
    </div>
  );
}

export function OptionB({ scene }: OptionProps) {
  const [ids, setIds] = useState<string[]>([]);
  const [done, setDone] = useState(false);
  const ordered = useMemo(() => orderStops(scene.stops, ids), [scene.stops, ids]);
  const field = done && ordered.length >= 2 ? transectField(scene.cells, ordered) : null;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      if (event.key === "Enter") {
        event.preventDefault();
        if (ids.length >= 2) setDone(true);
      } else if (event.key === "Escape") {
        event.preventDefault();
        setIds([]);
        setDone(false);
      } else if (event.key === "Backspace" && !done) {
        event.preventDefault();
        setIds((prev) => prev.slice(0, -1));
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [done, ids]);

  return (
    <div data-testid="transect-option-b" data-count={ordered.length} data-done={done ? "yes" : "no"} className="relative h-full w-full">
      <TransectMap
        scene={scene}
        ordered={ordered}
        field={field}
        shade={field ? "both" : "off"}
        onPointer={(hit) => {
          const id = hit.stopId;
          if (done || !id || ids.includes(id)) return;
          setIds((prev) => [...prev, id]);
        }}
      />
      <div className={cn(FLOAT_PANEL, "absolute left-3 top-16 z-10 max-w-xs")}>
        <div className="flex items-center gap-3 px-3 py-2">
          <div>
            <p className="tact-label">Transect</p>
            <p className="font-[family-name:var(--tact-mono)] text-[10px] text-[var(--tact-muted)]">
              {done
                ? "Path set. mock straight-line."
                : "Click landmarks in order. Enter to finish. Esc to clear. mock straight-line."}
            </p>
          </div>
          {done ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              data-testid="transect-clear"
              className="rounded-none"
              onClick={() => {
                setIds([]);
                setDone(false);
              }}
            >
              Clear
            </Button>
          ) : null}
        </div>
      </div>
      {field ? <Profile scene={scene} field={field} /> : null}
    </div>
  );
}
