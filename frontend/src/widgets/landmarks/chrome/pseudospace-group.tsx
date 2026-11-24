import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createPortal } from "react-dom";
import { SparklesIcon } from "lucide-react";
import { LayoutGroup, motion } from "motion/react";

import { Button } from "@/components/ui/button";
import { useChromeMotion } from "@/components/ui/reduced-motion";
import { SPRING_LAYOUT } from "@/lib/motion-springs";
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
      size="icon-xs"
      aria-pressed={on}
      aria-label={on ? "Turn pseudospace off" : "Group landmarks into a pseudospace"}
      data-testid="pseudospace-sparkle"
      className={cn("landmarks-trail-hit", on && chromeHitOnClass)}
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

type DragSession = {
  id: string;
  offsetX: number;
  offsetY: number;
  width: number;
};

function resolveDropTarget(
  point: { x: number; y: number },
  dragId: string,
  group: HTMLElement | null,
  outside: HTMLElement | null,
): { inside: boolean; insertAt: number | null } {
  const outsideBox = outside?.getBoundingClientRect();
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
    const rows = [...group.querySelectorAll<HTMLElement>("[data-pseudospace-slot][data-pseudospace-index]")].filter(
      (row) => row.dataset.pseudospaceId !== dragId,
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
  return { inside, insertAt };
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
  const orderRef = useRef(order);
  orderRef.current = order;
  const dragRef = useRef<string | null>(null);
  const liveKeyRef = useRef<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragSession, setDragSession] = useState<DragSession | null>(null);
  const [dragPoint, setDragPoint] = useState<{ x: number; y: number } | null>(null);
  const { reduce } = useChromeMotion();
  const layoutOn = !reduce;

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
        text: String(index + 1),
      };
    });
    engine.setPseudospacePaint({ colors, badges });
    return clear;
  }, [engine, lm, order]);

  const liveReorder = (dragId: string, x: number, y: number) => {
    const target = resolveDropTarget(
      { x, y },
      dragId,
      groupRef.current,
      outsideRef.current,
    );
    const key = `${target.inside}:${target.insertAt ?? "out"}`;
    if (liveKeyRef.current === key) return;
    liveKeyRef.current = key;
    onOrder(place(orderRef.current, dragId, target.inside, target.insertAt));
  };

  const onPointerDown = (id: string) => (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    const rowEl = event.currentTarget.closest<HTMLElement>("[data-panel-row]");
    const box = rowEl?.getBoundingClientRect();
    if (!box) return;

    dragRef.current = id;
    setDraggingId(id);
    setDragSession({
      id,
      offsetX: event.clientX - box.left,
      offsetY: event.clientY - box.top,
      width: box.width,
    });
    setDragPoint({ x: event.clientX, y: event.clientY });
    liveKeyRef.current = null;
    document.body.classList.add("landmarks-pseudospace-dragging");

    const originX = event.clientX;
    const originY = event.clientY;

    const onMove = (move: PointerEvent) => {
      setDragPoint({ x: move.clientX, y: move.clientY });
      const current = dragRef.current;
      if (!current) return;
      if (Math.hypot(move.clientX - originX, move.clientY - originY) < 4) return;
      liveReorder(current, move.clientX, move.clientY);
    };

    let settled = false;
    const finish = (up: PointerEvent | MouseEvent) => {
      if (settled) return;
      const current = dragRef.current;
      if (!current) return;
      settled = true;
      window.removeEventListener("pointermove", onMove, true);
      window.removeEventListener("pointerup", finish, true);
      window.removeEventListener("mouseup", finish, true);
      dragRef.current = null;
      liveKeyRef.current = null;
      setDraggingId(null);
      setDragSession(null);
      setDragPoint(null);
      document.body.classList.remove("landmarks-pseudospace-dragging");
      const x = up.clientX;
      const y = up.clientY;
      const target = resolveDropTarget({ x, y }, current, groupRef.current, outsideRef.current);
      onOrder(place(orderRef.current, current, target.inside, target.insertAt));
    };

    window.addEventListener("pointermove", onMove, true);
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

  const renderLayerRow = (id: string, groupIndex: number | null, ghost: boolean) => {
    const entry = byId.get(id);
    if (!entry) return null;
    const { item, index } = entry;
    const inGroup = groupIndex != null;
    const isDragged = !ghost && draggingId === id;

    return (
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
        reorder={
          ghost
            ? undefined
            : {
                handleTestId: `pseudospace-handle-${id}`,
                dragging: isDragged,
                onPointerDown: onPointerDown(id),
                onKeyDown: (event) => {
                  if (event.key === "ArrowUp" || event.key === "ArrowDown") {
                    event.preventDefault();
                    if (inGroup) nudge(id, event.key === "ArrowUp" ? -1 : 1);
                  }
                },
              }
        }
      />
    );
  };

  const landmarkRow = (id: string, groupIndex: number | null) => {
    const inGroup = groupIndex != null;
    const isDragged = draggingId === id;

    return (
      <div
        key={id}
        className="pseudospace-row-slot"
        data-pseudospace-slot=""
        data-pseudospace-id={id}
        data-pseudospace-index={inGroup ? String(groupIndex) : undefined}
      >
        {isDragged ? (
          <div className="pseudospace-row-slot__gap" aria-hidden />
        ) : (
          <motion.div
            layout={layoutOn}
            layoutId={layoutOn ? `pseudospace-landmark-${id}` : undefined}
            transition={SPRING_LAYOUT}
          >
            {renderLayerRow(id, groupIndex, false)}
          </motion.div>
        )}
      </div>
    );
  };

  const dragGhost =
    dragSession &&
    dragPoint &&
    !reduce &&
    typeof document !== "undefined"
      ? createPortal(
          <div
            className={cn(
              "milume-widget landmarks pseudospace-drag-ghost pseudospace-row--floating",
              document.querySelector(".milume-widget.landmarks")?.classList.contains("dark") && "dark",
            )}
            style={{
              position: "fixed",
              left: dragPoint.x - dragSession.offsetX,
              top: dragPoint.y - dragSession.offsetY,
              width: dragSession.width,
              zIndex: 10000,
              pointerEvents: "none",
            }}
          >
            {renderLayerRow(
              dragSession.id,
              order.indexOf(dragSession.id) >= 0 ? order.indexOf(dragSession.id) : null,
              true,
            )}
          </div>,
          document.body,
        )
      : null;

  const outside = lm.landmarks
    .map((item) => String(item.id))
    .filter((id) => !grouped.has(id));

  return (
    <LayoutGroup id="landmarks-pseudospace">
      <div
        className={cn(
          "landmarks-pseudospace",
          draggingId && "landmarks-pseudospace-dragging",
        )}
      >
        <div
          ref={groupRef}
          className={cn("pseudospace-group", !order.length && "pseudospace-group--empty")}
          data-testid="pseudospace-group"
        >
          {order.length ? (
            <>
              <p className="pseudospace-group__label landmarks-slider-caption">Pseudospace</p>
              {order.map((id, index) => landmarkRow(id, index))}
            </>
          ) : (
            <p className="pseudospace-note pseudospace-note--empty text-xs">Drag landmarks here</p>
          )}
        </div>
        <div ref={outsideRef} className="pseudospace-outside" data-testid="pseudospace-outside">
          {outside.map((id) => landmarkRow(id, null))}
        </div>
      </div>
      {dragGhost}
    </LayoutGroup>
  );
}