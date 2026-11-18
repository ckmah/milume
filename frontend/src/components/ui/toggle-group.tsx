"use client";

import { Toggle as TogglePrimitive } from "@base-ui/react/toggle";
import { ToggleGroup as ToggleGroupPrimitive } from "@base-ui/react/toggle-group";
import { type VariantProps } from "class-variance-authority";
import * as React from "react";

import { toggleVariants } from "@/components/ui/toggle";
import { cn } from "@/lib/utils";

const ToggleGroupContext = React.createContext<
  VariantProps<typeof toggleVariants> & { multiple: boolean }
>({ size: "default", variant: "default", multiple: false });

function toArray(value: unknown): string[] | undefined {
  if (value == null) return undefined;
  return Array.isArray(value) ? value.map(String) : [String(value)];
}

function ToggleGroup({
  className,
  variant,
  size,
  spacing: _spacing,
  type,
  multiple,
  value,
  defaultValue,
  onValueChange,
  children,
  ...props
}: Omit<ToggleGroupPrimitive.Props<string>, "value" | "defaultValue" | "onValueChange" | "multiple"> &
  VariantProps<typeof toggleVariants> & {
    type?: "single" | "multiple";
    spacing?: number;
    multiple?: boolean;
    value?: string | readonly string[];
    defaultValue?: string | readonly string[];
    onValueChange?: (value: string | string[]) => void;
  }) {
  const isMulti = multiple ?? type === "multiple";
  return (
    <ToggleGroupPrimitive
      data-slot="toggle-group"
      role={isMulti ? "group" : "radiogroup"}
      multiple={isMulti}
      value={toArray(value)}
      defaultValue={toArray(defaultValue)}
      onValueChange={(next) => {
        onValueChange?.(isMulti ? next : (next[0] ?? ""));
      }}
      className={cn("tact-toggle-group flex items-center", className)}
      {...props}
    >
      <ToggleGroupContext.Provider value={{ variant, size, multiple: isMulti }}>
        {children}
      </ToggleGroupContext.Provider>
    </ToggleGroupPrimitive>
  );
}

function ToggleGroupItem({
  className,
  children,
  variant,
  size,
  ...props
}: TogglePrimitive.Props & VariantProps<typeof toggleVariants>) {
  const ctx = React.useContext(ToggleGroupContext);
  return (
    <TogglePrimitive
      data-slot="toggle-group-item"
      className={cn(
        toggleVariants({ variant: variant ?? ctx.variant, size: size ?? ctx.size }),
        "tact-toggle",
        className,
      )}
      {...props}
      render={(renderProps, state) => (
        <button
          {...renderProps}
          role={ctx.multiple ? renderProps.role : "radio"}
          aria-checked={state.pressed}
          data-state={state.pressed ? "on" : "off"}
        >
          {children}
        </button>
      )}
    />
  );
}

export { ToggleGroup, ToggleGroupItem };
