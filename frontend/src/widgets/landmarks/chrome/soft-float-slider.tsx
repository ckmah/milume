/**
 * Slider chrome — DialKit inline rows for all scalar and range controls.
 * Range uses paired Low / High tracks; signed and symmetric buffer use DialKit
 * with appropriate min/max.
 */
import { useMemo, useState } from "react";
import { Slider as DialkitSlider } from "dialkit";
import { RotateCcwIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";

import { FIELD_CAPTION } from "./sections";
import { ChromeTooltip, chromeHitClass } from "./primitives";

function sliderLabel(caption: React.ReactNode, ariaLabel?: string): string {
  if (ariaLabel) return ariaLabel;
  if (caption == null || caption === "") return "Value";
  if (typeof caption === "string" || typeof caption === "number") return String(caption);
  return "Value";
}

function DialkitSliderRow({
  label,
  value,
  min,
  max,
  step,
  onChange,
  className,
  testId,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  className?: string;
  testId?: string;
}) {
  return (
    <div
      className={cn("landmarks-slider-row landmarks-slider-row--dialkit min-w-0 flex-1", className)}
      data-testid={testId}
    >
      <div className="dialkit-root w-full">
        <DialkitSlider
          label={label}
          value={value}
          min={min}
          max={max}
          step={step}
          onChange={onChange}
        />
      </div>
    </div>
  );
}

function DialkitHashmarks() {
  const marks = useMemo(
    () =>
      Array.from({ length: 11 }, (_, i) => (
        <div
          key={i}
          className="dialkit-slider-hashmark"
          style={{ left: `${i * 10}%` }}
        />
      )),
    [],
  );
  return <>{marks}</>;
}

function DialkitRangeRow({
  label,
  value,
  min,
  max,
  step,
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
  onValueChange: (v: number[]) => void;
  onValueCommit?: (v: number[]) => void;
  "aria-label"?: string;
  testId?: string;
  readout: React.ReactNode;
  className?: string;
}) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const active = hovered || focused;

  return (
    <div
      className={cn("landmarks-slider-row landmarks-slider-row--dialkit min-w-0 flex-1", className)}
      data-testid={testId}
    >
      <div className="dialkit-root w-full">
        <div className="dialkit-slider-wrapper landmarks-dialkit-range">
          <div
            className={cn("dialkit-slider landmarks-dialkit-range__shell", active && "dialkit-slider-active")}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            onFocusCapture={() => setFocused(true)}
            onBlurCapture={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused(false);
            }}
          >
            <div className="dialkit-slider-hashmarks">
              <DialkitHashmarks />
            </div>
            <span className="dialkit-slider-label">{label}</span>
            <span className="dialkit-slider-value" aria-hidden>
              {readout}
            </span>
            <Slider
              className="landmarks-dialkit-range__radix"
              min={min}
              max={max}
              step={step}
              value={value}
              minStepsBetweenThumbs={0}
              onValueChange={onValueChange}
              onValueCommit={onValueCommit}
              aria-label={ariaLabel ?? label}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

/** Reset control — Lucide rotate-ccw, placed immediately right of a slider row. */
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

/** Pair of Low / High DialKit rows (contrast windows, inspect ranges). */
export function SoftFloatRangeSlider({
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
      <DialkitSliderRow
        label={lowLabel}
        value={lo}
        min={min}
        max={max}
        step={stride}
        onChange={(v) => push([Math.min(v, hi), hi])}
      />
      <DialkitSliderRow
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
 * Scalar or range row — DialKit only.
 */
export function SoftFloatSliderRow({
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
}) {
  if (value.length > 1) {
    const span = Math.max(max - min, 1e-9);
    const stride = step ?? (span / 200 || 0.01);
    const label = sliderLabel(caption, ariaLabel);
    const inside =
      _readout ??
      `${Math.round(value[0] ?? min)}–${Math.round(value[1] ?? max)}`;
    const range = (
      <DialkitRangeRow
        label={label}
        value={[value[0] ?? min, value[1] ?? max]}
        min={min}
        max={max}
        step={stride}
        onValueChange={onValueChange}
        onValueCommit={onValueCommit}
        aria-label={ariaLabel ?? `${label}, minimum`}
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
      <DialkitSliderRow
        label={label}
        value={value[0] ?? min}
        min={min}
        max={max}
        step={stride}
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

/** Unidirectional DialKit slider (opacity, point size, tension, …). */
export function SoftFloatCapsuleSlider({
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
      <DialkitSliderRow
        label={label}
        value={value}
        min={min}
        max={max}
        step={stride}
        onChange={onValueChange}
        testId={testId}
      />
      {onReset ? (
        <SoftFloatSliderReset
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
 * Signed or symmetric buffer — DialKit with signed min/max, or 0..max when `both`.
 */
export function SoftFloatSignedSlider({
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
}) {
  const label = sliderLabel(caption, ariaLabel);
  if (both || min >= 0) {
    const stride = Math.max(max - (min >= 0 ? min : 0), 1e-9) / 200 || 0.01;
    return (
      <DialkitSliderRow
        label={label}
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

  const span = Math.max(max - min, 1e-9);
  const stride = span / 200 || 0.01;

  return (
    <DialkitSliderRow
      label={label}
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
