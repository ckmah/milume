import { CircleDot, Grid2x2, Ruler, SquareMinus, SquarePlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import type { LandmarksModel } from "../use-landmarks-model";
import {
  ChromeTooltip,
  TOOLBAR_CLASS,
  chromeHitClass,
  chromeHitOnClass,
} from "./primitives";

/**
 * Soft Float View CTA — top-right. Points↔Raster toggle, rulers, minimise panels.
 */
export function ViewCta({
  lm,
  minimise,
  onToggleMinimise,
}: {
  lm: LandmarksModel;
  minimise: boolean;
  onToggleMinimise: () => void;
}) {
  const rasterOn = (lm.render_mode || "points") === "raster";
  const rulersOn = !!lm.show_rulers;
  const onToggle = () => {
    lm.setRenderMode(rasterOn ? "points" : "raster");
  };

  const minimiseLabel = minimise ? "Show panels" : "Minimize panels";

  return (
    <TooltipProvider delayDuration={80}>
      <div
        className={TOOLBAR_CLASS}
        data-testid="view-cta"
      >
        <ChromeTooltip label="Canvas rulers">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            role="switch"
            aria-checked={rulersOn}
            aria-label="Canvas rulers"
            data-testid="toggle-rulers"
            onClick={() => lm.setShowRulers(!rulersOn)}
            className={cn(chromeHitClass, rulersOn && chromeHitOnClass)}
          >
            <Ruler className="size-4" />
          </Button>
        </ChromeTooltip>
        <ChromeTooltip label="points/raster">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            role="switch"
            aria-checked={rasterOn}
            aria-label="points/raster"
            onClick={onToggle}
            className={cn(chromeHitClass, "landmarks-view-cta")}
          >
            <span className="inline-flex size-4 items-center justify-center">
              {rasterOn ? (
                <Grid2x2 className="size-4" data-testid="view-cta-icon" />
              ) : (
                <CircleDot className="size-4" data-testid="view-cta-icon-points" />
              )}
            </span>
          </Button>
        </ChromeTooltip>
        <ChromeTooltip label={minimiseLabel} shortcut="Shift+\\">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={minimiseLabel}
            data-testid="toggle-minimise-panels"
            onClick={onToggleMinimise}
            className={cn(chromeHitClass, "landmarks-view-minimise-toggle")}
          >
            {minimise ? (
              <SquarePlus className="size-4" strokeWidth={2} aria-hidden />
            ) : (
              <SquareMinus className="size-4" strokeWidth={2} aria-hidden />
            )}
          </Button>
        </ChromeTooltip>
      </div>
    </TooltipProvider>
  );
}
