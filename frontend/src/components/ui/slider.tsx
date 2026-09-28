"use client"

import * as React from "react"
import { Slider as SliderPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

/**
 * Capsule value slider — track is the outer bar; range fills it flush so the
 * thumb (Radix-centered on the value) stays locked to the fill's leading edge.
 * Soft Float / equal outer gutter live on `.landmarks-slider-control` in CSS.
 */
function Slider({
  className,
  defaultValue,
  value,
  min = 0,
  max = 100,
  ...props
}: React.ComponentProps<typeof SliderPrimitive.Root>) {
  const resolvedDefault = defaultValue ?? [min]
  const _values = React.useMemo(
    () =>
      Array.isArray(value)
        ? value
        : Array.isArray(resolvedDefault)
          ? resolvedDefault
          : [min],
    [value, resolvedDefault, min]
  )
  // Radix names thumbs from their own props only; name them after the slider.
  const label = props["aria-label"]
  const thumbLabel = (index: number) =>
    label && _values.length === 2
      ? `${label}, ${index === 0 ? "minimum" : "maximum"}`
      : label

  return (
    <SliderPrimitive.Root
      data-slot="slider"
      defaultValue={value == null ? resolvedDefault : undefined}
      value={value}
      min={min}
      max={max}
      className={cn(
        "group/slider relative flex h-7 w-full touch-none items-center select-none",
        "data-[disabled]:opacity-50",
        "data-[orientation=vertical]:h-full data-[orientation=vertical]:min-h-44 data-[orientation=vertical]:w-auto data-[orientation=vertical]:flex-col",
        className
      )}
      {...props}
    >
      <SliderPrimitive.Track
        data-slot="slider-track"
        className={cn(
          "relative h-full w-full grow overflow-hidden rounded-[var(--radius)] bg-muted",
          "data-[orientation=vertical]:w-full"
        )}
      >
        <SliderPrimitive.Range
          data-slot="slider-range"
          className={cn(
            "absolute rounded-[calc(var(--radius)-1px)] bg-primary",
            "data-[orientation=horizontal]:inset-y-0 data-[orientation=horizontal]:h-full",
            "data-[orientation=vertical]:inset-x-0 data-[orientation=vertical]:w-full"
          )}
        />
      </SliderPrimitive.Track>
      {Array.from({ length: _values.length }, (_, index) => (
        <SliderPrimitive.Thumb
          data-slot="slider-thumb"
          key={index}
          aria-label={thumbLabel(index)}
          className={cn(
            "block shrink-0 rounded-full border-0 bg-foreground shadow-none outline-hidden",
            /* Fixed 2px line; height only on hover — never change width */
            "w-0.5 opacity-0",
            "data-[orientation=horizontal]:h-2.5",
            "data-[orientation=vertical]:h-0.5 data-[orientation=vertical]:w-2.5",
            "transition-[height,opacity,background-color,box-shadow] duration-150 ease-out",
            "group-hover/slider:opacity-100",
            "group-hover/slider:data-[orientation=horizontal]:h-3.5",
            "group-hover/slider:data-[orientation=vertical]:w-3.5",
            "group-focus-within/slider:opacity-100",
            "group-focus-within/slider:data-[orientation=horizontal]:h-3.5",
            "group-focus-within/slider:data-[orientation=vertical]:w-3.5",
            "active:data-[orientation=horizontal]:h-4",
            "active:data-[orientation=vertical]:w-4",
            "focus-visible:ring-2 focus-visible:ring-ring/45",
            "disabled:pointer-events-none disabled:opacity-50",
            "[transform:var(--radix-slider-thumb-transform)]"
          )}
        />
      ))}
    </SliderPrimitive.Root>
  )
}

export { Slider }
