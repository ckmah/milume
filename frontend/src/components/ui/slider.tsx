"use client";

import { Slider as SliderPrimitive } from "@base-ui/react/slider";
import * as React from "react";

import { cn } from "@/lib/utils";

function Slider({
  className,
  defaultValue,
  value,
  min = 0,
  max = 100,
  onValueChange,
  onValueCommit,
  minStepsBetweenThumbs,
  getAriaValueText,
  thumbLabel,
  "aria-label": ariaLabel,
  ...props
}: Omit<
  React.ComponentProps<typeof SliderPrimitive.Root>,
  "onValueChange" | "onValueCommitted" | "defaultValue" | "value"
> & {
  defaultValue?: number | readonly number[];
  value?: number | readonly number[];
  onValueChange?: (value: number[]) => void;
  onValueCommit?: (value: number[]) => void;
  minStepsBetweenThumbs?: number;
  getAriaValueText?: (value: number, index: number) => string;
  /** Per-thumb accessible name. A range uses "…, minimum" and "…, maximum". */
  thumbLabel?: (index: number) => string;
}) {
  const resolved = value ?? defaultValue ?? [min];
  const values = Array.isArray(resolved) ? resolved : [resolved as number];

  return (
    <SliderPrimitive.Root
      className={cn("tact-slider data-horizontal:w-full", className)}
      data-slot="slider"
      defaultValue={defaultValue}
      value={value}
      min={min}
      max={max}
      aria-label={ariaLabel}
      thumbAlignment="edge"
      minStepsBetweenValues={minStepsBetweenThumbs}
      onValueChange={(next) => {
        const arr = (Array.isArray(next) ? [...next] : [next]) as number[];
        onValueChange?.(arr);
      }}
      onValueCommitted={(next) => {
        const arr = (Array.isArray(next) ? [...next] : [next]) as number[];
        onValueCommit?.(arr);
      }}
      {...props}
    >
      <SliderPrimitive.Control className="tact-slider-control">
        <SliderPrimitive.Track data-slot="slider-track" className="tact-slider-track">
          <SliderPrimitive.Indicator data-slot="slider-range" className="tact-slider-range" />
        </SliderPrimitive.Track>
        {values.map((_, index) => (
          <SliderPrimitive.Thumb
            key={index}
            data-slot="slider-thumb"
            className="tact-slider-thumb"
            aria-label={thumbLabel ? thumbLabel(index) : ariaLabel}
            getAriaValueText={
              getAriaValueText
                ? (_formatted, val, thumbIndex) => getAriaValueText(val, thumbIndex)
                : undefined
            }
          />
        ))}
      </SliderPrimitive.Control>
    </SliderPrimitive.Root>
  );
}

export { Slider };
