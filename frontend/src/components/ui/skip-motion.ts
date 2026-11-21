import { MotionGlobalConfig } from "motion/react";

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
