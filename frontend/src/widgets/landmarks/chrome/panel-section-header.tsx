import { ChevronRightIcon, XIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { GroupChevron } from "@/components/ui/group-rise";
import { cn } from "@/lib/utils";

import { chromeHitClass, PanelRow } from "./primitives";

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
  label,
  open,
  onToggle,
  pin,
  action,
  testId,
  minimise = false,
}: {
  label: string;
  open: boolean;
  onToggle: () => void;
  pin?: PanelSectionPin | null;
  action?: ReactNode;
  testId?: string;
  minimise?: boolean;
}) {
  return (
    <PanelRow
      className={cn(
        "landmarks-panel-section-header",
        open && "landmarks-panel-section-header--open",
      )}
      data-testid={testId}
      lead={
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className={cn(
            "landmarks-panel-section-header__toggle landmarks-cat-chevron shrink-0 hover:bg-transparent",
            chromeHitClass,
          )}
          aria-expanded={open}
          aria-label={open ? `Collapse ${label}` : `Expand ${label}`}
          onClick={onToggle}
        >
          <GroupChevron open={open}>
            <ChevronRightIcon
              className="landmarks-cat-chevron-icon landmarks-panel-section-header__chevron"
              aria-hidden
            />
          </GroupChevron>
        </Button>
      }
      end={
        <>
          {action}
        </>
      }
    >
      <PanelSectionHeaderMain
        label={label}
        open={open}
        pin={pin}
        minimise={minimise}
        onToggle={onToggle}
      />
    </PanelRow>
  );
}

function PanelSectionHeaderMain({
  label,
  open,
  pin,
  minimise,
  onToggle,
}: {
  label: string;
  open: boolean;
  pin?: PanelSectionPin | null;
  minimise?: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      className="landmarks-panel-section-header__main min-w-0 flex-1"
      aria-expanded={open}
      onClick={onToggle}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onToggle();
        }
      }}
    >
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
