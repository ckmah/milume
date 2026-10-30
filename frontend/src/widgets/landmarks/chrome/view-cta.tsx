import { useState } from "react";
import { Morph } from "cube-motion/react";
import { CircleDot, Grid2x2, MinusIcon, PlusIcon, Ruler } from "lucide-react";

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
  const [popNonce, setPopNonce] = useState(0);

  const onToggle = () => {
    lm.setRenderMode(rasterOn ? "points" : "raster");
    setPopNonce((n) => n + 1);
  };

  const minimiseLabel = minimise ? "Show panels" : "Minimize panels";

  return (
    <TooltipProvider delayDuration={80} skipDelayDuration={0}>
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
            <Morph
              key={popNonce || "idle"}
              active={rasterOn}
              className="inline-flex size-4 items-center justify-center"
              off={<CircleDot className="size-4" data-testid="view-cta-icon-points" />}
              on={<Grid2x2 className="size-4" data-testid="view-cta-icon" />}
            />
          </Button>
        </ChromeTooltip>
        <ChromeTooltip label={minimiseLabel} shortcut="Shift+\\">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={minimiseLabel}
            aria-pressed={minimise}
            data-testid="toggle-minimise-panels"
            onClick={onToggleMinimise}
            className={cn(chromeHitClass, minimise && chromeHitOnClass)}
          >
            <span className="landmarks-view-minimise-box" aria-hidden>
              {minimise ? (
                <PlusIcon className="size-3" />
              ) : (
                <MinusIcon className="size-3" />
              )}
            </span>
          </Button>
        </ChromeTooltip>
      </div>
    </TooltipProvider>
  );
}
