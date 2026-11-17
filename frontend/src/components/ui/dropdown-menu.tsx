import * as React from "react"
import { LayoutGroup, motion, useReducedMotion } from "motion/react"
import { CheckIcon, ChevronRightIcon, CircleIcon } from "lucide-react"
import { DropdownMenu as DropdownMenuPrimitive } from "radix-ui"

import { SpringPanel } from "@/components/ui/spring-popover"
import { MOTION_OFF, SPRING_LAYOUT } from "@/lib/motion-springs"
import { cn } from "@/lib/utils"

import "./motion-overlays.css"

type MenuMotionValue = {
  levelId: string
  activeId: string | null
  setActiveId: React.Dispatch<React.SetStateAction<string | null>>
}

const MenuMotionContext = React.createContext<MenuMotionValue | null>(null)

function MenuMotionProvider({ children }: { children: React.ReactNode }) {
  const levelId = React.useId()
  const [activeId, setActiveId] = React.useState<string | null>(null)
  const value = React.useMemo(
    () => ({ levelId, activeId, setActiveId }),
    [levelId, activeId],
  )
  return (
    <MenuMotionContext.Provider value={value}>
      <LayoutGroup id={levelId}>{children}</LayoutGroup>
    </MenuMotionContext.Provider>
  )
}

function useMenuRow(disabled?: boolean) {
  const ctx = React.useContext(MenuMotionContext)
  const id = React.useId()
  const reduce = useReducedMotion() ?? false
  const onFocus = React.useCallback(() => {
    if (!ctx) return
    if (disabled) {
      ctx.setActiveId((current) => (current === id ? null : current))
      return
    }
    ctx.setActiveId(id)
  }, [ctx, disabled, id])
  const onBlur = React.useCallback(() => {
    ctx?.setActiveId((current) => (current === id ? null : current))
  }, [ctx, id])
  return {
    active: Boolean(ctx && !disabled && ctx.activeId === id),
    layoutId: ctx && !reduce ? `${ctx.levelId}-highlight` : undefined,
    onFocus,
    onBlur,
  }
}

function RowHighlight({
  active,
  layoutId,
  tone = "default",
}: {
  active: boolean
  layoutId?: string
  tone?: "default" | "destructive"
}) {
  const reduce = useReducedMotion() ?? false
  if (!active) return null
  const className = cn(
    "pointer-events-none absolute inset-0 -z-10 rounded-sm",
    tone === "destructive"
      ? "bg-destructive/10 dark:bg-destructive/20"
      : "bg-accent",
  )
  if (!layoutId) return <span aria-hidden className={className} />
  return (
    <motion.span
      aria-hidden
      layoutId={layoutId}
      initial={false}
      transition={reduce ? MOTION_OFF : SPRING_LAYOUT}
      className={className}
    />
  )
}

