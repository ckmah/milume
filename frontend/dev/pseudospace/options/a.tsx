import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { FLOAT_PANEL } from "@/widgets/landmarks/chrome/sections";

import { orderLandmarks, pseudospaceField } from "../geometry";
import { PseudospaceMap } from "../PseudospaceMap";
import type { OptionProps } from "./types";
import { Profile } from "./profile";

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

export function OptionA({ scene }: OptionProps) {
  const [ids, setIds] = useState<string[]>([]);
  const [made, setMade] = useState(false);
  const ordered = useMemo(() => orderLandmarks(scene.landmarks, ids), [scene.landmarks, ids]);
  const field = made && ordered.length >= 2 ? pseudospaceField(scene.cells, ordered) : null;

  return (
    <div data-testid="pseudospace-option-a" className="relative h-full w-full">
      <PseudospaceMap scene={scene} ordered={ordered} field={field} shade={field ? "both" : "off"} />
      <aside className={cn(FLOAT_PANEL, "absolute left-8 top-16 z-10 w-[calc(100%-2.5rem)] min-[700px]:top-14 min-[700px]:w-64")}>
        <div className="px-3 pt-3">
          <p className="tact-label">Pseudospace</p>
          <p className="font-[family-name:var(--tact-mono)] text-[10px] text-[var(--tact-muted)]">knn graph</p>
        </div>
        <ul className="mt-2">
          {[
            ...ids.flatMap((id) => scene.landmarks.filter((landmark) => landmark.id === id)),
            ...scene.landmarks.filter((landmark) => !ids.includes(landmark.id)),
          ].map((landmark) => {
            const on = ids.includes(landmark.id);
            const index = ids.indexOf(landmark.id);
            return (
              <li key={landmark.id} className={cn("flex items-center gap-2 px-3 py-1", on && "bg-[var(--tact-tone)]")}>
                <Button
                  type="button"
                  variant="ghost"
                  data-testid={`include-${landmark.id}`}
                  className="h-auto min-w-0 flex-1 justify-start rounded-none px-0"
                  onClick={() => {
                    setIds((prev) => (prev.includes(landmark.id) ? prev.filter((id) => id !== landmark.id) : [...prev, landmark.id]));
                  }}
                >
                  <span className="w-4 font-[family-name:var(--tact-mono)] text-[10px]">{on ? index + 1 : ""}</span>
                  <span className="truncate text-xs">
                    {landmark.label}
                    <span className="text-[var(--tact-muted)]"> {landmark.kind}</span>
                  </span>
                </Button>
                <Button type="button" size="sm" variant="ghost" className="rounded-none px-2" data-testid={`up-${landmark.id}`} disabled={!on} onClick={() => setIds((prev) => moveId(prev, landmark.id, -1))}>
                  Up
                </Button>
                <Button type="button" size="sm" variant="ghost" className="rounded-none px-2" data-testid={`down-${landmark.id}`} disabled={!on} onClick={() => setIds((prev) => moveId(prev, landmark.id, 1))}>
                  Down
                </Button>
              </li>
            );
          })}
        </ul>
        <div className="p-3">
          <Button
            type="button"
            className="w-full rounded-none"
            data-testid="pseudospace-make"
            disabled={ordered.length < 2}
            onClick={() => setMade(true)}
          >
            Make pseudospace
          </Button>
        </div>
      </aside>
      {field ? <Profile scene={scene} field={field} /> : null}
    </div>
  );
}
