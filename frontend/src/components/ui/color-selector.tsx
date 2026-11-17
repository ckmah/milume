// Adapted from beUI color-selector (https://beui.dev/components/motion/color-selector).
// Swatch size fits the Layers channel popover. Springs come from motion-springs.

import { LayoutGroup, motion, useReducedMotion } from "motion/react";
import { type ComponentPropsWithRef, createContext, useContext, useId, useState } from "react";

import { cn } from "@/lib/utils";
import { SPRING_LAYOUT, SPRING_PRESS } from "@/lib/motion-springs";

type ColorSelectorContextValue = {
  value: string;
  select: (value: string) => void;
  name: string;
  disabled: boolean;
};

const ColorSelectorContext = createContext<ColorSelectorContextValue | null>(null);

export function ColorSelector({
  value,
  defaultValue = "",
  onValueChange,
  name,
  disabled = false,
  className,
  children,
  ...props
}: Omit<ComponentPropsWithRef<"fieldset">, "onChange" | "defaultValue"> & {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  name?: string;
}) {
  const id = useId();
  const [internal, setInternal] = useState(defaultValue);
  const current = value ?? internal;
  return (
    <ColorSelectorContext.Provider
      value={{
        value: current,
        select: (next) => {
          if (next === current) return;
          if (value === undefined) setInternal(next);
          onValueChange?.(next);
        },
        name: name ?? id,
        disabled,
      }}
    >
      <fieldset {...props} disabled={disabled} className={cn("min-w-0 border-0 p-0", className)}>
        <LayoutGroup id={id}>{children}</LayoutGroup>
      </fieldset>
    </ColorSelectorContext.Provider>
  );
}

export function ColorSelectorList({ className, ...props }: ComponentPropsWithRef<"div">) {
  return <div {...props} className={cn("grid grid-cols-4 gap-2 p-0.5", className)} />;
}

export function ColorSelectorItem({
  value,
  color,
  label,
  disabled = false,
  className,
  onChange,
  ...props
}: Omit<ComponentPropsWithRef<"input">, "type" | "value" | "children" | "size"> & {
  value: string;
  color: string;
  label: string;
}) {
  const context = useContext(ColorSelectorContext);
  const reduce = useReducedMotion();
  if (!context) throw new Error("ColorSelectorItem must be used within ColorSelector");
  const selected = context.value === value;
  const unavailable = disabled || context.disabled;
  return (
    <motion.label
      tabIndex={-1}
      whileTap={reduce || unavailable ? undefined : { scale: 0.94 }}
      transition={SPRING_PRESS}
      className={cn(
        "relative inline-flex size-7 shrink-0 justify-self-center rounded-full",
        unavailable ? "cursor-not-allowed opacity-40" : "cursor-pointer",
      )}
    >
      <input
        {...props}
        type="radio"
        name={context.name}
        value={value}
        checked={selected}
        disabled={unavailable}
        aria-label={label}
        onChange={(event) => {
          onChange?.(event);
          if (!event.defaultPrevented) context.select(value);
        }}
        className="peer absolute inset-0 z-10 m-0 cursor-pointer opacity-0"
      />
      <span
        aria-hidden
        className={cn(
          "pointer-events-none relative flex size-full items-center justify-center rounded-full border border-foreground/10",
          "peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring",
          className,
        )}
      >
        {selected ? (
          <motion.span
            layoutId={reduce ? undefined : "color-selection"}
            initial={false}
            transition={reduce ? { duration: 0 } : SPRING_LAYOUT}
            className="pointer-events-none absolute -inset-0.5 rounded-full border-2 border-foreground"
          />
        ) : null}
        <span
          className="pointer-events-none size-4 rounded-full border border-black/10"
          style={{ backgroundColor: color }}
        />
      </span>
    </motion.label>
  );
}
