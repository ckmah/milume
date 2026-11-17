// Spring open and close for a portaled panel. Placement is the caller's.
// Adapted from the beUI popover spring (panel stiffness), without the goo filter,
// so the panel can sit to the right of a widget anchor.

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  forwardRef,
  type ComponentPropsWithoutRef,
  type ReactNode,
  type RefObject,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

import { MOTION_OFF, SPRING_PANEL } from "@/lib/motion-springs";
import { cn } from "@/lib/utils";

import "./motion-overlays.css";

type SpringPanelProps = ComponentPropsWithoutRef<"div"> & {
  /** Scale the panel grows from. Tooltip uses 0.94; panels use 0.92. */
  enterScale?: number;
  /** Scale the panel leaves toward. */
  exitScale?: number;
};

function panelClosed(props: object) {
  const record = props as Record<string, unknown>;
  return (
    record["data-state"] === "closed" ||
    record["data-closed"] !== undefined ||
    record["data-ending-style"] !== undefined
  );
}

/** Shared open and close for portaled Radix and Base UI panels. */
export const SpringPanel = forwardRef<HTMLDivElement, SpringPanelProps>(
  function SpringPanel(
    { className, style, children, enterScale = 0.92, exitScale = 0.96, ...props },
    ref,
  ) {
    const reduce = useReducedMotion() ?? false;
    const closed = panelClosed(props);
    const motionProps = props as ComponentPropsWithoutRef<typeof motion.div>;
    return (
      <motion.div
        ref={ref}
        {...motionProps}
        style={style}
        className={cn("milume-overlay-panel", className)}
        initial={reduce ? false : { opacity: 0, scale: enterScale }}
        animate={
          closed
            ? reduce
              ? { opacity: 0 }
              : { opacity: 0, scale: exitScale }
            : { opacity: 1, scale: 1 }
        }
        transition={reduce ? MOTION_OFF : SPRING_PANEL}
      >
        {children}
      </motion.div>
    );
  },
);

export type PopoverBox = {
  left: number;
  top: number;
  origin: string;
};

export function SpringPopover({
  open,
  onOpenChange,
  portal,
  anchorRef,
  place,
  className,
  testId,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  portal: HTMLElement | null;
  anchorRef: RefObject<HTMLElement | null>;
  place: (anchor: DOMRect, panel: DOMRect) => PopoverBox;
  className?: string;
  testId?: string;
  children: ReactNode;
}) {
  const reduce = useReducedMotion() ?? false;
  const panelRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<PopoverBox | null>(null);

  useLayoutEffect(() => {
    if (!open) return;
    const anchor = anchorRef.current;
    const panel = panelRef.current;
    if (!anchor || !panel) return;
    const update = () => {
      setBox(place(anchor.getBoundingClientRect(), panel.getBoundingClientRect()));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(panel);
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [anchorRef, open, place]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      onOpenChange(false);
      anchorRef.current?.focus();
    };
    const onPointer = (event: PointerEvent) => {
      const path = event.composedPath();
      if (panelRef.current && path.includes(panelRef.current)) return;
      if (anchorRef.current && path.includes(anchorRef.current)) return;
      onOpenChange(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onPointer, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onPointer, true);
    };
  }, [anchorRef, onOpenChange, open]);

  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => {
      const panel = panelRef.current;
      const checked = panel?.querySelector<HTMLElement>("input[type='radio']:checked");
      const first = panel?.querySelector<HTMLElement>("input, button");
      (checked ?? first)?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [open]);

  if (!portal) return null;

  return createPortal(
    <AnimatePresence>
      {open ? (
        <motion.div
          ref={panelRef}
          role="dialog"
          data-testid={testId}
          initial={reduce ? false : { opacity: 0, scale: 0.92 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={reduce ? MOTION_OFF : SPRING_PANEL}
          {...(reduce ? {} : { exit: { opacity: 0, scale: 0.96 } })}
          style={{
            position: "fixed",
            left: box?.left ?? 0,
            top: box?.top ?? 0,
            transformOrigin: box?.origin ?? "left top",
            visibility: box ? "visible" : "hidden",
          }}
          className={cn("pointer-events-auto z-40 outline-none", className)}
          onClick={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
        >
          {children}
        </motion.div>
      ) : null}
    </AnimatePresence>,
    portal,
  );
}
