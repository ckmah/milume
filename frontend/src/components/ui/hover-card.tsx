import { PreviewCard } from "@base-ui/react/preview-card";
import * as React from "react";

import { SpringPanel } from "@/components/ui/spring-popover";
import { cn } from "@/lib/utils";

function HoverCard({
  openDelay: _openDelay,
  closeDelay: _closeDelay,
  ...props
}: PreviewCard.Root.Props & { openDelay?: number; closeDelay?: number }) {
  return <PreviewCard.Root data-slot="hover-card" {...props} />;
}

function HoverCardTrigger({
  asChild,
  children,
  ...props
}: PreviewCard.Trigger.Props & { asChild?: boolean }) {
  if (asChild && React.isValidElement(children)) {
    return <PreviewCard.Trigger data-slot="hover-card-trigger" {...props} render={children} />;
  }
  return (
    <PreviewCard.Trigger data-slot="hover-card-trigger" {...props}>
      {children}
    </PreviewCard.Trigger>
  );
}

function HoverCardContent({
  className,
  align = "center",
  sideOffset = 8,
  side = "bottom",
  container,
  children,
  collisionPadding: _collisionPadding,
  ...props
}: PreviewCard.Popup.Props &
  Pick<PreviewCard.Positioner.Props, "align" | "side" | "sideOffset"> & {
    container?: HTMLElement | null;
    collisionPadding?: number;
  }) {
  return (
    <PreviewCard.Portal container={container ?? undefined}>
      <PreviewCard.Positioner
        className="isolate z-50"
        align={align}
        side={side}
        sideOffset={sideOffset}
      >
        <PreviewCard.Popup
          data-slot="hover-card-content"
          className={cn("tact-popup", className)}
          render={<SpringPanel />}
          {...props}
        >
          {children}
        </PreviewCard.Popup>
      </PreviewCard.Positioner>
    </PreviewCard.Portal>
  );
}

export { HoverCard, HoverCardTrigger, HoverCardContent };
