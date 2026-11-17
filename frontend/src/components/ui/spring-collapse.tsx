// Reveal adapted from beUI collapsible (https://beui.dev/components/motion/collapsible).
// Height uses SPRING_PANEL. Row and dock layout read the CSS variables installed
// from SPRING_LAYOUT. No second stiffness.

import { AnimatePresence, motion, useIsPresent, useReducedMotion } from "motion/react";
import { type ReactNode, useLayoutEffect } from "react";

import { MOTION_OFF, SPRING_LAYOUT, SPRING_PANEL } from "@/lib/motion-springs";

type Spring = {
  stiffness: number;
  damping: number;
  mass: number;
};

function response(spring: Spring, t: number): number {
  if (t <= 0) return 0;
  const omega = Math.sqrt(spring.stiffness / spring.mass);
  const zeta = spring.damping / (2 * Math.sqrt(spring.stiffness * spring.mass));
  const decay = zeta * omega;
  if (zeta > 1) {
    const wd = omega * Math.sqrt(zeta * zeta - 1);
    return 1 - Math.exp(-decay * t) * (Math.cosh(wd * t) + (decay / wd) * Math.sinh(wd * t));
  }
  if (zeta < 1) {
    const wd = omega * Math.sqrt(1 - zeta * zeta);
    return 1 - Math.exp(-decay * t) * (Math.cos(wd * t) + (decay / wd) * Math.sin(wd * t));
  }
  return 1 - Math.exp(-decay * t) * (1 + decay * t);
}

/** Settle time and CSS linear() for a spring already defined in motion-springs. */
export function layoutSpringCss(spring: Spring = SPRING_LAYOUT, steps = 12): {
  ms: number;
  ease: string;
} {
  let ms = 1000;
  for (let t = 1; t <= 1000; t += 1) {
    if (response(spring, t / 1000) >= 0.995) {
      ms = t;
      break;
    }
  }
  const points = Array.from({ length: steps + 1 }, (_, i) => {
    if (i === 0) return "0";
    if (i === steps) return "1";
    const y = Math.min(1, Math.max(0, response(spring, (i / steps) * (ms / 1000))));
    return String(Number(y.toFixed(3)));
  });
  return { ms, ease: `linear(${points.join(", ")})` };
}

const STYLE_ID = "lm-motion-surfaces";

/** Publish SPRING_LAYOUT as variables the dock and row CSS already read. */
export function installLayoutSpring(): void {
  if (typeof document === "undefined") return;
  let style = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement("style");
    style.id = STYLE_ID;
    document.head.appendChild(style);
  }
  const { ms, ease } = layoutSpringCss(SPRING_LAYOUT);
  style.textContent = `.landmarks{--lm-spring-layout-ms:${ms}ms;--lm-spring-layout-ease:${ease}}`;
}

installLayoutSpring();

function CollapseBody({
  className,
  reduce,
  children,
}: {
  className?: string;
  reduce: boolean;
  children: ReactNode;
}) {
  // False for the whole exit, while AnimatePresence still has this subtree mounted.
  const present = useIsPresent();
  return (
    <motion.div
      className={className}
      inert={!present}
      initial={reduce ? false : { height: 0 }}
      animate={{ height: "auto" }}
      exit={{ height: 0 }}
      transition={reduce ? MOTION_OFF : SPRING_PANEL}
      style={{ overflow: "hidden", transformOrigin: "top center" }}
    >
      {children}
    </motion.div>
  );
}

/**
 * Height reveal for a section body that is already open or closed.
 * Padding and margins belong on the child so a closed height of 0 hides them.
 * `id` stays on the wrapper so aria-controls still resolves after the body leaves.
 */
export function SpringCollapse({
  id,
  open,
  className,
  children,
}: {
  id: string;
  open: boolean;
  className?: string;
  children: ReactNode;
}) {
  // E2E sets __motionOff (stabilizeUi) after load. Read it when open changes so a
  // drag on a slider inside the body hits the settled box, not a mid-spring clip.
  const harnessOff =
    typeof window !== "undefined" &&
    Boolean((window as Window & { __motionOff?: boolean }).__motionOff);
  const reduce = (useReducedMotion() ?? false) || harnessOff;

  useLayoutEffect(() => {
    installLayoutSpring();
  }, []);

  return (
    <div id={id}>
      <AnimatePresence initial={false}>
        {open ? (
          <CollapseBody key="open" className={className} reduce={reduce}>
            {children}
          </CollapseBody>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
