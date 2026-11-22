"use client";

import { Switch as SwitchPrimitive } from "@base-ui/react/switch";
import { motion } from "motion/react";
import { useState } from "react";

import { useChromeMotion } from "@/components/ui/reduced-motion";
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
  const [inner, setInner] = useState(Boolean(defaultChecked));
  const on = checked ?? inner;
  const chrome = useChromeMotion();
  const glide = chrome.slideX(on ? "100%" : "0%");

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
        animate={glide.animate}
        style={glide.style}
        transition={chrome.reduce ? chrome.transition : { duration: 0.14, ease: "easeInOut" }}
      />
      <span data-hot={!on}>Off</span>
      <span data-hot={on}>On</span>
    </SwitchPrimitive.Root>
  );
}

export { Switch };
