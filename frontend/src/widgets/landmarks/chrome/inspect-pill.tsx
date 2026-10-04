import { Morph } from "cube-motion/react";
import { BookmarkCheckIcon, BookmarkPlusIcon, BoxIcon, XIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import { ChromeTooltip, TOOLBAR_CLASS, ToolbarDivider, chromeHitClass, chromeHitTextClass } from "./primitives";
import { FullscreenButton, ZoomControls } from "./topbar";

export type InspectPillProps = {
  /** The cube is open (else armed: placing a window). */
  open: boolean;
  sizeUm: number;
  /** The live window centre (µm), or null before one is placed. */
  centre: { x: number; y: number } | null;
  status: "refining" | "ready" | "error";
  statusError: string;
  saved: boolean;
  canSave: boolean;
  fullscreen: boolean;
  onExit: () => void;
  onSave: () => void;
  onToggleFullscreen: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
};

/**
 * The top pill while in Inspect, in place of the tool pill; its dotted outline
 * marks the mode as temporary. Armed (placing a window): a hint, the map's zoom
 * and full screen. Open (the cube shows): the window, its load status, Save and
 * full screen. Exit leaves Inspect.
 */
export function InspectPill(p: InspectPillProps) {
  return (
    <TooltipProvider delayDuration={80} skipDelayDuration={0}>
      <div
        className={cn(TOOLBAR_CLASS, "landmarks__inspect-pill")}
        role="toolbar"
        aria-label="Inspect"
        data-testid="inspect-pill"
        data-placement="top"
        data-state={p.open ? "open" : "armed"}
        onMouseDown={(e) => e.stopPropagation()}
        onWheel={(e) => e.stopPropagation()}
      >
        <ChromeTooltip label="Exit Inspect" shortcut="Esc">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className={chromeHitClass}
            aria-label="Exit Inspect"
            onClick={p.onExit}
          >
            <XIcon className="size-4" />
          </Button>
        </ChromeTooltip>
        <span className="landmarks__inspect-title">
          <BoxIcon aria-hidden className="size-3.5" />
          <span className="font-medium">Inspect</span>
          {p.open ? <span className="landmarks-meta">{Math.round(p.sizeUm)} µm</span> : null}
        </span>
        {p.open ? (
          <>
            {p.centre ? (
              <span className="landmarks-meta tabular-nums" data-testid="inspect-centre">
                {Math.round(p.centre.x)}, {Math.round(p.centre.y)} µm
              </span>
            ) : null}
            <StatusChip status={p.status} error={p.statusError} />
            <ToolbarDivider />
            <Button
              type="button"
              variant="ghost"
              size="xs"
              aria-label="Save window"
              data-saved={String(p.saved)}
              disabled={p.saved || !p.canSave}
              title={p.saved ? "This window is saved" : "Save this window as an inspect selection"}
              className={cn(chromeHitTextClass, "gap-1 px-2")}
              onClick={p.onSave}
            >
              {p.saved ? <BookmarkCheckIcon aria-hidden /> : <BookmarkPlusIcon aria-hidden />}
              {p.saved ? "Saved" : "Save"}
            </Button>
          </>
        ) : (
          <>
            <span className="landmarks-meta">
              Click to place a <span className="landmarks__inspect-hint-size">{Math.round(p.sizeUm)} µm </span>
              window
            </span>
            <ToolbarDivider />
            <ZoomControls onZoomIn={p.onZoomIn} onZoomOut={p.onZoomOut} onReset={p.onResetZoom} />
          </>
        )}
        <ToolbarDivider />
        <FullscreenButton fullscreen={p.fullscreen} onToggle={p.onToggleFullscreen} />
      </div>
    </TooltipProvider>
  );
}

/** The open cube's load: "Refining" (shimmering) crossfades to "Ready"; an error replaces both. */
function StatusChip({ status, error }: { status: "refining" | "ready" | "error"; error: string }) {
  return (
    <span
      data-testid="inspect-status"
      data-state={status}
      role="status"
      className="landmarks__inspect-status"
      title={status === "error" ? error : undefined}
    >
      {status === "error" ? (
        <span className="text-destructive">{error || "Could not load"}</span>
      ) : (
        // The shimmer sits on a span inside the face: Morph cancels every
        // animation on the faces themselves, CSS ones included.
        <Morph active={status === "ready"} off={<span className="landmarks__shimmer">Refining</span>} on="Ready" />
      )}
    </span>
  );
}
