import * as React from "react"
import { CircleIcon } from "lucide-react"
import { motion, useReducedMotion } from "motion/react"
import { RadioGroup as RadioGroupPrimitive } from "radix-ui"

import { MOTION_OFF, SPRING_LAYOUT } from "@/lib/motion-springs"
import { cn } from "@/lib/utils"

const RadioLayoutContext = React.createContext<string | null>(null)

function RadioGroup({
  className,
  children,
  ...props
}: React.ComponentProps<typeof RadioGroupPrimitive.Root>) {
  const layoutId = React.useId()
  return (
    <RadioGroupPrimitive.Root
      data-slot="radio-group"
      className={cn("grid gap-3", className)}
      {...props}
    >
      <RadioLayoutContext.Provider value={layoutId}>
        {children}
      </RadioLayoutContext.Provider>
    </RadioGroupPrimitive.Root>
  )
}

function RadioGroupItem({
  className,
  ...props
}: React.ComponentProps<typeof RadioGroupPrimitive.Item>) {
  const sharedId = React.useContext(RadioLayoutContext)
  const localId = React.useId()
  const reduce = useReducedMotion() === true
  return (
    <RadioGroupPrimitive.Item
      data-slot="radio-group-item"
      className={cn(
        "relative aspect-square size-4 shrink-0 rounded-full border border-input text-primary shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:bg-input/30 dark:aria-invalid:ring-destructive/40",
        className
      )}
      {...props}
    >
      <RadioGroupPrimitive.Indicator
        data-slot="radio-group-indicator"
        className="absolute inset-0 flex items-center justify-center"
      >
        <motion.span
          layoutId={reduce ? undefined : (sharedId ?? localId)}
          initial={false}
          transition={reduce ? MOTION_OFF : SPRING_LAYOUT}
          className="flex size-2 items-center justify-center"
        >
          <CircleIcon className="size-2 fill-primary" />
        </motion.span>
      </RadioGroupPrimitive.Indicator>
    </RadioGroupPrimitive.Item>
  )
}

export { RadioGroup, RadioGroupItem }
