/**
 * Soft Float SliderRow chrome — shared by regular + signed (bidirectional) sliders.
 *
 * Extracted so handle / fill / value / hover tokens stay in sync (Impeccable extract).
 * Styles live on `.landmarks-slider-control` in `landmarks.css`; both variants use the
 * same `data-slot` hooks (`slider`, `slider-track`, `slider-range`, `slider-thumb`) and
 * `.landmarks-slider-value`.
 */
import { RotateCcwIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";

import { ChromeTooltip, chromeHitClass } from "./primitives";

/** Reset control — Lucide rotate-ccw, placed immediately right of a Soft Float slider. */
export function SoftFloatSliderReset({
  title,
  onClick,
  testId,
  disabled,
}: {
  title: string;
  onClick: () => void;
  testId?: string;
  disabled?: boolean;
}) {
  return (
    <ChromeTooltip label={title}>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={title}
        disabled={disabled}
        data-testid={testId}
        className={chromeHitClass}
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
      >
        <RotateCcwIcon className="size-4" />
      </Button>
    </ChromeTooltip>
  );
}

/**
 * The one slider row: caption · Soft Float capsule (readout inside, left) ·
 * trailing actions. One value is a single slider; two values are a range whose
 * thumbs Radix names "<aria-label>, minimum" / ", maximum".
 */
export function SoftFloatSliderRow({
  caption,
  value,
  min,
  max,
  step,
  onValueChange,
  onValueCommit,
  readout,
  "aria-label": ariaLabel,
  testId,
  className,
  children,
}: {
  /** Visible label left of the capsule (omit for a bare capsule). */
  caption?: React.ReactNode;
  value: number[];
  min: number;
  max: number;
  step?: number;
  onValueChange: (v: number[]) => void;
  /** Fires once on release (live/commit split for synced traits). */
  onValueCommit?: (v: number[]) => void;
  /** Readout shown inside the capsule. */
  readout: React.ReactNode;
  "aria-label"?: string;
  /** On the capsule (`.landmarks-slider-control`). */
  testId?: string;
  className?: string;
  /** Trailing actions (reset, Both, promote). */
  children?: React.ReactNode;
}) {
  const span = Math.max(max - min, 1e-9);
  return (
    <div className={cn("landmarks-slider-row min-w-0 flex-1", className)}>
      {caption != null ? (
        <Label className="landmarks-slider-caption">{caption}</Label>
      ) : null}
      <div className="landmarks-slider-control" data-testid={testId}>
        <span className="landmarks-slider-value" aria-hidden>
          {readout}
        </span>
        <Slider
          min={min}
          max={max}
          step={step ?? (span / 200 || 0.01)}
          value={value}
          minStepsBetweenThumbs={value.length > 1 ? 0 : undefined}
          onValueChange={onValueChange}
          onValueCommit={onValueCommit}
          aria-label={ariaLabel}
          className="w-full"
        />
      </div>
      {children}
    </div>
  );
}

/** Unidirectional Soft Float capsule (tension, neighborhood radius/k, point buffer, alpha, gamma). */
export function SoftFloatCapsuleSlider({
  value,
  min,
  max,
  step,
  onValueChange,
  displayValue,
  caption,
  "aria-label": ariaLabel,
  testId,
  className,
  onReset,
  resetTitle = "Reset",
  resetTestId,
  children,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  onValueChange: (v: number) => void;
  displayValue: string | number;
  caption?: React.ReactNode;
  "aria-label"?: string;
  testId?: string;
  className?: string;
  /** When set, renders RotateCcw immediately to the right of the capsule. */
  onReset?: () => void;
  resetTitle?: string;
  resetTestId?: string;
  /** Extra trailing actions after the reset. */
  children?: React.ReactNode;
}) {
  return (
    <SoftFloatSliderRow
      caption={caption}
      value={[value]}
      min={min}
      max={max}
      step={step}
      onValueChange={(v) => onValueChange(v[0] ?? min)}
      readout={displayValue}
      aria-label={ariaLabel}
      testId={testId}
      className={className}
    >
      {onReset ? (
        <SoftFloatSliderReset
          title={resetTitle}
          testId={resetTestId}
          onClick={onReset}
        />
      ) : null}
      {children}
    </SoftFloatSliderRow>
  );
}

/**
 * Signed / bidirectional Soft Float capsule.
 * Same chrome tokens as SoftFloatCapsuleSlider; geometry differs (center 0, both thumbs).
 * End labels (−/+) live *inside* the capsule background so the track fill encapsulates
 * the full control (parity with the regular slider).
 */
export function SoftFloatSignedSlider({
  value,
  min = -1,
  max = 1,
  both = false,
  onChange,
  displayValue,
  "aria-label": ariaLabel = "Buffer",
  testId,
  className,
  showEnds,
}: {
  value: number;
  min?: number;
  max?: number;
  both?: boolean;
  onChange: (v: number) => void;
  displayValue?: string;
  "aria-label"?: string;
  testId?: string;
  className?: string;
  /** When omitted, ends show whenever the range is signed (min < 0). */
  showEnds?: boolean;
}) {
  const span = Math.max(max - min, 1e-9);
  const clamped = Math.min(max, Math.max(min, value));
  const absMax = Math.max(Math.abs(min), Math.abs(max), 1e-9);
  const mag = Math.abs(clamped);
  const centerPct = ((0 - min) / span) * 100;
  const thumbPct = ((clamped - min) / span) * 100;
  const snapEps = Math.max(span * 0.02, span / 200);
  const ends = showEnds ?? min < 0;

  let fillLeft: number;
  let fillWidth: number;
  if (both) {
    const half = (mag / absMax) * 50;
    fillLeft = 50 - half;
    fillWidth = half * 2;
  } else if (clamped >= 0) {
    fillLeft = centerPct;
    fillWidth = ((clamped - 0) / span) * 100;
  } else {
    fillLeft = ((clamped - min) / span) * 100;
    fillWidth = ((0 - clamped) / span) * 100;
  }

  const leftThumbPct = both
    ? centerPct - (mag / absMax) * 50
    : clamped < 0
      ? thumbPct
      : null;
  const rightThumbPct = both
    ? centerPct + (mag / absMax) * 50
    : clamped > 0
      ? thumbPct
      : clamped === 0
        ? centerPct
        : null;

  const commit = (raw: number) => {
    let next = Math.min(max, Math.max(min, raw));
    if (Math.abs(next) <= snapEps) next = 0;
    onChange(next);
  };

  const signedHint =
    both || min >= 0
      ? undefined
      : clamped < 0
        ? "negative"
        : clamped > 0
          ? "positive"
          : "zero";

  return (
    <div
      className={cn(
        // Prefer flex-1 from callers over w-full so sibling actions (Both/reset)
        // stay inside the Soft Float toolbar pill instead of overflowing it.
        "landmarks-slider-control landmarks-slider-control--signed group/slider relative flex h-7 min-w-0 flex-1 items-stretch",
        className,
      )}
      data-slot="slider"
      data-testid={testId}
      data-both={both ? "1" : "0"}
      data-signed-side={
        both ? "both" : clamped < 0 ? "neg" : clamped > 0 ? "pos" : "zero"
      }
    >
      {ends ? (
        <span className="landmarks-slider-end" aria-hidden>
          −
        </span>
      ) : null}
      <div
        data-slot="slider-track"
        className="relative min-w-0 flex-1 overflow-hidden rounded-[var(--radius)]"
      >
        {min < 0 ? (
          <div
            className="landmarks-slider-center absolute top-0.5 bottom-0.5 z-[1] w-px bg-foreground/35"
            style={{ left: `${centerPct}%` }}
            data-testid="context-buffer-center"
            aria-hidden
          />
        ) : null}
        <div
          data-slot="slider-range"
          className="absolute inset-y-0 z-[1] rounded-[var(--radius)]"
          style={{
            left: `${Math.max(0, Math.min(100, fillLeft))}%`,
            width: `${Math.max(0, Math.min(100, fillWidth))}%`,
          }}
          aria-hidden
        />
        {leftThumbPct != null ? (
          <div
            data-slot="slider-thumb"
            data-thumb="left"
            className="landmarks-slider-thumb-mark absolute top-1/2 z-[2] -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${Math.max(0, Math.min(100, leftThumbPct))}%` }}
            aria-hidden
          />
        ) : null}
        {rightThumbPct != null &&
        (both || rightThumbPct !== leftThumbPct) ? (
          <div
            data-slot="slider-thumb"
            data-thumb="right"
            className="landmarks-slider-thumb-mark absolute top-1/2 z-[2] -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${Math.max(0, Math.min(100, rightThumbPct))}%` }}
            aria-hidden
          />
        ) : null}
        {displayValue != null ? (
          <span className="landmarks-slider-value z-[2]" aria-hidden>
            {displayValue}
          </span>
        ) : null}
        <input
          type="range"
          min={min}
          max={max}
          step={span / 200 || 0.01}
          value={clamped}
          aria-label={ariaLabel}
          aria-valuetext={
            signedHint ? `${signedHint}, ${mag}` : String(clamped)
          }
          className="absolute inset-0 z-[3] h-full w-full cursor-pointer opacity-0"
          onChange={(e) => commit(Number(e.target.value))}
        />
      </div>
      {ends ? (
        <span className="landmarks-slider-end" aria-hidden>
          +
        </span>
      ) : null}
    </div>
  );
}

/** @deprecated Prefer SoftFloatSignedSlider — kept as alias during migrate. */
export const BidirectionalPillSlider = SoftFloatSignedSlider;
