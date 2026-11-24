import { LayoutGroup, motion } from "motion/react";
import type { ReactNode } from "react";

import { useChromeMotion } from "@/components/ui/reduced-motion";
import { SPRING_LAYOUT } from "@/lib/motion-springs";

/** Shared layout root so a slot can glide between lists. */
export function ChromeLayoutGroup({
  id,
  children,
}: {
  id: string;
  children: ReactNode;
}) {
  return <LayoutGroup id={id}>{children}</LayoutGroup>;
}

/**
 * One row in a shared layout. Reduced motion keeps a plain wrapper so the
 * row does not glide.
 */
export function LayoutSlot({
  layoutId,
  children,
}: {
  layoutId: string;
  children: ReactNode;
}) {
  const { reduce } = useChromeMotion();
  if (reduce) return <div>{children}</div>;
  return (
    <motion.div layout layoutId={layoutId} transition={SPRING_LAYOUT}>
      {children}
    </motion.div>
  );
}
