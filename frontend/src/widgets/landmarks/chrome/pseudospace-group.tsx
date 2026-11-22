import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { SparklesIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { decodeF32Base64 } from "../binary";
import type { EngineHandle } from "../engine";
import { landmarkColor, type LandmarkItem } from "../helpers";
import { centroid, pseudospaceField, pseudospaceRgb, type Geom, type GeomKind } from "../pseudospace";
import type { LandmarksModel } from "../use-landmarks-model";
import { chromeHitClass, chromeHitOnClass, LayerRow } from "./primitives";

function kindOf(type: string): GeomKind {
  if (type === "line" || type === "spline" || type === "shape" || type === "point") return type;
  return "point";
}

function geomOf(item: LandmarkItem): Geom {
  const vertices = (item.vertices ?? []).map((v) => ({ x: Number(v[0]) || 0, y: Number(v[1]) || 0 }));
  return { id: String(item.id), kind: kindOf(String(item.type)), vertices };
}

function cellsOf(lm: LandmarksModel) {
  const raw = decodeF32Base64(lm.points_data || "");
  const [xMin, xMax] = lm.x_bounds ?? [];
  const [yMin, yMax] = lm.y_bounds ?? [];
  if (xMin == null || xMax == null || yMin == null || yMax == null) return [];
  const n = Math.floor(raw.length / 4);
  const cells = new Array(n);
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    cells[i] = {
      x: xMin + ((raw[o]! + 1) / 2) * (xMax - xMin),
      y: yMin + ((raw[o + 1]! + 1) / 2) * (yMax - yMin),
    };
  }
  return cells;
}

export function SparkleButton({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-pressed={on}
      aria-label={on ? "Turn pseudospace off" : "Group landmarks into a pseudospace"}
      data-testid="pseudospace-sparkle"
      className={cn(chromeHitClass, on && chromeHitOnClass)}
      onClick={(event) => {
        event.stopPropagation();
        onToggle();
      }}
    >
      <SparklesIcon className="size-3.5" />
    </Button>
  );
}

function place(order: readonly string[], id: string, inside: boolean, insertAt: number | null) {
  const without = order.filter((item) => item !== id);
  if (!inside) return without;
  const at = insertAt == null ? without.length : Math.max(0, Math.min(insertAt, without.length));
  without.splice(at, 0, id);
  return without;
}

