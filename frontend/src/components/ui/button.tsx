import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { motion, useReducedMotion } from "motion/react"
import { Slot } from "radix-ui"

import { MOTION_OFF, SPRING_PRESS } from "@/lib/motion-springs"
import { cn } from "@/lib/utils"

import "./motion-controls.css"

const PRESS_SCALE = 0.93
const HOVER_SCALE = 1.02

function useHoverCapable() {
  const [canHover, setCanHover] = React.useState(false)
  React.useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return
    const query = window.matchMedia("(hover: hover) and (pointer: fine)")
    const update = () => setCanHover(query.matches)
    update()
    query.addEventListener("change", update)
    return () => query.removeEventListener("change", update)
  }, [])
  return canHover
}

/** Shared press for Button, Toggle, and ToggleGroupItem. Resting scale stays 1. */
export function usePressMotion(disabled?: boolean, force?: string) {
  const reduce = useReducedMotion() === true
  const canHover = useHoverCapable()
  if (reduce || disabled) return { transition: MOTION_OFF }
  const forced =
    force === "active"
      ? { scale: PRESS_SCALE }
      : force === "hover"
        ? { scale: HOVER_SCALE }
        : undefined
  return {
    whileTap: { scale: PRESS_SCALE },
    ...(canHover ? { whileHover: { scale: HOVER_SCALE } } : {}),
    ...(forced ? { animate: forced, initial: false as const } : {}),
    transition: SPRING_PRESS,
  }
}

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-md text-sm font-medium whitespace-nowrap transition-[color,background-color,border-color,box-shadow,opacity,outline-color] outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive:
          "bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:bg-destructive/60 dark:focus-visible:ring-destructive/40",
        outline:
          "bg-background shadow-xs ring-1 ring-input hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:ring-input dark:hover:bg-input/50",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost:
          "hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3",
        xs: "h-6 gap-1 rounded-md px-2 text-xs has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 gap-1.5 rounded-md px-3 has-[>svg]:px-2.5",
        lg: "h-10 rounded-md px-6 has-[>svg]:px-4",
        icon: "size-9",
        "icon-xs": "size-6 rounded-md [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-8",
        "icon-lg": "size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  disabled,
  "data-ds-force": force,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
    "data-ds-force"?: string
  }) {
  const press = usePressMotion(disabled, force)
  const classes = cn(buttonVariants({ variant, size, className }))
  const shared = {
    "data-slot": "button",
    "data-variant": variant,
    "data-size": size,
    "data-ds-force": force,
    className: classes,
    disabled,
    ...props,
  }

  if (asChild) {
    return <Slot.Root {...(shared as React.ComponentProps<typeof Slot.Root>)} />
  }

  return (
    <motion.button
      {...press}
      {...(shared as React.ComponentProps<typeof motion.button>)}
    />
  )
}

export { Button, buttonVariants }
