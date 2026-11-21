// Adapted from beUI color-selector (https://beui.dev/components/motion/color-selector).
// Swatch size fits the Layers channel popover. Springs come from motion-springs.

import { LayoutGroup, motion } from "motion/react";
import { type ComponentPropsWithRef, createContext, useContext, useId, useState } from "react";

import { useChromeMotion } from "@/components/ui/reduced-motion";
import { cn } from "@/lib/utils";
import { SPRING_PRESS } from "@/lib/motion-springs";

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
  return (
    <div
      {...props}
      className={cn("landmarks-channel-color-list", className)}
    />
  );
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
  const { gesture } = useChromeMotion();
  if (!context) throw new Error("ColorSelectorItem must be used within ColorSelector");
  const selected = context.value === value;
  const unavailable = disabled || context.disabled;
  return (
    <motion.label
      tabIndex={-1}
      data-checked={selected ? "true" : "false"}
      whileTap={unavailable ? undefined : gesture({ scale: 0.98 })}
      transition={SPRING_PRESS}
      className={cn(
        "landmarks-channel-color-option relative",
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
        className={cn("landmarks-channel-color-swatch", className)}
        style={{ backgroundColor: color }}
      />
      <span className="min-w-0 truncate">{label}</span>
    </motion.label>
  );
}
