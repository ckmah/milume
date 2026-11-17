import { ChevronDownIcon, ChevronRightIcon, XIcon, type LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { chromeHitClass } from "./primitives";
import { PANEL_INSET } from "./sections";

export type PanelSectionPin = {
  label: string;
  color: string;
  onClear: () => void;
  clearLabel: string;
};

/**
 * Fixed 32px accordion header for the left dock (Selections / Landmarks / Layers).
 */
export function PanelSectionHeader({
  icon: Icon,
  label,
  count,
  open,
  onToggle,
  pin,
  testId,
  controlsId,
  minimise = false,
}: {
  icon: LucideIcon;
  label: string;
  count: number;
  open: boolean;
  onToggle: () => void;
  pin?: PanelSectionPin | null;
  testId?: string;
  /** Id of the SpringCollapse this header opens. */
  controlsId?: string;
  minimise?: boolean;
}) {
  const Chevron = open ? ChevronDownIcon : ChevronRightIcon;

  return (
    <div
      className={cn(
        "landmarks-panel-section-header",
        PANEL_INSET,
        open && "landmarks-panel-section-header--open",
      )}
      data-testid={testId}
    >
      <PanelSectionHeaderMain
        Icon={Icon}
        label={label}
        open={open}
        pin={pin}
        minimise={minimise}
        controlsId={controlsId}
        onToggle={onToggle}
      />
      <div className="landmarks-panel-section-header__trail">
        <span className="landmarks-panel-section-header__count">{count}</span>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className={cn(
            "landmarks-panel-section-header__toggle shrink-0 rounded-full hover:bg-transparent",
            chromeHitClass,
          )}
          aria-expanded={open}
          aria-controls={controlsId}
          aria-label={open ? `Collapse ${label}` : `Expand ${label}`}
          onClick={onToggle}
        >
          <Chevron className="landmarks-panel-section-header__chevron" aria-hidden />
        </Button>
      </div>
    </div>
  );
}

function PanelSectionHeaderMain({
  Icon,
  label,
  open,
  pin,
  minimise,
  controlsId,
  onToggle,
}: {
  Icon: LucideIcon;
  label: string;
  open: boolean;
  pin?: PanelSectionPin | null;
  minimise?: boolean;
  controlsId?: string;
  onToggle: () => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      className="landmarks-panel-section-header__main min-w-0 flex-1"
      aria-expanded={open}
      aria-controls={controlsId}
      onClick={onToggle}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onToggle();
        }
      }}
    >
      <Icon className="landmarks-panel-section-header__icon" aria-hidden />
      <span className="landmarks-panel-section-header__label">{label}</span>
      {pin && (!open || minimise) ? (
        <span
          className="landmarks-panel-section-header__pin"
          onClick={(e) => e.stopPropagation()}
        >
          <span
            className="landmarks-panel-section-header__pin-dot"
            style={{ backgroundColor: pin.color }}
            aria-hidden
          />
          <span className="landmarks-panel-section-header__pin-label">{pin.label}</span>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="landmarks-panel-section-header__pin-clear"
            aria-label={pin.clearLabel}
            onClick={(e) => {
              e.stopPropagation();
              pin.onClear();
            }}
          >
            <XIcon className="size-3" />
          </Button>
        </span>
      ) : null}
    </div>
  );
}
