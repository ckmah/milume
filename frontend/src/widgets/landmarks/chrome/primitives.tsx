import {
  useState,
  type ComponentProps,
  type ComponentType,
  type ReactElement,
  type ReactNode,
} from "react";
import {
  BoxIcon,
  CircleIcon,
  EllipsisVerticalIcon,
  EyeIcon,
  EyeOffIcon,
  HandIcon,
  LassoIcon,
  LocateIcon,
  MousePointer2Icon,
  PencilIcon,
  PentagonIcon,
  ShapesIcon,
  MoveUpRightIcon,
  SplineIcon,
  SplinePointerIcon,
  SquareIcon,
  Trash2Icon,
  type LucideProps,
} from "lucide-react";
import "@/styles/tactical.css";

import { BandPlate } from "@/components/ui/group-rise";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import { MODE_LABELS, MODE_SHORTCUTS } from "../helpers";
import { FLOAT_PANEL } from "./sections";

function FilledCircleIcon(props: LucideProps) {
  return <CircleIcon {...props} fill="currentColor" strokeWidth={0} />;
}

const MODE_ICONS: Record<string, ComponentType<LucideProps>> = {
  select: MousePointer2Icon,
  node: SplinePointerIcon,
  move: HandIcon,
  probe: LocateIcon,
  inspect: BoxIcon,
  selection: LassoIcon,
  lasso: LassoIcon,
  polygon: PentagonIcon,
  rectangle: SquareIcon,
  ellipse: CircleIcon,
  point: FilledCircleIcon,
  line: MoveUpRightIcon,
  spline: SplineIcon,
  shape: PentagonIcon,
};

export function modeIcon(mode: string) {
  return MODE_ICONS[mode] ?? ShapesIcon;
}

/*
 * Chrome tokens (one set for every toolbar). Colours, sizes and states live on
 * `.landmarks` / `.landmarks-toolbar` / `.landmarks-hit` / `.landmarks-chip` in
 * `landmarks.css`; these constants are the only way components opt in.
 */

/** Every toolbar surface: main tools, View CTA, context L1/L2, Inspect bar. */
export const TOOLBAR_CLASS =
  "landmarks-float landmarks-float--toolbar landmarks-toolbar pointer-events-auto";

/** Every icon button / dropdown trigger / toggle item in the chrome. */
export const chromeHitClass = "landmarks-hit";

/** Force the on state (for controls without aria-pressed / data-state="on"). */
export const chromeHitOnClass = "landmarks-hit--on";

/** Icon + chevron hit (dropdown and L2 openers, palette). */
export const chromeHitWideClass = "landmarks-hit landmarks-hit--wide";

/** Text segment hit (camera presets, projection). */
export const chromeHitTextClass = "landmarks-hit landmarks-hit--text";

/** Chips, badges and readout pills: opaque fill + 3:1 edge. */
export const CHIP_CLASS = "landmarks-chip";

/** Caption beside a toolbar control (Adjust section titles, slider captions). */
export const TOOLBAR_CAPTION = "landmarks-toolbar-caption";

/** Inverted chrome tooltip (opposite of theme surface). */
const chromeTooltipClass =
  "landmarks-tooltip z-50 w-fit origin-(--radix-tooltip-content-transform-origin) border border-transparent px-2.5 py-1 text-xs font-medium text-balance shadow-md";

/** Soft float popover — selection dropdown, layer menus, canvas context. */
export const chromeMenuClass =
  "landmarks-menu z-50 min-w-[9rem] overflow-hidden border border-border bg-popover p-1 text-popover-foreground shadow-md";

export function ToolbarDivider() {
  return <span className="landmarks-toolbar-divider inline-block w-2 shrink-0" aria-hidden />;
}

import { useWidgetPortal } from "./widget-portal-context";

export function ChromeTooltip({
  label,
  shortcut,
  children,
}: {
  label: string;
  /** Optional key glyph shown muted on the right (e.g. "V", "⌘C"). */
  shortcut?: string;
  children: ReactElement;
}) {
  const container = useWidgetPortal();

  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent
        container={container}
        side="bottom"
        sideOffset={8}
        className={cn(chromeTooltipClass, shortcut && "flex items-center gap-3")}
      >
        <span>{label}</span>
        {shortcut ? (
          <span className="landmarks-tooltip-shortcut tact-hotkey font-normal">{shortcut}</span>
        ) : null}
      </TooltipContent>
    </Tooltip>
  );
}

