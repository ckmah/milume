import { useMemo, useState } from "react";

import { cn } from "@/lib/utils";
import { FLOAT_PANEL } from "@/widgets/landmarks/chrome/sections";

import { orderLandmarks, pseudospaceField } from "../geometry";
import { PseudospaceMap } from "../PseudospaceMap";
import type { OptionProps } from "./types";
import { Profile } from "./profile";

const ORDER = ["harness-shape", "harness-spline"];

export function OptionC({ scene }: OptionProps) {
  const ordered = useMemo(() => orderLandmarks(scene.landmarks, ORDER), [scene.landmarks]);
  const field = useMemo(() => pseudospaceField(scene.cells, ordered), [scene.cells, ordered]);
  const [cellIndex, setCellIndex] = useState<number | null>(null);
  const pos = cellIndex == null ? null : field?.byIndex[cellIndex];
  const cell = cellIndex == null ? null : scene.cells[cellIndex];

  return (
    <div data-testid="pseudospace-option-c" className="relative h-full w-full">
      <PseudospaceMap
        scene={scene}
        ordered={ordered}
        field={field}
        shade="both"
        probeCell={cellIndex}
        onHover={(hit) => {
          if (hit.cellIndex != null) setCellIndex(hit.cellIndex);
        }}
      />
      <aside data-testid="pseudospace-readout" className={cn(FLOAT_PANEL, "absolute right-3 top-16 z-10 w-64")}>
        <p className="tact-label px-3 pt-3">Probe</p>
        <p className="px-3 font-[family-name:var(--tact-mono)] text-[10px] text-[var(--tact-muted)]">knn graph</p>
        {pos && cell ? (
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 px-3 py-3 font-[family-name:var(--tact-mono)] text-[11px]">
            <dt>pseudospace</dt>
            <dd className="text-right">{pos.value.toFixed(2)}</dd>
            <dt>pair</dt>
            <dd className="text-right">{pos.pair + 1}</dd>
            {ordered.map((landmark, i) => (
              <span key={landmark.id} className="contents">
                <dt>d {landmark.label}</dt>
                <dd className="text-right">{(pos.distances[i] ?? 0).toFixed(1)} µm</dd>
              </span>
            ))}
            <dt>{scene.geneName}</dt>
            <dd className="text-right">{cell.gene.toFixed(2)}</dd>
          </dl>
        ) : (
          <p className="px-3 py-3 text-xs text-[var(--tact-muted)]">Hover a cell.</p>
        )}
        <p className="px-3 pb-3 font-[family-name:var(--tact-mono)] text-[10px] text-[var(--tact-muted)]">
          {ordered.map((landmark) => landmark.label).join(" → ")}. {scene.compositionNote}
        </p>
      </aside>
      {field ? <Profile scene={scene} field={field} /> : null}
    </div>
  );
}
