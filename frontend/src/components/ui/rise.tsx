import { AnimatePresence, motion } from "motion/react";
import { forwardRef, type CSSProperties, type ReactNode } from "react";

import { useChromeMotion } from "@/components/ui/reduced-motion";

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
 * Reduced motion fades opacity for 80ms and does not pass a rise.
 */
export const Rise = forwardRef<HTMLDivElement, RiseProps>(function Rise(
  { show = true, inert: _inert, children, ...props },
  ref,
) {
  const { pose, transition } = useChromeMotion();
  return (
    <AnimatePresence>
      {show ? (
        <motion.div
          key="rise"
          ref={ref}
          {...props}
          initial={pose({ opacity: 0, y: 8 })}
          animate={pose({ opacity: 1, y: 0 })}
          exit={pose({ opacity: 0, y: 8 })}
          transition={transition}
        >
          {children}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
});