type SwatchVariant = "solid" | "landmark" | "selection";

export function ColorSwatch({
  color,
  variant = "solid",
  fillOpacity = 0.25,
  className,
}: {
  color?: string;
  variant?: SwatchVariant;
  fillOpacity?: number;
  className?: string;
}) {
  if (variant === "landmark") {
    const pct = Math.round(Math.min(1, Math.max(0, fillOpacity)) * 100);
    return (
      <span
        className={cn(
          "landmarks-layer-swatch landmarks-layer-swatch--landmark inline-block shrink-0",
          !color && "border-border",
          className,
        )}
        style={
          color
            ? {
                borderColor: color,
                backgroundColor: `color-mix(in srgb, ${color} ${pct}%, transparent)`,
              }
            : undefined
        }
        aria-hidden
      />
    );
  }
  if (variant === "selection") {
    return (
      <span
        className={cn(
          "landmarks-layer-swatch landmarks-layer-swatch--selection inline-block shrink-0",
          !color && "border-border",
          className,
        )}
        style={color ? { borderColor: color } : undefined}
        aria-hidden
      />
    );
  }
  return (
    <span
      className={cn(
        "landmarks-layer-swatch inline-block shrink-0 ring-1 ring-border",
        !color && "bg-muted-foreground/40",
        className,
      )}
      style={color ? { backgroundColor: color } : undefined}
      aria-hidden
    />
  );
}

export function ModeToggle({
  modes,
  value,
  onChange,
}: {
  modes: string[];
  value: string;
  onChange: (mode: string) => void;
}) {
  if (!modes.length) return null;
  return (
    <ToggleGroup
      type="single"
      variant="default"
      size="sm"
      spacing={1}
      value={value || undefined}
      className="landmarks-mode-toggle gap-1"
      onValueChange={(next) => {
        const value = Array.isArray(next) ? next[0] : next;
        if (value) onChange(value);
      }}
    >
      {modes.map((mode) => {
        const Icon = modeIcon(mode);
        const label = MODE_LABELS[mode] ?? mode;
        return (
          <ToggleGroupItem
            key={mode}
            value={mode}
            aria-label={label}
            className={chromeHitClass}
          >
            <ChromeTooltip label={label} shortcut={MODE_SHORTCUTS[mode]}>
              <span className="inline-flex size-full items-center justify-center">
                <Icon className="size-4" />
              </span>
            </ChromeTooltip>
          </ToggleGroupItem>
        );
      })}
    </ToggleGroup>
  );
}

/** Three-slot dock row. Lead is the 32px box, text is the shared column, end is the right edge. */
export function PanelRow({
  lead,
  end,
  children,
  className,
  ...props
}: ComponentProps<"div"> & { lead?: ReactNode; end?: ReactNode }) {
  return (
    <div className={cn("landmarks-panel-row", className)} data-panel-row="" {...props}>
      <div className="landmarks-panel-row__lead" data-panel-lead="">
        {lead}
      </div>
      <div className="landmarks-panel-row__text" data-panel-text="">
        {children}
      </div>
      <div className="landmarks-panel-row__end" data-panel-end="">
        {end}
      </div>
    </div>
  );
}

/** Section shell. Passing `tone` keeps the band positioned and fades its plate. */
export function PanelBand({
  tone,
  className,
  children,
  ...props
}: ComponentProps<"section"> & { tone?: boolean }) {
  return (
    <section
      className={cn(
        "landmarks-panel-section",
        tone !== undefined && "landmarks-panel-band",
        className,
      )}
      data-panel-band={tone ? "shade" : undefined}
      {...props}
    >
      {tone !== undefined ? <BandPlate show={tone} /> : null}
      {children}
    </section>
  );
}

