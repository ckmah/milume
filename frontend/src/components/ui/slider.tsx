"use client";

import { Slider as SliderPrimitive } from "@base-ui/react/slider";
import * as React from "react";

import { cn } from "@/lib/utils";

/** Thumb-center offset, matching Base UI edge alignment. */
function insetCenter(value: number, min: number, max: number, track: number, thumb: number) {
  const span = max - min || 1;
  const travel = Math.max(track - thumb, 0);
  return thumb / 2 + travel * ((value - min) / span);
}

/** Fill from `origin` to the thumb. A plain indicator fills from the track start. */
function BipolarRange({
  origin,
  min,
  max,
  value,
}: {
  origin: number;
  min: number;
  max: number;
  value: number;
}) {
  const ref = React.useRef<HTMLSpanElement>(null);
  const [geom, setGeom] = React.useState({ left: 0, width: 0 });

  React.useLayoutEffect(() => {
    const range = ref.current;
    const track = range?.parentElement;
    const control = track?.parentElement;
    if (!track || !control) return;

    const measure = () => {
      const thumb = control.querySelector<HTMLElement>("[data-slot=slider-thumb]");
      if (!thumb) return;
      const trackW = track.getBoundingClientRect().width;
      const thumbW = thumb.getBoundingClientRect().width;
      const a = insetCenter(origin, min, max, trackW, thumbW);
      const b = insetCenter(value, min, max, trackW, thumbW);
      const left = Math.min(a, b);
      const width = Math.abs(b - a);
      setGeom((prev) =>
        Math.abs(prev.left - left) < 0.4 && Math.abs(prev.width - width) < 0.4
          ? prev
          : { left, width },
      );
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(track);
    const thumb = control.querySelector("[data-slot=slider-thumb]");
    if (thumb) observer.observe(thumb);
    return () => observer.disconnect();
  }, [origin, min, max, value]);

  return (
    <span
      ref={ref}
      data-slot="slider-range"
      data-fill="zero"
      className="tact-slider-range"
      style={{ left: geom.left, width: geom.width }}
    />
  );
}

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
  fillFrom,
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
  /** When set on a single thumb, the fill runs from this value to the thumb. */
  fillFrom?: number;
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
          {fillFrom != null && values.length === 1 ? (
            <BipolarRange
              origin={fillFrom}
              min={min}
              max={max}
              value={values[0] ?? fillFrom}
            />
          ) : (
            <SliderPrimitive.Indicator data-slot="slider-range" className="tact-slider-range" />
          )}
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
