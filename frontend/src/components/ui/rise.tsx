import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { forwardRef, type CSSProperties, type ReactNode } from "react";

import { MOTION_OFF, SPRING_GLIDE } from "@/lib/motion-springs";

type RiseProps = {
  show?: boolean;
  inert?: boolean;
  className?: string;
  style?: CSSProperties;
  id?: string;
  role?: string;
  children?: ReactNode;
  "data-testid"?: string;
  "aria-hidden"?: boolean | "true" | "false";
};

/**
 * Show/hide with a fade. The leaving panel stays mounted until the spring
 * finishes, then unmounts, so the two pills can stack in one grid cell.
 */
export const Rise = forwardRef<HTMLDivElement, RiseProps>(function Rise(
  { show = true, inert: _inert, children, ...props },
  ref,
) {
  const reduce = useReducedMotion() === true;
  return (
    <AnimatePresence>
      {show ? (
        <motion.div
          key="rise"
          ref={ref}
          {...props}
          initial={reduce ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
          transition={reduce ? MOTION_OFF : SPRING_GLIDE}
        >
          {children}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
});
