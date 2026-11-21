import { Children, isValidElement, useMemo, type ReactNode } from "react";
import { AnimatePresence, motion, type Transition } from "motion/react";

import { OPACITY_FADE_REDUCED, SNAP, useChromeMotion } from "@/components/ui/reduced-motion";
import { SPRING_GLIDE, SPRING_LAYOUT, SPRING_PRESS } from "@/lib/motion-springs";
import { cn } from "@/lib/utils";

/** First row waits 40ms, then each next row is 40ms later. Close runs last to first, starting at 0. */
const ROW_STAGGER = 0.04;

function groupMotion(reduce: boolean) {
  const step = reduce ? 0 : ROW_STAGGER;
  const height: Transition = reduce ? SNAP : SPRING_LAYOUT;
  const row: Transition = reduce ? OPACITY_FADE_REDUCED : SPRING_GLIDE;
  return {
    group: {
      open: {
        height: "auto",
        transition: {
          height,
          staggerChildren: step,
          delayChildren: step,
          staggerDirection: 1,
        },
      },
      closed: {
        height: 0,
        transition: {
          height,
          staggerChildren: step,
          delayChildren: 0,
          staggerDirection: -1,
        },
      },
    },
    row: {
      open: reduce ? { opacity: 1, transition: row } : { opacity: 1, y: 0, transition: row },
      closed: reduce ? { opacity: 0, transition: row } : { opacity: 0, y: 8, transition: row },
    },
  };
}

function rowKey(row: ReactNode, index: number): string {
  if (isValidElement(row) && row.key != null) return String(row.key);
  return `group-row-${index}`;
}

/**
 * Height of a panel group. Direct children are the rows: they fade and rise
 * 8px, 40ms apart. The first mount does not play (AnimatePresence initial={false}).
 * Reduced motion snaps the height and fades each row for 80ms with no rise.
 */
export function GroupBody({
  open,
  className,
  children,
}: {
  open: boolean;
  className?: string;
  children?: ReactNode;
}) {
  const { reduce } = useChromeMotion();
  const variants = useMemo(() => groupMotion(reduce), [reduce]);
  const rows = Children.toArray(children).filter(
    (row) => typeof row !== "string" || row.trim().length > 0,
  );
  return (
    <AnimatePresence initial={false}>
      {open ? (
        <motion.div
          key="group-rise"
          data-group-rise=""
          className={className}
          style={{ overflow: "hidden" }}
          variants={variants.group}
          initial="closed"
          animate="open"
          exit="closed"
        >
          {rows.map((row, index) => (
            <motion.div
              key={rowKey(row, index)}
              data-group-row=""
              className="min-w-0"
              variants={variants.row}
            >
              {row}
            </motion.div>
          ))}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

/** Chevron that rotates 0 to 90. The first mount holds the current angle. */
export function GroupChevron({
  open,
  className,
  children,
}: {
  open: boolean;
  className?: string;
  children?: ReactNode;
}) {
  const { reduce } = useChromeMotion();
  return (
    <motion.span
      className={cn("inline-flex items-center justify-center", className)}
      initial={false}
      animate={{ rotate: open ? 90 : 0 }}
      transition={reduce ? SNAP : SPRING_PRESS}
    >
      {children}
    </motion.span>
  );
}

/** Shade plate behind an open band. Opacity follows the layout spring, and snaps when motion is reduced. */
export function BandPlate({ show }: { show: boolean }) {
  const { reduce } = useChromeMotion();
  return (
    <AnimatePresence initial={false}>
      {show ? (
        <motion.div
          key="band-plate"
          className="landmarks-panel-band__plate"
          data-panel-shade=""
          aria-hidden
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={reduce ? SNAP : SPRING_LAYOUT}
        />
      ) : null}
    </AnimatePresence>
  );
}