export function LayerRow({
  active,
  color,
  swatchVariant = "solid",
  swatchFillOpacity,
  label,
  hidden,
  disabled,
  onSelect,
  onRename,
  onDelete,
  onToggleHidden,
  menuContainer,
  thumbnail,
  hoverContent,
  testId,
}: {
  active: boolean;
  color?: string;
  swatchVariant?: SwatchVariant;
  swatchFillOpacity?: number;
  label: string;
  hidden?: boolean;
  disabled?: boolean;
  onSelect: (e?: React.MouseEvent) => void;
  onRename?: (next: string) => void;
  onDelete?: () => void;
  onToggleHidden?: () => void;
  menuContainer?: HTMLElement | null;
  /** An image (data URL) shown in place of the colour swatch. */
  thumbnail?: string | null;
  /** A hover card beside the row; mounted only while it is open. */
  hoverContent?: ReactNode;
  testId?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(label);
  const [cardOpen, setCardOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const hasMenu = !!(onRename || onDelete || onToggleHidden);

  const startRename = () => {
    if (!onRename || disabled) return;
    setDraft(label);
    setEditing(true);
  };

  const row = (
    <PanelRow
      role="listitem"
      data-testid={testId}
      aria-current={active || undefined}
      aria-disabled={disabled || undefined}
      className={cn(
        "landmarks-layer-row text-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
        disabled ? "cursor-default opacity-60" : "cursor-pointer",
        active && "landmarks-layer-row--active",
        hidden && "opacity-50",
      )}
      tabIndex={disabled ? -1 : 0}
      onClick={(e) => {
        if (!disabled) onSelect(e);
      }}
      onKeyDown={(e) => {
        if (disabled) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      lead={
        thumbnail ? (
          <img
            data-testid="selection-thumb"
            src={thumbnail}
            alt=""
            className="landmarks-layer-thumb size-7 shrink-0 object-cover"
            style={color ? { borderColor: color } : undefined}
          />
        ) : (
          <ColorSwatch
            color={color}
            variant={swatchVariant}
            fillOpacity={swatchFillOpacity}
            className="landmarks-layer-swatch"
          />
        )
      }
      end={
        hasMenu ? (
          <div className="landmarks-trail">
            <DropdownMenu onOpenChange={setMenuOpen}>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  className="landmarks-trail-hit"
                  aria-label="Layer actions"
                  onClick={(e) => e.stopPropagation()}
                >
                  <EllipsisVerticalIcon />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                side="right"
                align="start"
                sideOffset={6}
                container={menuContainer}
                className={chromeMenuClass}
                onCloseAutoFocus={(e) => e.preventDefault()}
                onClick={(e) => e.stopPropagation()}
              >
                {onToggleHidden ? (
                  <DropdownMenuItem className="gap-2 text-xs" onSelect={() => onToggleHidden()}>
                    {hidden ? <EyeIcon className="size-3.5" /> : <EyeOffIcon className="size-3.5" />}
                    {hidden ? "Show" : "Hide"}
                  </DropdownMenuItem>
                ) : null}
                {onRename ? (
                  <DropdownMenuItem className="gap-2 text-xs" onSelect={() => startRename()}>
                    <PencilIcon className="size-3.5" />
                    Rename
                  </DropdownMenuItem>
                ) : null}
                {onDelete ? (
                  <DropdownMenuItem
                    variant="destructive"
                    className="gap-2 text-xs"
                    onSelect={() => onDelete()}
                  >
                    <Trash2Icon className="size-3.5" />
                    Delete
                  </DropdownMenuItem>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ) : null
      }
    >
      <div className="landmarks-layer-label">
        {editing && onRename ? (
          <Input
            aria-label="Rename layer"
            value={draft}
            className="h-5 text-[11px]"
            autoFocus
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => {
              onRename(draft);
              setEditing(false);
            }}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter") {
                e.preventDefault();
                onRename(draft);
                setEditing(false);
              } else if (e.key === "Escape") {
                e.preventDefault();
                setDraft(label);
                setEditing(false);
              }
            }}
          />
        ) : (
          <span
            className={cn(
              "max-w-full truncate text-[11px] text-foreground",
              active ? "font-medium" : "font-normal",
            )}
            title={label}
            onDoubleClick={(e) => {
              if (!onRename) return;
              e.preventDefault();
              e.stopPropagation();
              startRename();
            }}
          >
            {label}
          </span>
        )}
      </div>
    </PanelRow>
  );

  if (!hoverContent) return row;
  // The card steps aside while the row's menu is open or it is being renamed.
  return (
    <HoverCard
      openDelay={350}
      closeDelay={80}
      open={cardOpen && !menuOpen && !editing}
      onOpenChange={setCardOpen}
    >
      <HoverCardTrigger asChild>{row}</HoverCardTrigger>
      <HoverCardContent
        data-testid="selection-card"
        side="right"
        align="start"
        sideOffset={10}
        collisionPadding={8}
        container={menuContainer}
        className={cn(FLOAT_PANEL, "landmarks__selection-card")}
      >
        {hoverContent}
      </HoverCardContent>
    </HoverCard>
  );
}
