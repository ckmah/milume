import {
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
  PanelRightCloseIcon,
  PanelRightOpenIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import { ChromeTooltip, chromeHitClass } from "./primitives";

type DockSide = "left" | "right";

const COLLAPSE_ICON = {
  left: PanelLeftCloseIcon,
  right: PanelRightCloseIcon,
} as const;

const EXPAND_ICON = {
  left: PanelLeftOpenIcon,
  right: PanelRightOpenIcon,
} as const;

/**
 * Collapse affordance beside a dock's inner top corner. Clicking it hides
 * the dock (see `.landmarks__chrome-dock--collapsed`) and hands control to
 * the sibling `PanelPeekTab`.
 */
export function PanelCollapseButton({
  side,
  onCollapse,
}: {
  side: DockSide;
  onCollapse: () => void;
}) {
  const Icon = COLLAPSE_ICON[side];
  const label = side === "left" ? "Collapse left panel" : "Collapse right panel";
  return (
    <TooltipProvider delayDuration={80} skipDelayDuration={0}>
      <ChromeTooltip label={label}>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={label}
          onClick={onCollapse}
          className={cn(
            // Just outside the dock's inner top corner, so it never covers the
            // panel's own header text or tabs.
            "landmarks-float pointer-events-auto absolute top-0 z-[17]",
            chromeHitClass,
            side === "left" ? "left-[calc(100%+0.375rem)]" : "right-[calc(100%+0.375rem)]",
          )}
        >
          <Icon className="size-4" />
        </Button>
      </ChromeTooltip>
    </TooltipProvider>
  );
}

/**
 * Edge tab shown in place of a collapsed dock — click to bring the panel
 * back. Sits above the minimap slot so the left tab never covers it.
 */
export function PanelPeekTab({
  side,
  onExpand,
}: {
  side: DockSide;
  onExpand: () => void;
}) {
  const Icon = EXPAND_ICON[side];
  const label = side === "left" ? "Show left panel" : "Show right panel";
  return (
    <TooltipProvider delayDuration={80} skipDelayDuration={0}>
      <ChromeTooltip label={label}>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={label}
          onClick={onExpand}
          className={cn(
            "landmarks-float landmarks__peek-tab pointer-events-auto",
            chromeHitClass,
            side === "left" ? "landmarks__peek-tab--left" : "landmarks__peek-tab--right",
          )}
        >
          <Icon className="size-4" />
        </Button>
      </ChromeTooltip>
    </TooltipProvider>
  );
}
