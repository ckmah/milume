import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import { TooltipProvider } from "@/components/ui/tooltip";

import { ChromeTooltip, chromeHitClass } from "./primitives";

type DockSide = "left" | "right";

/**
 * Caret outside the dock's inner top corner (option 1). Stays visible in minimise mode.
 */
export function PanelCollapseButton({
  side,
  onCollapse,
}: {
  side: DockSide;
  onCollapse: () => void;
}) {
  const glyph = side === "left" ? "‹" : "›";
  const label = side === "left" ? "Collapse left panel" : "Collapse right panel";
  return (
    <TooltipProvider delayDuration={80} skipDelayDuration={0}>
      <ChromeTooltip label={label}>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={label}
          data-testid={`panel-collapse-caret-${side}`}
          onClick={onCollapse}
          className={cn(
            "landmarks-panel-collapse-caret landmarks-float pointer-events-auto absolute top-0 z-[17] tabular-nums",
            chromeHitClass,
            side === "left" ? "left-[calc(100%+0.375rem)]" : "right-[calc(100%+0.375rem)]",
          )}
        >
          <span className="landmarks-panel-collapse-caret__glyph" aria-hidden>
            {glyph}
          </span>
        </Button>
      </ChromeTooltip>
    </TooltipProvider>
  );
}

/**
 * Flipped edge tab when a dock is fully collapsed off-screen.
 */
export function PanelPeekTab({
  side,
  onExpand,
}: {
  side: DockSide;
  onExpand: () => void;
}) {
  const glyph = side === "left" ? "›" : "‹";
  const label = side === "left" ? "Show left panel" : "Show right panel";
  return (
    <TooltipProvider delayDuration={80} skipDelayDuration={0}>
      <ChromeTooltip label={label}>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={label}
          data-testid={`panel-peek-tab-${side}`}
          onClick={onExpand}
          className={cn(
            "landmarks-float landmarks__peek-tab pointer-events-auto tabular-nums",
            chromeHitClass,
            side === "left" ? "landmarks__peek-tab--left" : "landmarks__peek-tab--right",
          )}
        >
          <span className="landmarks__peek-tab-glyph" aria-hidden>
            {glyph}
          </span>
        </Button>
      </ChromeTooltip>
    </TooltipProvider>
  );
}
