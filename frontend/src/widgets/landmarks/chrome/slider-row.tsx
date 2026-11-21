/**
 * Slider rows for scalar and range controls. The track is the neutral ink bar.
 */
import { RotateCcwIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";

import { TooltipProvider } from "@/components/ui/tooltip";

import { FIELD_CAPTION } from "./sections";
import { ChromeTooltip, chromeHitClass } from "./primitives";
import { decimalStep, formatSliderReadout } from "./slider-readout";

function sliderLabel(caption: React.ReactNode, ariaLabel?: string): string {
  if (typeof caption === "string" && caption.trim()) return caption;
  if (typeof caption === "number") return String(caption);
  if (ariaLabel) return ariaLabel;
  return "Value";
}

function SliderCaption({ text, hint }: { text: string; hint?: string }) {
  const caption = <span className="landmarks-slider-caption">{text}</span>;
  if (!hint) return caption;
  return (
    <TooltipProvider delay={80}>
      <ChromeTooltip label={hint}>{caption}</ChromeTooltip>
    </TooltipProvider>
  );
}

function SliderRow({
  label,
  ariaLabel,
  hint,
  ends = false,
  inline = false,
  value,
  min,
  max,
  step,
  onChange,
  className,
  testId,
  disabled = false,
  formatValue,
}: {
  label: string;
  ariaLabel?: string;
  hint?: string;
  /** Minus and plus marks at the ends of a signed track. */
  ends?: boolean;
  /** Label, track, and readout on one line. The label ellipsizes past its max width. */
  inline?: boolean;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  className?: string;
  testId?: string;
  disabled?: boolean;
  formatValue?: (value: number) => string;
}) {
  const readout = formatValue ? formatValue(value) : formatSliderReadout(value, step);
  const bipolar = min < 0 && max > 0;
  const caption = inline ? (
    <span className="landmarks-slider-caption" title={label}>
      {label}
    </span>
  ) : (
    <SliderCaption text={label} hint={hint} />
  );
  const control = (
    <div className="landmarks-slider-control relative w-full">
      {ends && bipolar ? (
        <span className="landmarks-slider-ends" aria-hidden>
          <span>−</span>
          <span>+</span>
        </span>
      ) : null}
      <Slider
        aria-label={ariaLabel ?? label}
        min={min}
        max={max}
        step={step}
        value={[value]}
        disabled={disabled}
        fillFrom={bipolar ? 0 : undefined}
        getAriaValueText={(next) =>
          formatValue ? formatValue(next) : formatSliderReadout(next, step)
        }
        onValueChange={(next) => onChange(next[0] ?? value)}
      />
    </div>
  );
  return (
    <div
      className={cn(
        "landmarks-slider-row min-w-0 flex-1",
        inline && "landmarks-slider-row--inline",
        disabled && "landmarks-slider-row--disabled",
        className,
      )}
      data-testid={testId}
      data-disabled={disabled ? "true" : undefined}
    >
      {inline ? (
        <>
          {caption}
          {control}
          <span className="tact-readout shrink-0">{readout}</span>
        </>
      ) : (
        <>
          <div className="flex items-baseline justify-between gap-3">
            {caption}
            <span className="tact-readout shrink-0">{readout}</span>
          </div>
          {control}
        </>
      )}
    </div>
  );
}

function RangeRow({
  label,
  value,
  min,
  max,
  step,
  inline = false,
  onValueChange,
  onValueCommit,
  "aria-label": ariaLabel,
  testId,
  readout,
  className,
}: {
  label: string;
  value: [number, number];
  min: number;
  max: number;
  step: number;
  inline?: boolean;
  onValueChange: (v: number[]) => void;
  onValueCommit?: (v: number[]) => void;
  "aria-label"?: string;
  testId?: string;
  readout: React.ReactNode;
  className?: string;
}) {
  const caption = (
    <span className="landmarks-slider-caption" title={inline ? label : undefined}>
      {label}
    </span>
  );
  const control = (
    <div className="landmarks-slider-control w-full">
      <Slider
        min={min}
        max={max}
        step={step}
        value={value}
        minStepsBetweenThumbs={0}
        getAriaValueText={(next) => formatSliderReadout(next, step)}
        thumbLabel={(index) => `${ariaLabel ?? label}, ${index === 0 ? "minimum" : "maximum"}`}
        onValueChange={onValueChange}
        onValueCommit={onValueCommit}
        aria-label={ariaLabel ?? label}
      />
    </div>
  );
  return (
    <div
      className={cn(
        "landmarks-slider-row min-w-0 flex-1",
        inline && "landmarks-slider-row--inline",
        className,
      )}
      data-testid={testId}
    >
      {inline ? (
        <>
          {caption}
          {control}
          <span className="tact-readout shrink-0">{readout}</span>
        </>
      ) : (
        <>
          <div className="flex items-baseline justify-between gap-3">
            {caption}
            <span className="tact-readout shrink-0">{readout}</span>
          </div>
          {control}
        </>
      )}
    </div>
  );
}

/** Reset control — Lucide rotate-ccw, placed immediately right of a slider row. */
export function TactSliderReset({
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

/** Pair of Low / High rows (contrast windows, inspect ranges). */
export function TactRangeSlider({
  caption,
  value,
  min,
  max,
  step,
  onValueChange,
  onValueCommit,
  lowLabel = "Low",
  highLabel = "High",
  "aria-label": _ariaLabel,
  testId,
  className,
}: {
  caption?: React.ReactNode;
  value: [number, number];
  min: number;
  max: number;
  step?: number;
  onValueChange: (v: [number, number]) => void;
  onValueCommit?: (v: [number, number]) => void;
  lowLabel?: string;
  highLabel?: string;
  "aria-label"?: string;
  testId?: string;
  className?: string;
}) {
  const span = Math.max(max - min, 1e-9);
  const stride = step ?? (span / 200 || 0.01);
  const [lo, hi] = value;

  const push = (next: [number, number], commit = false) => {
    const ordered: [number, number] = [
      Math.min(next[0], next[1]),
      Math.max(next[0], next[1]),
    ];
    onValueChange(ordered);
    if (commit) onValueCommit?.(ordered);
  };

  return (
    <div
      className={cn(
        "landmarks-slider-stack landmarks-slider-row--range min-w-0 flex-1",
        className,
      )}
      data-testid={testId}
    >
      {caption != null ? (
        <p className={cn(FIELD_CAPTION, "landmarks-slider-caption", "m-0 px-0.5")}>{caption}</p>
      ) : null}
      <SliderRow
        label={lowLabel}
        value={lo}
        min={min}
        max={max}
        step={stride}
        onChange={(v) => push([Math.min(v, hi), hi])}
      />
      <SliderRow
        label={highLabel}
        value={hi}
        min={min}
        max={max}
        step={stride}
        onChange={(v) => push([lo, Math.max(v, lo)])}
      />
    </div>
  );
}

/**
 * Scalar or range row.
 */
export function TactSliderRow({
  caption,
  value,
  min,
  max,
  step,
  onValueChange,
  onValueCommit,
  readout: _readout,
  "aria-label": ariaLabel,
  testId,
  className,
  children,
  lowLabel: _lowLabel,
  highLabel: _highLabel,
  disabled = false,
  formatValue,
  inline = false,
}: {
  caption?: React.ReactNode;
  value: number[];
  min: number;
  max: number;
  step?: number;
  onValueChange: (v: number[]) => void;
  onValueCommit?: (v: number[]) => void;
  readout?: React.ReactNode;
  "aria-label"?: string;
  testId?: string;
  className?: string;
  children?: React.ReactNode;
  lowLabel?: string;
  highLabel?: string;
  disabled?: boolean;
  formatValue?: (value: number) => string;
  /** Label, track, and readout on one line. */
  inline?: boolean;
}) {
  if (value.length > 1) {
    const span = Math.max(max - min, 1e-9);
    const stride = step ?? (span / 200 || 0.01);
    const label = sliderLabel(caption, ariaLabel);
    const inside =
      _readout ??
      `${formatSliderReadout(value[0] ?? min, stride)}–${formatSliderReadout(value[1] ?? max, stride)}`;
    const range = (
      <RangeRow
        label={label}
        value={[value[0] ?? min, value[1] ?? max]}
        min={min}
        max={max}
        step={stride}
        inline={inline}
        onValueChange={onValueChange}
        onValueCommit={onValueCommit}
        aria-label={ariaLabel ?? label}
        testId={testId}
        readout={inside}
        className={className}
      />
    );
    if (!children) return range;
    return (
      <div className="flex min-w-0 flex-1 items-center gap-1">
        {range}
        {children}
      </div>
    );
  }

  const span = Math.max(max - min, 1e-9);
  const stride = step ?? (span / 200 || 0.01);
  const label = sliderLabel(caption, ariaLabel);

  return (
    <div className={cn("flex min-w-0 flex-1 items-center gap-1", className)}>
      <SliderRow
        label={label}
        ariaLabel={ariaLabel}
        inline={inline}
        value={value[0] ?? min}
        min={min}
        max={max}
        step={stride}
        disabled={disabled}
        formatValue={formatValue}
        onChange={(v) => {
          onValueChange([v]);
          onValueCommit?.([v]);
        }}
        testId={testId}
      />
      {children}
    </div>
  );
}

/** Unidirectional slider (opacity, point size, tension, …). */
export function TactCapsuleSlider({
  value,
  min,
  max,
  step,
  onValueChange,
  displayValue: _displayValue,
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
  onReset?: () => void;
  resetTitle?: string;
  resetTestId?: string;
  children?: React.ReactNode;
}) {
  const span = Math.max(max - min, 1e-9);
  const stride = step ?? (span / 200 || 0.01);
  const label = sliderLabel(caption, ariaLabel);

  return (
    <div className={cn("flex min-w-0 flex-1 items-center gap-1", className)}>
      <SliderRow
        label={label}
        ariaLabel={ariaLabel}
        value={value}
        min={min}
        max={max}
        step={stride}
        onChange={onValueChange}
        testId={testId}
      />
      {onReset ? (
        <TactSliderReset
          title={resetTitle}
          testId={resetTestId}
          onClick={onReset}
        />
      ) : null}
      {children}
    </div>
  );
}

/**
 * Signed or symmetric buffer. Signed min/max, or 0..max when `both`.
 */
export function TactSignedSlider({
  value,
  min = -1,
  max = 1,
  both = false,
  onChange,
  displayValue: _displayValue,
  "aria-label": ariaLabel = "Buffer",
  testId,
  className,
  showEnds: _showEnds,
  caption = "Buffer",
  hint,
  ends = false,
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
  showEnds?: boolean;
  caption?: string;
  /** Sign explanation. Shown on the short caption, not in the caption text. */
  hint?: string;
  /** Minus and plus marks at the track ends. */
  ends?: boolean;
}) {
  const label = sliderLabel(caption, ariaLabel);
  if (both || min >= 0) {
    const lo = min >= 0 ? min : 0;
    const stride = decimalStep(Math.max(max - lo, 1e-9));
    return (
      <SliderRow
        label={label}
        ariaLabel={ariaLabel}
        value={Math.abs(value)}
        min={0}
        max={max}
        step={stride}
        onChange={onChange}
        className={className}
        testId={testId}
      />
    );
  }

  const stride = decimalStep(Math.max(max - min, 1e-9));

  return (
    <SliderRow
      label={label}
      ariaLabel={ariaLabel}
      hint={hint}
      ends={ends}
      value={value}
      min={min}
      max={max}
      step={stride}
      onChange={onChange}
      className={className}
      testId={testId}
    />
  );
}
