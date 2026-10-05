import { BookmarkCheckIcon, BookmarkPlusIcon, BoxIcon, XIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import { ChromeTooltip, TOOLBAR_CLASS, ToolbarDivider, chromeHitClass, chromeHitTextClass } from "./primitives";
import { FullscreenButton, ZoomControls } from "./topbar";

/** What the open pill may say about the cube. Ready and refining carry no message. */
export type InspectLoad =
  | { readonly state: "refining" }
  | { readonly state: "ready" }
  | { readonly state: "error"; readonly message: string };

export type InspectPillProps = {
  /** False is armed: the hint and the map zoom. True is the quiet window row. */
  open: boolean;
  /** Side length in µm. Shown beside "Inspect" only while open, as "{n} µm". */
  sizeUm: number;
  /** Open-pill chip. Ignored while armed. */
  load: InspectLoad;
  /** Live window matches a saved inspect selection. */
  saved: boolean;
  /** A window exists to save (cx and cy placed). */
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
 * Error keeps `loadError`, including an empty string.
 * Any other load drops `loadError`, so a stale failure cannot show on a settled cube.
 */
export function toInspectLoad(load: InspectLoad["state"], loadError: string): InspectLoad {
  if (load === "error") return { state: "error", message: loadError };
  if (load === "refining") return { state: "refining" };
  return { state: "ready" };
}

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
            <StatusChip load={p.load} />
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
            <span className="landmarks-meta">Click to place</span>
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

/** Stays mounted for the whole open session, including ready, so a later word on this node is announced. */
function StatusChip({ load }: { load: InspectLoad }) {
  return (
    <span
      data-testid="inspect-status"
      data-state={load.state}
      role="status"
      className="landmarks__inspect-status"
      title={load.state === "error" ? load.message : undefined}
    >
      {load.state === "refining" ? (
        <span className="landmarks__shimmer">Refining</span>
      ) : load.state === "error" ? (
        <span className="text-destructive">{load.message}</span>
      ) : null}
    </span>
  );
}
