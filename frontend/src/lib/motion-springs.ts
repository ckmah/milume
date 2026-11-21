import { MotionGlobalConfig } from "motion/react";

/**
 * Shared springs for widget chrome. Later motion work reuses these
 * instead of picking new stiffness values per component.
 * Numbers follow the beUI panel, press, and layout springs.
 */
export const SPRING_PRESS = {
  type: "spring",
  stiffness: 500,
  damping: 30,
  mass: 0.6,
} as const;

export const SPRING_PANEL = {
  type: "spring",
  stiffness: 420,
  damping: 40,
  mass: 0.5,
} as const;

export const SPRING_LAYOUT = {
  type: "spring",
  stiffness: 360,
  damping: 32,
  mass: 0.6,
} as const;

/** Tonal block, active tick, and popup rise. Signed-off stiffness and damping. */
export const SPRING_GLIDE = {
  type: "spring",
  stiffness: 280,
  damping: 32,
} as const;

export const MOTION_OFF = { duration: 0 } as const;

type MilumeWindow = Window & {
  __milumeSkipMotion?: boolean;
  __milumeApplySkipMotion?: () => void;
  /** Live copy of MotionGlobalConfig.skipAnimations, set only by this hook. */
  __milumeSkipAnimations?: boolean;
};

function applySkipMotion() {
  MotionGlobalConfig.skipAnimations = true;
  const live = MotionGlobalConfig.skipAnimations === true;
  const w = window as MilumeWindow;
  w.__milumeSkipAnimations = live;
  if (live) document.documentElement.dataset.milumeSkipAnimations = "true";
}

if (typeof window !== "undefined") {
  const w = window as MilumeWindow;
  w.__milumeApplySkipMotion = applySkipMotion;
  if (w.__milumeSkipMotion === true) applySkipMotion();
}
