import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip";
import * as React from "react";

import { SpringPanel } from "@/components/ui/spring-popover";
import { cn } from "@/lib/utils";

import "./motion-overlays.css";

function TooltipProvider({
  delayDuration = 0,
  delay,
  skipDelayDuration: _skipDelayDuration,
  children,
  ...props
}: TooltipPrimitive.Provider.Props & { delayDuration?: number; skipDelayDuration?: number }) {
  return (
    <TooltipPrimitive.Provider delay={delay ?? delayDuration} {...props}>
      {children}
    </TooltipPrimitive.Provider>
  );
}

function Tooltip({ ...props }: TooltipPrimitive.Root.Props) {
  return <TooltipPrimitive.Root data-slot="tooltip" {...props} />;
}

function TooltipTrigger({
  asChild,
  children,
  ...props
}: TooltipPrimitive.Trigger.Props & { asChild?: boolean }) {
  if (asChild && React.isValidElement(children)) {
    return (
      <TooltipPrimitive.Trigger
        data-slot="tooltip-trigger"
        {...props}
        render={children}
      />
    );
  }
  return (
    <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props}>
      {children}
    </TooltipPrimitive.Trigger>
  );
}

function TooltipContent({
  className,
  sideOffset = 8,
  container,
  children,
  side = "bottom",
  ...props
}: TooltipPrimitive.Popup.Props &
  Pick<TooltipPrimitive.Positioner.Props, "side" | "sideOffset"> & {
    container?: HTMLElement | null;
  }) {
  return (
    <TooltipPrimitive.Portal container={container ?? undefined}>
      <TooltipPrimitive.Positioner side={side} sideOffset={sideOffset} className="isolate z-50">
        <TooltipPrimitive.Popup
          data-slot="tooltip-content"
          className={cn("tact-tooltip", className)}
          render={<SpringPanel />}
          {...props}
        >
          {children}
        </TooltipPrimitive.Popup>
      </TooltipPrimitive.Positioner>
    </TooltipPrimitive.Portal>
  );
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider };
