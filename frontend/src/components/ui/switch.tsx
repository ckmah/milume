"use client"

import type { ComponentProps } from "react"
import { Switch as SwitchPrimitive } from "@base-ui/react/switch"
import { motion, useReducedMotion } from "motion/react"

import { MOTION_OFF, SPRING_LAYOUT } from "@/lib/motion-springs"
import { cn } from "@/lib/utils"

function SwitchThumb({ size }: { size: "sm" | "default" }) {
  const reduce = useReducedMotion() === true
  return (
    <SwitchPrimitive.Thumb
      data-slot="switch-thumb"
      className={cn(
        "pointer-events-none block rounded-full bg-background ring-0 dark:data-checked:bg-primary-foreground dark:data-unchecked:bg-foreground",
        size === "default" && "size-4",
        size === "sm" && "size-3"
      )}
      render={(props, state) => (
        <motion.span
          {...(props as ComponentProps<typeof motion.span>)}
          initial={false}
          animate={{ x: state.checked ? "calc(100% - 2px)" : 0 }}
          transition={reduce ? MOTION_OFF : SPRING_LAYOUT}
        />
      )}
    />
  )
}

function Switch({
  className,
  size = "default",
  ...props
}: SwitchPrimitive.Root.Props & {
  size?: "sm" | "default"
}) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        "peer group/switch relative inline-flex shrink-0 items-center rounded-full border border-transparent bg-input transition-all outline-none after:absolute after:-inset-x-3 after:-inset-y-2 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 data-checked:bg-primary data-unchecked:bg-input dark:data-unchecked:bg-input/80",
        size === "default" && "h-[1.15rem] w-8",
        size === "sm" && "h-3.5 w-6",
        className
      )}
      {...props}
    >
      <SwitchThumb size={size} />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
