import { Children, isValidElement, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";

import { SPRING_GLIDE, SPRING_LAYOUT, SPRING_PRESS } from "@/lib/motion-springs";
import { cn } from "@/lib/utils";

/** First row waits 40ms, then each next row is 40ms later. Close runs last to first. */
const ROW_STAGGER = 0.04;

const groupVariants = {
  open: {
    height: "auto",
    transition: {
      height: SPRING_LAYOUT,
      staggerChildren: ROW_STAGGER,
      delayChildren: ROW_STAGGER,
      staggerDirection: 1,
    },
  },
  closed: {
    height: 0,
    transition: {
      height: SPRING_LAYOUT,
      staggerChildren: ROW_STAGGER,
      delayChildren: ROW_STAGGER,
      staggerDirection: -1,
    },
  },
};

const rowVariants = {
  open: { opacity: 1, y: 0, transition: SPRING_GLIDE },
  closed: { opacity: 0, y: 8, transition: SPRING_GLIDE },
};

function rowKey(row: ReactNode, index: number): string {
  if (isValidElement(row) && row.key != null) return String(row.key);
  return `group-row-${index}`;
}

/**
 * Height of a panel group. Direct children are the rows: they fade and rise
 * 8px, 40ms apart. The first mount does not play (AnimatePresence initial={false}).
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
          variants={groupVariants}
          initial="closed"
          animate="open"
          exit="closed"
        >
          {rows.map((row, index) => (
            <motion.div
              key={rowKey(row, index)}
              data-group-row=""
              className="min-w-0"
              variants={rowVariants}
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
  return (
    <motion.span
      className={cn("inline-flex items-center justify-center", className)}
      initial={false}
      animate={{ rotate: open ? 90 : 0 }}
      transition={SPRING_PRESS}
    >
      {children}
    </motion.span>
  );
}

/** Shade plate behind an open band. Fades with the layout spring. */
export function BandPlate({ show }: { show: boolean }) {
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
          transition={SPRING_LAYOUT}
        />
      ) : null}
    </AnimatePresence>
  );
}
