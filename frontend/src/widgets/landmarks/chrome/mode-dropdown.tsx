import { ChevronDownIcon } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

import { MODE_LABELS, MODE_SHORTCUTS } from "../helpers";
import {
  ChromeTooltip,
  chromeHitWideClass,
  chromeMenuClass,
  modeIcon,
} from "./primitives";

/** Last-used mode per group (keyed by `modes.join()`), remembered across renders. */
const lastUsedByGroup = new Map<string, string>();

/**
 * Left click arms the last-used mode in `modes` (default `modes[0]`);
 * right click or the chevron opens the menu to pick a specific mode.
 * Shared by the lasso/geometry dropdown ("shape") and the landmark
 * tool dropdown ("landmark").
 */
export function ModeDropdown({
  modes,
  mode,
  onMode,
  fallbackLabel,
  menuNoun,
}: {
  modes: string[];
  mode: string;
  onMode: (mode: string) => void;
  fallbackLabel: string;
  menuNoun: string;
}) {
  const [menuContainer, setMenuContainer] = useState<HTMLElement | null>(null);
  const [open, setOpen] = useState(false);

  if (!modes.length) return null;
  const key = modes.join(",");
  const active = modes.includes(mode);
  const defaultMode = lastUsedByGroup.get(key) ?? modes[0];
  const current = active ? mode : defaultMode;
  const Icon = modeIcon(current);
  const label = MODE_LABELS[current] ?? fallbackLabel;

  const armMode = (next: string) => {
    lastUsedByGroup.set(key, next);
    onMode(next);
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <div className="relative">
        <ChromeTooltip
          label={`${label} · right-click for ${menuNoun}`}
          shortcut={MODE_SHORTCUTS[current]}
        >
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className={chromeHitWideClass}
              aria-label={`${label}. Right-click for ${menuNoun} menu.`}
              aria-pressed={active}
              aria-haspopup="menu"
              ref={(node) => {
                setMenuContainer(
                  node?.closest(
                    ".spatial-rx-widget, .landmarks",
                  ) as HTMLElement | null,
                );
              }}
              onPointerDown={(e) => {
                // Left click: arm the last-used mode only (do not open menu).
                if (e.button === 0) {
                  e.preventDefault();
                  if (!active) armMode(defaultMode);
                }
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setOpen(true);
              }}
            >
              <Icon className="size-4" />
              <ChevronDownIcon className="size-2.5 shrink-0 opacity-70" />
            </Button>
          </DropdownMenuTrigger>
        </ChromeTooltip>
        <DropdownMenuContent
          align="start"
          sideOffset={8}
          container={menuContainer}
          className={chromeMenuClass}
          onCloseAutoFocus={(e) => e.preventDefault()}
        >
          {modes.map((id) => {
            const ItemIcon = modeIcon(id);
            const itemLabel = MODE_LABELS[id] ?? id;
            const isActive = mode === id;
            return (
              <DropdownMenuItem
                key={id}
                className={cn(
                  "gap-2 py-1 text-xs",
                  isActive &&
                    "bg-accent text-accent-foreground focus:bg-accent focus:text-accent-foreground",
                )}
                onSelect={() => armMode(id)}
              >
                <ItemIcon className="size-3.5" />
                <span className="flex-1">{itemLabel}</span>
                {MODE_SHORTCUTS[id] ? (
                  <span className="text-[10px] text-muted-foreground tabular-nums">
                    {MODE_SHORTCUTS[id]}
                  </span>
                ) : null}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </div>
    </DropdownMenu>
  );
}
