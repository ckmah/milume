import * as React from "react"
import { HoverCard as HoverCardPrimitive } from "radix-ui"

import { SpringPanel } from "@/components/ui/spring-popover"
import { cn } from "@/lib/utils"

function HoverCard({
  ...props
}: React.ComponentProps<typeof HoverCardPrimitive.Root>) {
  return <HoverCardPrimitive.Root data-slot="hover-card" {...props} />
}

function HoverCardTrigger({
  ...props
}: React.ComponentProps<typeof HoverCardPrimitive.Trigger>) {
  return (
    <HoverCardPrimitive.Trigger data-slot="hover-card-trigger" {...props} />
  )
}

function HoverCardContent({
  className,
  align = "center",
  sideOffset = 4,
  container,
  children,
  ...props
}: React.ComponentProps<typeof HoverCardPrimitive.Content> & {
  /** Portal target; widgets pass their root so scoped styles apply. */
  container?: HTMLElement | null
}) {
  return (
    <HoverCardPrimitive.Portal
      data-slot="hover-card-portal"
      container={container ?? undefined}
    >
      <HoverCardPrimitive.Content
        data-slot="hover-card-content"
        align={align}
        sideOffset={sideOffset}
        className={cn(
          "z-50 w-64 origin-(--radix-hover-card-content-transform-origin) rounded-md border bg-popover p-4 text-popover-foreground shadow-md outline-hidden",
          className
        )}
        {...props}
        asChild
      >
        <SpringPanel>{children}</SpringPanel>
      </HoverCardPrimitive.Content>
    </HoverCardPrimitive.Portal>
  )
}

export { HoverCard, HoverCardTrigger, HoverCardContent }
