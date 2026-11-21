import { useReducedMotion } from "motion/react";
import type { Transition } from "motion/react";

import { SPRING_GLIDE } from "@/lib/motion-springs";

/**
 * Opacity fade under reduced motion. Matches `--duration-micro` (80ms).
 * Motion's transition API takes seconds.
 */
export const OPACITY_FADE_REDUCED: Transition = { duration: 0.08, ease: "linear" };

const MOVE_KEYS = [
  "x",
  "y",
  "z",
  "scale",
  "scaleX",
  "scaleY",
  "rotate",
  "rotateX",
  "rotateY",
  "rotateZ",
] as const;

type Pose = Record<string, string | number>;

/**
 * Shared reduced-motion policy for chrome that fades.
 * MotionConfig snaps transform keys, and it leaves opacity on the caller's
 * transition. This helper keeps that fade at 80ms and drops move keys so
 * callers do not pass them.
 */
export function useChromeMotion() {
  const reduce = useReducedMotion() === true;
  return {
    reduce,
    transition: (reduce ? OPACITY_FADE_REDUCED : SPRING_GLIDE) as Transition,
    pose(target: Pose): Pose {
      if (!reduce) return target;
      const next: Pose = { ...target };
      for (const key of MOVE_KEYS) delete next[key];
      return next;
    },
    gesture(target: Pose): Pose | undefined {
      return reduce ? undefined : target;
    },
    /**
     * Thumb travel. Reduced motion sets translateX directly so the caller
     * does not pass `x` into an animation.
     */
    slideX(x: string): { animate?: { x: string }; style?: { transform: string } } {
      if (reduce) return { style: { transform: `translateX(${x})` } };
      return { animate: { x } };
    },
  };
}
