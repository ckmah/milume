import { useLayoutEffect, useMemo, useState } from "react";

import { cn } from "@/lib/utils";
import { FLOAT_PANEL } from "@/widgets/landmarks/chrome/sections";
import { setPseudospaceSlot } from "@/widgets/landmarks/chrome/pseudospace-slot";

import { orderLandmarks, pseudospaceField } from "../geometry";
import { PseudospaceMap } from "../PseudospaceMap";
import { LandmarkOrder, SparkleButton } from "./landmark-order";
import type { OptionProps } from "./types";

export function PseudospaceView({ scene }: OptionProps) {
  const [ids, setIds] = useState<string[]>([]);
  const [grouping, setGrouping] = useState(false);
  const [hover, setHover] = useState<number | null>(null);
  const ordered = useMemo(() => orderLandmarks(scene.landmarks, ids), [scene.landmarks, ids]);
  const field = grouping && ordered.length >= 2 ? pseudospaceField(scene.cells, ordered) : null;
  const pos = hover == null ? null : field?.byIndex[hover];
  const cell = hover == null ? null : scene.cells[hover];

  useLayoutEffect(() => {
    setPseudospaceSlot({
      count: scene.landmarks.length,
      action: <SparkleButton pressed={grouping} onToggle={() => setGrouping((on) => !on)} />,
      body: <LandmarkOrder scene={scene} grouping={grouping} ids={ids} onIds={setIds} />,
    });
  }, [scene, grouping, ids]);

  useLayoutEffect(() => () => setPseudospaceSlot(null), []);

  return (
    <div data-testid="pseudospace-option-a" className="relative h-full w-full">
      <PseudospaceMap
        scene={scene}
        ordered={ordered}
        field={field}
        probeCell={hover}
        onHover={(hit) => {
          if (hit.cellIndex != null) setHover(hit.cellIndex);
        }}
      />
      {field && pos && cell ? (
        <aside data-testid="pseudospace-readout" className={cn(FLOAT_PANEL, "absolute right-3 top-16 z-10 w-56")}>
          <p className="tact-label px-3 pt-3">Probe</p>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 px-3 py-2 font-[family-name:var(--tact-mono)] text-[11px]">
            <dt>pseudospace</dt>
            <dd className="text-right">{pos.value.toFixed(2)}</dd>
            {ordered.map((landmark, i) => (
              <span key={landmark.id} className="contents">
                <dt>d {landmark.label}</dt>
                <dd className="text-right">{(pos.distances[i] ?? 0).toFixed(1)}</dd>
              </span>
            ))}
          </dl>
        </aside>
      ) : null}
    </div>
  );
}
