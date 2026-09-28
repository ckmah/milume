import {
  Maximize2Icon,
  MaximizeIcon,
  MinimizeIcon,
  MinusIcon,
  PlusIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { TooltipProvider } from "@/components/ui/tooltip";

import {
  INTERACTION_MODE_IDS,
  GEOMETRY_MODE_IDS,
  LANDMARK_MODE_IDS,
  interactionFromMode,
} from "../helpers";
import { ModeDropdown } from "./mode-dropdown";
import {
  ChromeTooltip,
  ModeToggle,
  TOOLBAR_CLASS,
  ToolbarDivider,
  chromeHitClass,
} from "./primitives";

export function Topbar({
  modes,
  mode,
  onMode,
  fullscreen,
  onToggleFullscreen,
  onZoomIn,
  onZoomOut,
  onReset,
}: {
  modes: string[];
  mode: string;
  onMode: (mode: string) => void;
  fullscreen: boolean;
  onToggleFullscreen: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
}) {
  const interactionModes = INTERACTION_MODE_IDS.filter((id) =>
    modes.includes(id),
  );
  const landmarkModes = modes.filter((m) => LANDMARK_MODE_IDS.includes(m));
  const geometryModes = GEOMETRY_MODE_IDS.filter((m) => modes.includes(m));
  const interactionValue = interactionFromMode(mode);

  const fullscreenLabel = fullscreen ? "Exit full screen" : "Full screen";

  return (
    <TooltipProvider delayDuration={80} skipDelayDuration={0}>
      <div
        className={TOOLBAR_CLASS}
        role="toolbar"
        aria-label="Drawing tools"
        onMouseDown={(e) => e.stopPropagation()}
        onWheel={(e) => e.stopPropagation()}
      >
        {interactionModes.length ? (
          <ModeToggle
            modes={interactionModes}
            value={interactionValue}
            onChange={onMode}
          />
        ) : null}
        {geometryModes.length || landmarkModes.length ? (
          <ToolbarDivider />
        ) : null}
        {geometryModes.length ? (
          <ModeDropdown
            modes={geometryModes}
            mode={mode}
            onMode={onMode}
            fallbackLabel="Lasso"
            menuNoun="shape"
          />
        ) : null}
        {landmarkModes.length ? (
          <ModeDropdown
            modes={landmarkModes}
            mode={mode}
            onMode={onMode}
            fallbackLabel="Point"
            menuNoun="landmark"
          />
        ) : null}
        <ToolbarDivider />
        <ChromeTooltip label="Zoom in" shortcut="=">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className={chromeHitClass}
            aria-label="Zoom in"
            onClick={(e) => {
              e.stopPropagation();
              onZoomIn();
            }}
          >
            <PlusIcon className="size-4" />
          </Button>
        </ChromeTooltip>
        <ChromeTooltip label="Zoom out" shortcut="-">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className={chromeHitClass}
            aria-label="Zoom out"
            onClick={(e) => {
              e.stopPropagation();
              onZoomOut();
            }}
          >
            <MinusIcon className="size-4" />
          </Button>
        </ChromeTooltip>
        <ChromeTooltip label="Reset view" shortcut="0">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className={chromeHitClass}
            aria-label="Reset view"
            onClick={(e) => {
              e.stopPropagation();
              onReset();
            }}
          >
            <Maximize2Icon className="size-4" />
          </Button>
        </ChromeTooltip>
        <ToolbarDivider />
        <ChromeTooltip label={fullscreenLabel} shortcut="F">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className={chromeHitClass}
            aria-label={fullscreenLabel}
            aria-pressed={fullscreen}
            onClick={onToggleFullscreen}
          >
            {fullscreen ? (
              <MinimizeIcon className="size-4" />
            ) : (
              <MaximizeIcon className="size-4" />
            )}
          </Button>
        </ChromeTooltip>
      </div>
    </TooltipProvider>
  );
}
