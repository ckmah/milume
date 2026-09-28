import {
  cloneElement,
  isValidElement,
  useCallback,
  useState,
  type ComponentType,
  type ReactElement,
  type Ref,
} from "react";
import {
  BoxIcon,
  CircleIcon,
  EllipsisIcon,
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
import { Tooltip as TooltipPrimitive } from "radix-ui";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import { MODE_LABELS, MODE_SHORTCUTS } from "../helpers";

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

/** Caption beside a toolbar control (Labels switch). */
export const TOOLBAR_CAPTION = "landmarks-toolbar-caption";

/** Inverted chrome tooltip (opposite of theme surface). */
const chromeTooltipClass =
  "landmarks-tooltip z-50 w-fit origin-(--radix-tooltip-content-transform-origin) rounded-md border border-transparent px-2.5 py-1 text-xs font-medium text-balance shadow-md";

/** Soft float popover — selection dropdown, layer menus, canvas context. */
export const chromeMenuClass =
  "landmarks-menu z-50 min-w-[9rem] overflow-hidden rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md";

export function ToolbarDivider() {
  return (
    <Separator
      orientation="vertical"
      decorative
      className="landmarks-toolbar-divider"
    />
  );
}

function mergeRefs<T>(...refs: Array<Ref<T> | undefined>) {
  return (value: T) => {
    for (const ref of refs) {
      if (typeof ref === "function") ref(value);
      else if (ref && typeof ref === "object") {
        (ref as { current: T }).current = value;
      }
    }
  };
}

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
  const [container, setContainer] = useState<HTMLElement | null>(null);
  const setTriggerNode = useCallback((node: HTMLElement | null) => {
    setContainer(
      node?.closest(".spatial-rx-widget, .landmarks") as HTMLElement | null,
    );
  }, []);

  const child = isValidElement(children)
    ? cloneElement(children as ReactElement<{ ref?: Ref<HTMLElement> }>, {
        ref: mergeRefs(
          (children as ReactElement<{ ref?: Ref<HTMLElement> }>).props.ref,
          setTriggerNode,
        ),
      })
    : children;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{child}</TooltipTrigger>
      <TooltipPrimitive.Portal container={container ?? undefined}>
        <TooltipPrimitive.Content
          data-slot="tooltip-content"
          side="bottom"
          sideOffset={6}
          className={cn(
            chromeTooltipClass,
            shortcut && "flex items-center gap-3",
          )}
        >
          <span>{label}</span>
          {shortcut ? (
            <span className="landmarks-tooltip-shortcut font-normal tabular-nums">
              {shortcut}
            </span>
          ) : null}
          <TooltipPrimitive.Arrow className="landmarks-tooltip-arrow z-50 size-2.5 translate-y-[calc(-50%_-_2px)] rotate-45 rounded-[2px]" />
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
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
          "landmarks-layer-swatch landmarks-layer-swatch--landmark inline-block shrink-0 rounded-full",
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
          "landmarks-layer-swatch landmarks-layer-swatch--selection inline-block shrink-0 rounded-full",
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
        "landmarks-layer-swatch inline-block shrink-0 rounded-full ring-1 ring-border",
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
        if (next) onChange(next);
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
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(label);
  const hasMenu = !!(onRename || onDelete || onToggleHidden);

  const startRename = () => {
    if (!onRename || disabled) return;
    setDraft(label);
    setEditing(true);
  };

  return (
    <div
      role="listitem"
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
    >
      <ColorSwatch
        color={color}
        variant={swatchVariant}
        fillOpacity={swatchFillOpacity}
        className="landmarks-layer-swatch"
      />
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
      {hasMenu ? (
        <div className="landmarks-trail">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                className="landmarks-trail-hit"
                aria-label="Layer actions"
                onClick={(e) => e.stopPropagation()}
              >
                <EllipsisIcon />
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
                <DropdownMenuItem
                  className="gap-2 text-xs"
                  onSelect={() => onToggleHidden()}
                >
                  {hidden ? (
                    <EyeIcon className="size-3.5" />
                  ) : (
                    <EyeOffIcon className="size-3.5" />
                  )}
                  {hidden ? "Show" : "Hide"}
                </DropdownMenuItem>
              ) : null}
              {onRename ? (
                <DropdownMenuItem
                  className="gap-2 text-xs"
                  onSelect={() => startRename()}
                >
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
      ) : null}
    </div>
  );
}
