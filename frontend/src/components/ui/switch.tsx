"use client";

import { Switch as SwitchPrimitive } from "@base-ui/react/switch";
import { motion, useReducedMotion } from "motion/react";
import { useState } from "react";

import { MOTION_OFF } from "@/lib/motion-springs";
import { cn } from "@/lib/utils";

function Switch({
  className,
  size = "default",
  checked,
  defaultChecked,
  onCheckedChange,
  ...props
}: SwitchPrimitive.Root.Props & {
  size?: "sm" | "default";
}) {
  const reduce = useReducedMotion() === true;
  const [inner, setInner] = useState(Boolean(defaultChecked));
  const on = checked ?? inner;

  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      data-size={size}
      checked={checked}
      defaultChecked={defaultChecked}
      onCheckedChange={(next, event) => {
        if (checked === undefined) setInner(next);
        onCheckedChange?.(next, event);
      }}
      className={cn("tact-switch", size === "sm" && "tact-switch--sm", className)}
      {...props}
    >
      <motion.span
        aria-hidden
        className="tact-switch-glide"
        initial={false}
        animate={{ x: on ? "100%" : "0%" }}
        transition={reduce ? MOTION_OFF : { duration: 0.14, ease: "easeOut" }}
      />
      <span data-hot={!on}>Off</span>
      <span data-hot={on}>On</span>
    </SwitchPrimitive.Root>
  );
}

export { Switch };
