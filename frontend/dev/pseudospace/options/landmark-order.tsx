import { useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { GripVerticalIcon, SparklesIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { chromeHitClass, chromeHitOnClass, LayerRow } from "@/widgets/landmarks/chrome/primitives";

import type { Landmark, Scene } from "../types";

const SWATCH = ["#3d7dff", "#e4572e", "#2a9d8f", "#7b2cbf"];

const BRACKETS: CSSProperties = {
  borderRadius: 0,
  backgroundColor: "transparent",
  backgroundImage: [
    "linear-gradient(var(--tact-rule), var(--tact-rule))",
    "linear-gradient(var(--tact-rule), var(--tact-rule))",
    "linear-gradient(var(--tact-rule), var(--tact-rule))",
    "linear-gradient(var(--tact-rule), var(--tact-rule))",
    "linear-gradient(var(--tact-rule), var(--tact-rule))",
    "linear-gradient(var(--tact-rule), var(--tact-rule))",
    "linear-gradient(var(--tact-rule), var(--tact-rule))",
    "linear-gradient(var(--tact-rule), var(--tact-rule))",
  ].join(","),
  backgroundSize: "8px 1px, 1px 8px, 8px 1px, 1px 8px, 8px 1px, 1px 8px, 8px 1px, 1px 8px",
  backgroundPosition: "0 0, 0 0, 100% 0, 100% 0, 0 100%, 0 100%, 100% 100%, 100% 100%",
  backgroundRepeat: "no-repeat",
};

type Drag = {
  id: string;
  x: number;
  y: number;
  label: string;
  fromGroup: boolean;
  insert: number;
  overGroup: boolean;
};

function byId(scene: Scene, id: string): Landmark | undefined {
  return scene.landmarks.find((landmark) => landmark.id === id);
}

export function SparkleButton({ pressed, onToggle }: { pressed: boolean; onToggle: () => void }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      data-testid="pseudospace-sparkle"
      aria-pressed={pressed}
      aria-label={pressed ? "Stop grouping landmarks" : "Group landmarks"}
      className={cn("size-6 rounded-none", chromeHitClass, pressed && chromeHitOnClass)}
      onClick={(event) => {
        event.stopPropagation();
        onToggle();
      }}
    >
      <SparklesIcon className={cn("size-3.5", !pressed && "text-[var(--tact-accent)]")} />
    </Button>
  );
}

export function LandmarkOrder({
  scene,
  grouping,
  ids,
  onIds,
}: {
  scene: Scene;
  grouping: boolean;
  ids: string[];
  onIds: (next: string[]) => void;
}) {
  const groupRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const grouped = ids.flatMap((id) => {
    const landmark = byId(scene, id);
    return landmark ? [landmark] : [];
  });
  const outside = scene.landmarks.filter((landmark) => !ids.includes(landmark.id));

  const place = (id: string, clientX: number, clientY: number) => {
    const group = groupRef.current;
    if (!group) return { insert: 0, overGroup: false };
    const rect = group.getBoundingClientRect();
    const overGroup = clientX >= rect.left && clientX <= rect.right && clientY >= rect.top - 6 && clientY <= rect.bottom + 10;
    const rows = [...group.querySelectorAll<HTMLElement>("[data-group-row]")].filter((row) => row.dataset.groupRow !== id);
    let insert = 0;
    for (const row of rows) {
      const rowRect = row.getBoundingClientRect();
      if (clientY > rowRect.top + rowRect.height / 2) insert += 1;
    }
    return { insert, overGroup };
  };

  const begin = (event: ReactPointerEvent<HTMLElement>, landmark: Landmark, fromGroup: boolean) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startY = event.clientY;
    let active = false;
    const move = (ev: PointerEvent) => {
      if (!active && Math.hypot(ev.clientX - startX, ev.clientY - startY) < 4) return;
      active = true;
      const next = place(landmark.id, ev.clientX, ev.clientY);
      setDrag({
        id: landmark.id,
        x: ev.clientX,
        y: ev.clientY,
        label: landmark.label,
        fromGroup,
        insert: next.insert,
        overGroup: next.overGroup,
      });
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      if (!active) return;
      const next = place(landmark.id, ev.clientX, ev.clientY);
      setDrag(null);
      if (next.overGroup) {
        const rest = ids.filter((id) => id !== landmark.id);
        const copy = rest.slice();
        copy.splice(next.insert, 0, landmark.id);
        onIds(copy);
      } else if (fromGroup) {
        onIds(ids.filter((id) => id !== landmark.id));
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const nudge = (id: string, dir: -1 | 1) => {
    const index = ids.indexOf(id);
    const next = index + dir;
    if (index < 0 || next < 0 || next >= ids.length) return;
    const copy = ids.slice();
    const [item] = copy.splice(index, 1);
    if (!item) return;
    copy.splice(next, 0, item);
    onIds(copy);
  };

  const row = (landmark: Landmark, index: number, inGroup: boolean) => {
    const color = SWATCH[scene.landmarks.findIndex((item) => item.id === landmark.id) % SWATCH.length] ?? SWATCH[0];
    const lifted = drag?.id === landmark.id;
    return (
      <div key={landmark.id}>
        <div
          data-testid={`pseudospace-row-${landmark.id}`}
          data-group-row={inGroup ? landmark.id : undefined}
          className={cn("flex items-center", lifted && "opacity-40")}
          onPointerDown={!grouping || inGroup ? undefined : (event) => begin(event, landmark, false)}
        >
          {inGroup ? (
            <button
              type="button"
              data-testid={`pseudospace-handle-${landmark.id}`}
              aria-label={`Reorder ${landmark.label}`}
              className={cn(chromeHitClass, "ml-1 size-6 rounded-none")}
              onPointerDown={(event) => begin(event, landmark, true)}
              onKeyDown={(event) => {
                if (event.key === "ArrowUp") {
                  event.preventDefault();
                  nudge(landmark.id, -1);
                } else if (event.key === "ArrowDown") {
                  event.preventDefault();
                  nudge(landmark.id, 1);
                }
              }}
            >
              <GripVerticalIcon className="size-3.5" />
            </button>
          ) : null}
          <span className="w-4 shrink-0 text-center font-[family-name:var(--tact-mono)] text-[10px] text-[var(--tact-muted)]">
            {inGroup ? index : ""}
          </span>
          <div className="min-w-0 flex-1">
            <LayerRow active={false} color={color} swatchVariant="solid" label={landmark.label} onSelect={() => {}} />
          </div>
        </div>
      </div>
    );
  };

  if (!grouping) {
    return (
      <div data-testid="pseudospace-landmarks">
        {scene.landmarks.map((landmark, index) => row(landmark, index, false))}
      </div>
    );
  }

  return (
    <div data-testid="pseudospace-landmarks">
      <div
        ref={groupRef}
        data-testid="pseudospace-group"
        data-drag-over={drag?.overGroup ? "true" : "false"}
        className="mx-1.5 mb-1.5 px-0.5 py-1"
        style={BRACKETS}
      >
        <p className="tact-label px-2 pt-0.5">Order</p>
        {grouped.length ? (
          grouped.map((landmark, index) => {
            const before =
              drag?.overGroup &&
              drag.id !== landmark.id &&
              drag.insert === grouped.slice(0, index).filter((item) => item.id !== drag.id).length;
            return (
              <div key={landmark.id}>
                {before ? <div className="mx-2 h-0.5 bg-[var(--tact-accent)]" data-testid="pseudospace-insert" /> : null}
                {row(landmark, index, true)}
              </div>
            );
          })
        ) : (
          <p className="px-2 py-2 text-[11px] text-[var(--tact-muted)]">Drag landmarks here</p>
        )}
        {drag?.overGroup && drag.insert >= grouped.filter((landmark) => landmark.id !== drag.id).length ? (
          <div className="mx-2 h-0.5 bg-[var(--tact-accent)]" data-testid="pseudospace-insert" />
        ) : null}
      </div>
      <div data-testid="pseudospace-outside">
        {outside.map((landmark, index) => row(landmark, index, false))}
      </div>
      {drag ? (
        <div
          data-testid="pseudospace-dragging"
          className="pointer-events-none fixed z-[90] border border-[var(--tact-rule)] bg-[var(--tact-surface)] px-2 py-1 text-[11px]"
          style={{ left: drag.x + 8, top: drag.y - 12 }}
        >
          {drag.label}
        </div>
      ) : null}
    </div>
  );
}
