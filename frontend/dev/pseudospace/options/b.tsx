import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { FLOAT_PANEL } from "@/widgets/landmarks/chrome/sections";

import { orderLandmarks, pseudospaceField } from "../geometry";
import { PseudospaceMap } from "../PseudospaceMap";
import type { OptionProps } from "./types";
import { Profile } from "./profile";

export function OptionB({ scene }: OptionProps) {
  const [ids, setIds] = useState<string[]>([]);
  const [done, setDone] = useState(false);
  const ordered = useMemo(() => orderLandmarks(scene.landmarks, ids), [scene.landmarks, ids]);
  const field = done && ordered.length >= 2 ? pseudospaceField(scene.cells, ordered) : null;

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
    <div data-testid="pseudospace-option-b" data-count={ordered.length} data-done={done ? "yes" : "no"} className="relative h-full w-full">
      <PseudospaceMap
        scene={scene}
        ordered={ordered}
        field={field}
        shade={field ? "both" : "off"}
        onPick={(hit) => {
          const id = hit.landmarkId;
          if (done || !id || ids.includes(id)) return;
          setIds((prev) => [...prev, id]);
        }}
      />
      <div className={cn(FLOAT_PANEL, "absolute left-10 top-16 z-10 max-w-xs")}>
        <div className="flex items-center gap-3 px-3 py-2">
          <div>
            <p className="tact-label">Pseudospace</p>
            <p className="font-[family-name:var(--tact-mono)] text-[10px] text-[var(--tact-muted)]">
              {done
                ? "Order set. knn graph."
                : "Click landmarks in order. Enter to finish. Esc to clear. knn graph."}
            </p>
          </div>
          {done ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              data-testid="pseudospace-clear"
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
