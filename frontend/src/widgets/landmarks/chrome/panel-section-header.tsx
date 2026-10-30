import { ChevronDownIcon, ChevronRightIcon, XIcon, type LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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
  minimise = false,
}: {
  icon: LucideIcon;
  label: string;
  count: number;
  open: boolean;
  onToggle: () => void;
  pin?: PanelSectionPin | null;
  testId?: string;
  minimise?: boolean;
}) {
  const Chevron = open ? ChevronDownIcon : ChevronRightIcon;

  return (
    <div
      className={cn(
        "landmarks-panel-section-header",
        open && "landmarks-panel-section-header--open",
      )}
      data-testid={testId}
    >
      <Button
        type="button"
        variant="ghost"
        className="landmarks-panel-section-header__main h-auto w-full justify-start rounded-none px-1 py-0 font-normal"
        aria-expanded={open}
        onClick={onToggle}
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
        <span className="landmarks-panel-section-header__trail">
          <span className="landmarks-panel-section-header__count">{count}</span>
          <Chevron className="landmarks-panel-section-header__chevron" aria-hidden />
        </span>
      </Button>
    </div>
  );
}