function DropdownMenu({
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Root>) {
  return <DropdownMenuPrimitive.Root data-slot="dropdown-menu" {...props} />
}

function DropdownMenuPortal({
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Portal>) {
  return (
    <DropdownMenuPrimitive.Portal data-slot="dropdown-menu-portal" {...props} />
  )
}

function DropdownMenuTrigger({
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Trigger>) {
  return (
    <DropdownMenuPrimitive.Trigger
      data-slot="dropdown-menu-trigger"
      {...props}
    />
  )
}

const panelClass =
  "z-50 max-h-(--radix-dropdown-menu-content-available-height) min-w-[8rem] origin-(--radix-dropdown-menu-content-transform-origin) overflow-x-hidden overflow-y-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md"

function DropdownMenuContent({
  className,
  sideOffset = 4,
  container,
  children,
  ref,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Content> & {
  container?: HTMLElement | null
}) {
  return (
    <DropdownMenuPrimitive.Portal container={container ?? undefined}>
      <DropdownMenuPrimitive.Content
        data-slot="dropdown-menu-content"
        sideOffset={sideOffset}
        ref={ref}
        className={cn(panelClass, className)}
        {...props}
        asChild
      >
        <SpringPanel>
          <MenuMotionProvider>{children}</MenuMotionProvider>
        </SpringPanel>
      </DropdownMenuPrimitive.Content>
    </DropdownMenuPrimitive.Portal>
  )
}

function DropdownMenuGroup({
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Group>) {
  return (
    <DropdownMenuPrimitive.Group data-slot="dropdown-menu-group" {...props} />
  )
}

const itemClass =
  "relative isolate flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[inset]:pl-8 data-[variant=destructive]:text-destructive data-[variant=destructive]:focus:text-destructive [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground data-[variant=destructive]:*:[svg]:text-destructive!"

function DropdownMenuItem({
  className,
  inset,
  variant = "default",
  onFocus,
  onBlur,
  disabled,
  children,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Item> & {
  inset?: boolean
  variant?: "default" | "destructive"
}) {
  const row = useMenuRow(disabled)
  return (
    <DropdownMenuPrimitive.Item
      data-slot="dropdown-menu-item"
      data-inset={inset}
      data-variant={variant}
      disabled={disabled}
      className={cn(itemClass, className)}
      onFocus={(event) => {
        onFocus?.(event)
        row.onFocus()
      }}
      onBlur={(event) => {
        onBlur?.(event)
        row.onBlur()
      }}
      {...props}
    >
      <RowHighlight
        active={row.active}
        layoutId={row.layoutId}
        tone={variant}
      />
      {children}
    </DropdownMenuPrimitive.Item>
  )
}

const checkClass =
  "relative isolate flex cursor-default items-center gap-2 rounded-sm py-1.5 pr-2 pl-8 text-sm outline-hidden select-none focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"

function DropdownMenuCheckboxItem({
  className,
  children,
  checked,
  onFocus,
  onBlur,
  disabled,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.CheckboxItem>) {
  const row = useMenuRow(disabled)
  return (
    <DropdownMenuPrimitive.CheckboxItem
      data-slot="dropdown-menu-checkbox-item"
      className={cn(checkClass, className)}
      checked={checked}
      disabled={disabled}
      onFocus={(event) => {
        onFocus?.(event)
        row.onFocus()
      }}
      onBlur={(event) => {
        onBlur?.(event)
        row.onBlur()
      }}
      {...props}
    >
      <RowHighlight active={row.active} layoutId={row.layoutId} />
      <span className="pointer-events-none absolute left-2 flex size-3.5 items-center justify-center">
        <DropdownMenuPrimitive.ItemIndicator>
          <CheckIcon className="size-4" />
        </DropdownMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </DropdownMenuPrimitive.CheckboxItem>
  )
}

function DropdownMenuRadioGroup({
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.RadioGroup>) {
  return (
    <DropdownMenuPrimitive.RadioGroup
      data-slot="dropdown-menu-radio-group"
      {...props}
    />
  )
}

function DropdownMenuRadioItem({
  className,
  children,
  onFocus,
  onBlur,
  disabled,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.RadioItem>) {
  const row = useMenuRow(disabled)
  return (
    <DropdownMenuPrimitive.RadioItem
      data-slot="dropdown-menu-radio-item"
      className={cn(checkClass, className)}
      disabled={disabled}
      onFocus={(event) => {
        onFocus?.(event)
        row.onFocus()
      }}
      onBlur={(event) => {
        onBlur?.(event)
        row.onBlur()
      }}
      {...props}
    >
      <RowHighlight active={row.active} layoutId={row.layoutId} />
      <span className="pointer-events-none absolute left-2 flex size-3.5 items-center justify-center">
        <DropdownMenuPrimitive.ItemIndicator>
          <CircleIcon className="size-2 fill-current" />
        </DropdownMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </DropdownMenuPrimitive.RadioItem>
  )
}

function DropdownMenuLabel({
  className,
  inset,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Label> & {
  inset?: boolean
}) {
  return (
    <DropdownMenuPrimitive.Label
      data-slot="dropdown-menu-label"
      data-inset={inset}
      className={cn(
        "px-2 py-1.5 text-sm font-medium data-[inset]:pl-8",
        className
      )}
      {...props}
    />
  )
}

function DropdownMenuSeparator({
  className,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Separator>) {
  return (
    <DropdownMenuPrimitive.Separator
      data-slot="dropdown-menu-separator"
      className={cn("-mx-1 my-1 h-px bg-border", className)}
      {...props}
    />
  )
}

function DropdownMenuShortcut({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="dropdown-menu-shortcut"
      className={cn(
        "ml-auto text-xs tracking-widest text-muted-foreground",
        className
      )}
      {...props}
    />
  )
}

function DropdownMenuSub({
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Sub>) {
  return <DropdownMenuPrimitive.Sub data-slot="dropdown-menu-sub" {...props} />
}

const subTriggerClass =
  "relative isolate flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none focus:text-accent-foreground data-[inset]:pl-8 data-[state=open]:bg-accent data-[state=open]:text-accent-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground"

function DropdownMenuSubTrigger({
  className,
  inset,
  children,
  onFocus,
  onBlur,
  disabled,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.SubTrigger> & {
  inset?: boolean
}) {
  const row = useMenuRow(disabled)
  return (
    <DropdownMenuPrimitive.SubTrigger
      data-slot="dropdown-menu-sub-trigger"
      data-inset={inset}
      disabled={disabled}
      className={cn(subTriggerClass, className)}
      onFocus={(event) => {
        onFocus?.(event)
        row.onFocus()
      }}
      onBlur={(event) => {
        onBlur?.(event)
        row.onBlur()
      }}
      {...props}
    >
      <RowHighlight active={row.active} layoutId={row.layoutId} />
      {children}
      <ChevronRightIcon className="ml-auto size-4" />
    </DropdownMenuPrimitive.SubTrigger>
  )
}

function DropdownMenuSubContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.SubContent>) {
  return (
    <DropdownMenuPrimitive.SubContent
      data-slot="dropdown-menu-sub-content"
      className={cn(
        "z-50 min-w-[8rem] origin-(--radix-dropdown-menu-content-transform-origin) overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-lg",
        className
      )}
      {...props}
      asChild
    >
      <SpringPanel>
        <MenuMotionProvider>{children}</MenuMotionProvider>
      </SpringPanel>
    </DropdownMenuPrimitive.SubContent>
  )
}

export {
  DropdownMenu,
  DropdownMenuPortal,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
}