export function PseudospaceGroup({
  lm,
  engine,
  order,
  onOrder,
  menuContainer,
  selectedKind,
  selectedIndex,
}: {
  lm: LandmarksModel;
  engine: EngineHandle | null;
  order: readonly string[];
  onOrder: (next: string[]) => void;
  menuContainer?: HTMLElement | null;
  selectedKind: string;
  selectedIndex: number;
}) {
  const groupRef = useRef<HTMLDivElement>(null);
  const outsideRef = useRef<HTMLDivElement>(null);
  const valuesRef = useRef<Float64Array | null>(null);
  const orderRef = useRef(order);
  orderRef.current = order;
  const [hover, setHover] = useState<number | null>(null);
  const dragRef = useRef<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  useEffect(() => {
    const ids = new Set(lm.landmarks.map((item) => String(item.id)));
    const next = order.filter((id) => ids.has(id));
    if (next.length !== order.length) onOrder(next);
  }, [lm.landmarks, onOrder, order]);

  useEffect(() => {
    if (!engine) return;
    const byId = new Map(lm.landmarks.map((item) => [String(item.id), item]));
    const ordered = order.map((id) => byId.get(id)).filter((item): item is LandmarkItem => item != null).map(geomOf);
    const clear = () => {
      valuesRef.current = null;
      engine.setPseudospacePaint(null);
    };
    if (ordered.length < 2) {
      clear();
      return clear;
    }
    const cells = cellsOf(lm);
    const field = pseudospaceField(cells, ordered);
    if (!field) {
      clear();
      return clear;
    }
    const dark = document.documentElement.classList.contains("dark");
    const colors = new Uint8Array(cells.length * 4);
    for (let i = 0; i < cells.length; i++) {
      const value = field.values[i] ?? Number.NaN;
      const rgb = pseudospaceRgb(value, field.valueMax, dark);
      const o = i * 4;
      colors[o] = rgb[0];
      colors[o + 1] = rgb[1];
      colors[o + 2] = rgb[2];
      colors[o + 3] = 255;
    }
    const badges = ordered.map((geom, index) => {
      const at = centroid(geom);
      return {
        x: at.x,
        y: at.y,
        text: String(index + 1), // 1-based badge; the field value at the first landmark stays 0
      };
    });
    valuesRef.current = field.values;
    engine.setPseudospacePaint({ colors, badges });
    return clear;
  }, [engine, lm, order]);

  useEffect(() => {
    if (!engine || order.length < 2) {
      setHover(null);
      return;
    }
    const root = document.querySelector(".milume-widget.landmarks");
    const canvas = root?.querySelector("canvas.landmarks__webgl");
    if (!(root instanceof HTMLElement) || !(canvas instanceof HTMLCanvasElement)) return;
    const onMove = (event: PointerEvent) => {
      const box = canvas.getBoundingClientRect();
      if (!box.width || !box.height) return;
      const cssX = event.clientX - box.left;
      const cssY = event.clientY - box.top;
      const w = canvas.clientWidth || box.width;
      const h = canvas.clientHeight || box.height;
      const hit = engine.nearestPoint(cssX * (w / box.width), cssY * (h / box.height));
      const value = hit ? valuesRef.current?.[hit.index] : undefined;
      setHover(value != null && Number.isFinite(value) ? value : null);
    };
    const onLeave = () => setHover(null);
    root.addEventListener("pointermove", onMove);
    root.addEventListener("pointerleave", onLeave);
    return () => {
      root.removeEventListener("pointermove", onMove);
      root.removeEventListener("pointerleave", onLeave);
    };
  }, [engine, order.length]);

  const onPointerDown = (id: string) => (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    dragRef.current = id;
    setDraggingId(id);
    document.body.classList.add("landmarks-pseudospace-dragging");
    let settled = false;
    const finish = (up: Event) => {
      if (settled) return;
      const current = dragRef.current;
      if (!current) return;
      settled = true;
      window.removeEventListener("pointerup", finish, true);
      window.removeEventListener("mouseup", finish, true);
      dragRef.current = null;
      setDraggingId(null);
      document.body.classList.remove("landmarks-pseudospace-dragging");
      const point =
        up instanceof PointerEvent
          ? { x: up.clientX, y: up.clientY }
          : up instanceof MouseEvent
            ? { x: up.clientX, y: up.clientY }
            : null;
      if (!point) return;
      const group = groupRef.current;
      const outsideBox = outsideRef.current?.getBoundingClientRect();
      const inOutside =
        !!outsideBox &&
        point.x >= outsideBox.left &&
        point.x <= outsideBox.right &&
        point.y >= outsideBox.top &&
        point.y <= outsideBox.bottom;
      const groupBox = group?.getBoundingClientRect();
      const inGroup =
        !inOutside &&
        !!groupBox &&
        point.x >= groupBox.left &&
        point.x <= groupBox.right &&
        point.y >= groupBox.top &&
        point.y <= groupBox.bottom;
      const inside = inGroup;
      let insertAt: number | null = null;
      if (inside && group) {
        const rows = [...group.querySelectorAll<HTMLElement>("[data-pseudospace-id][data-pseudospace-index]")].filter(
          (row) => row.dataset.pseudospaceId !== current,
        );
        insertAt = rows.length;
        for (let i = 0; i < rows.length; i++) {
          const row = rows[i];
          if (!row) continue;
          const rowBox = row.getBoundingClientRect();
          if (point.y < rowBox.top + rowBox.height / 2) {
            insertAt = i;
            break;
          }
        }
      }
      onOrder(place(orderRef.current, current, inside, insertAt));
    };
    window.addEventListener("pointerup", finish, true);
    window.addEventListener("mouseup", finish, true);
  };

  const nudge = (id: string, dir: -1 | 1) => {
    const index = order.indexOf(id);
    const next = index + dir;
    if (index < 0 || next < 0 || next >= order.length) return;
    const copy = [...order];
    const [item] = copy.splice(index, 1);
    if (!item) return;
    copy.splice(next, 0, item);
    onOrder(copy);
  };

  const grouped = new Set(order);
  const byId = new Map(lm.landmarks.map((item, index) => [String(item.id), { item, index }] as const));

  const landmarkRow = (id: string, groupIndex: number | null) => {
    const entry = byId.get(id);
    if (!entry) return null;
    const { item, index } = entry;
    const inGroup = groupIndex != null;
    return (
      <div
        key={id}
        data-pseudospace-id={id}
        data-pseudospace-index={inGroup ? String(groupIndex) : undefined}
      >
        <LayerRow
          testId={inGroup ? `pseudospace-row-${id}` : undefined}
          active={selectedKind === "landmark" && selectedIndex === index}
          color={landmarkColor(item, index)}
          swatchVariant="solid"
          label={String(item.id)}
          hidden={!!item.hidden}
          menuContainer={menuContainer}
          groupIndex={groupIndex ?? undefined}
          onSelect={() => lm.select("landmark", index)}
          onRename={(next) => lm.renameLandmark(index, next)}
          onToggleHidden={() => lm.toggleLandmarkHidden(index)}
          onDelete={() => lm.deleteLandmark(index)}
          reorder={{
            handleTestId: `pseudospace-handle-${id}`,
            dragging: draggingId === id,
            onPointerDown: onPointerDown(id),
            onKeyDown: (event) => {
              if (event.key === "ArrowUp" || event.key === "ArrowDown") {
                event.preventDefault();
                if (inGroup) nudge(id, event.key === "ArrowUp" ? -1 : 1);
              }
            },
          }}
        />
      </div>
    );
  };

  const outside = lm.landmarks
    .map((item) => String(item.id))
    .filter((id) => !grouped.has(id));

  return (
    <div className="landmarks-pseudospace flex flex-col gap-0.5">
      {hover != null ? (
        <p
          className="pseudospace-note m-0 text-xs tabular-nums text-muted-foreground"
          data-testid="pseudospace-readout"
        >
          {hover.toFixed(2)}
        </p>
      ) : null}
      <div
        ref={groupRef}
        className={cn("pseudospace-group", !order.length && "pseudospace-group--empty")}
        data-testid="pseudospace-group"
      >
        {order.length ? (
          order.map((id, index) => landmarkRow(id, index))
        ) : (
          <p className="pseudospace-note pseudospace-note--empty text-xs">Drag landmarks here</p>
        )}
      </div>
      <div
        ref={outsideRef}
        className="pseudospace-outside flex flex-col gap-0.5"
        data-testid="pseudospace-outside"
      >
        {outside.map((id) => landmarkRow(id, null))}
      </div>
    </div>
  );
}
