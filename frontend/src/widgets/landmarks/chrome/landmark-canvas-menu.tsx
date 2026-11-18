import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Rise } from "@/components/ui/rise";
import {
  CircleMinusIcon,
  CopyPlusIcon,
  EyeIcon,
  EyeOffIcon,
  PencilIcon,
  Trash2Icon,
  WaypointsIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";

import type { EngineHandle } from "../engine";
import { NODE_EDITABLE } from "../helpers";
import type { LandmarksModel } from "../use-landmarks-model";

type MenuState = {
  index: number;
  x: number;
  y: number;
  mode?: string;
  hit?: "vertex" | "edge" | "body";
  vertexIndex?: number;
  afterIndex?: number;
  insertX?: number | null;
  insertY?: number | null;
} | null;

/** Soft Float menu row — same tokens as shadcn DropdownMenuItem. */
function SoftMenuItem({
  children,
  shortcut,
  destructive,
  onClick,
}: {
  children: React.ReactNode;
  shortcut?: string;
  destructive?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      data-slot="dropdown-menu-item"
      data-variant={destructive ? "destructive" : "default"}
      className={cn(
        "relative flex w-full cursor-default items-center gap-2 px-2 py-1.5 text-xs outline-hidden select-none",
        "focus:bg-accent focus:text-accent-foreground hover:bg-accent hover:text-accent-foreground",
        "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5",
        destructive &&
          "text-destructive hover:bg-destructive/10 focus:bg-destructive/10 focus:text-destructive",
      )}
      onClick={onClick}
    >
      <span className="flex min-w-0 flex-1 items-center gap-2">{children}</span>
      {shortcut ? (
        <span className="ml-auto text-[0.625rem] tracking-widest text-muted-foreground">
          {shortcut}
        </span>
      ) : null}
    </button>
  );
}

/** Right-click context menu — Soft Float / shadcn-styled. */
export function LandmarkCanvasMenu({
  lm,
  engine,
  rootEl,
}: {
  lm: LandmarksModel;
  engine: EngineHandle | null;
  rootEl: HTMLElement | null;
}) {
  const [menu, setMenu] = useState<MenuState>(null);

  useEffect(() => {
    if (!engine?.subscribeLandmarkMenu) return;
    return engine.subscribeLandmarkMenu((evt) => {
      const root = rootEl;
      const base = {
        index: evt.index,
        mode: evt.mode,
        hit: evt.hit,
        vertexIndex: evt.vertexIndex,
        afterIndex: evt.afterIndex,
        insertX: evt.insertX,
        insertY: evt.insertY,
      };
      if (!root) {
        setMenu({ ...base, x: evt.clientX, y: evt.clientY });
        return;
      }
      const rect = root.getBoundingClientRect();
      setMenu({
        ...base,
        x: evt.clientX - rect.left,
        y: evt.clientY - rect.top,
      });
    });
  }, [engine, rootEl]);

  useEffect(() => {
    if (!menu) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenu(null);
    };
    let removeDown: (() => void) | undefined;
    const timer = window.setTimeout(() => {
      const onDown = (e: PointerEvent) => {
        const el = rootEl?.querySelector("#landmarks-canvas-menu");
        const path =
          typeof e.composedPath === "function" ? e.composedPath() : [];
        if (
          el &&
          (path.includes(el) ||
            (e.target instanceof Node && el.contains(e.target)))
        ) {
          return;
        }
        setMenu(null);
      };
      document.addEventListener("pointerdown", onDown, true);
      removeDown = () =>
        document.removeEventListener("pointerdown", onDown, true);
    }, 0);
    document.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("keydown", onKey);
      removeDown?.();
    };
  }, [menu, rootEl]);

  const item = menu ? lm.landmarks[menu.index] : null;
  if (!menu || !item || !rootEl) return null;

  const close = () => setMenu(null);
  const run = (fn: () => void) => {
    fn();
    close();
  };

  const inNodeMode = menu.mode === "node";
  const nodeEditable = NODE_EDITABLE.includes(String(item.type || ""));
  const showDeleteNode =
    inNodeMode && nodeEditable && menu.hit === "vertex";
  const showInsertNode =
    inNodeMode &&
    nodeEditable &&
    menu.hit === "edge" &&
    menu.afterIndex != null &&
    menu.afterIndex >= 0 &&
    menu.insertX != null &&
    menu.insertY != null;

  return createPortal(
    <Rise
      id="landmarks-canvas-menu"
      role="menu"
      className="tact-popup tact-menu absolute z-[80] min-w-[10rem] p-1"
      style={{ left: menu.x, top: menu.y }}
      data-testid="landmarks-canvas-menu"
    >
      {showInsertNode ? (
        <SoftMenuItem
          onClick={() =>
            run(() => {
              engine?.insertVertexAt?.(
                menu.index,
                menu.afterIndex!,
                [menu.insertX!, menu.insertY!],
              );
            })
          }
        >
          <WaypointsIcon className="size-3.5" />
          Insert node
        </SoftMenuItem>
      ) : null}
      {showDeleteNode ? (
        <SoftMenuItem
          destructive
          shortcut="⌫"
          onClick={() =>
            run(() => {
              engine?.deleteActiveVertex?.();
            })
          }
        >
          <CircleMinusIcon className="size-3.5" />
          Delete node
        </SoftMenuItem>
      ) : null}
      <SoftMenuItem onClick={() => run(() => lm.toggleLandmarkHidden(menu.index))}>
        {item.hidden ? (
          <EyeIcon className="size-3.5" />
        ) : (
          <EyeOffIcon className="size-3.5" />
        )}
        {item.hidden ? "Show" : "Hide"}
      </SoftMenuItem>
      <SoftMenuItem
        onClick={() =>
          run(() => {
            const next = window.prompt("Rename landmark", item.id);
            if (next != null) lm.renameLandmark(menu.index, next);
          })
        }
      >
        <PencilIcon className="size-3.5" />
        Rename
      </SoftMenuItem>
      <SoftMenuItem onClick={() => run(() => lm.duplicateLandmark(menu.index))}>
        <CopyPlusIcon className="size-3.5" />
        Duplicate
      </SoftMenuItem>
      {/* In node mode, Delete node is enough — omit whole-landmark Delete. */}
      {!inNodeMode ? (
        <SoftMenuItem
          destructive
          shortcut="⌫"
          onClick={() => run(() => lm.deleteLandmark(menu.index))}
        >
          <Trash2Icon className="size-3.5" />
          Delete
        </SoftMenuItem>
      ) : null}
    </Rise>,
    rootEl,
  );
}
