import { useEffect, useState } from "react";
import { Rise } from "cube-motion/react";
import {
  ArrowLeftRightIcon,
  ChevronDownIcon,
  CircleDotDashedIcon,
  CirclePlusIcon,
  ChevronsLeftRightIcon,
  GitCommitHorizontal,
  PentagonIcon,
  SplineIcon,
  WaypointsIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import type { EngineHandle } from "../engine";
import {
  BUFFERABLE,
  LANDMARK_COLORS,
  NODE_EDITABLE,
  TENSION_TYPES,
  formatParam,
  maxBufferWidth,
  landmarkStableColor,
  normalizeBufferSide,
} from "../helpers";
import type { LandmarksModel } from "../use-landmarks-model";
import {
  SoftFloatCapsuleSlider,
  SoftFloatSignedSlider,
  SoftFloatSliderReset,
} from "./soft-float-slider";
import {
  CHIP_CLASS,
  ChromeTooltip,
  ColorSwatch,
  TOOLBAR_CLASS,
  ToolbarDivider,
  chromeHitClass,
  chromeHitOnClass,
  chromeHitWideClass,
} from "./primitives";

export function IconBtn({
  title,
  active,
  onClick,
  disabled,
  children,
  testId,
  expandable,
}: {
  title: string;
  active?: boolean;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
  testId?: string;
  expandable?: boolean;
}) {
  return (
    <ChromeTooltip label={title}>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={title}
        aria-pressed={active || false}
        disabled={disabled}
        data-testid={testId}
        className={expandable ? chromeHitWideClass : chromeHitClass}
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
      >
        {children}
        {expandable ? (
          <ChevronDownIcon
            aria-hidden
            className={cn(
              "size-2.5 shrink-0 opacity-70 transition-transform",
              active && "rotate-180",
            )}
          />
        ) : null}
      </Button>
    </ChromeTooltip>
  );
}

function ColorControl({
  color,
  onChange,
}: {
  color: string;
  onChange: (hex: string) => void;
}) {
  const isCustom = !LANDMARK_COLORS.some(
    (c) => c.toLowerCase() === color.toLowerCase(),
  );
  return (
    <div className="flex items-center gap-1" data-testid="context-color-swatches">
      {LANDMARK_COLORS.map((c) => {
        const on = c.toLowerCase() === color.toLowerCase();
        return (
          <Button
            key={c}
            type="button"
            variant="ghost"
            size="icon-sm"
            title={c}
            aria-label={`Color ${c}`}
            aria-pressed={on}
            onClick={(e) => {
              e.stopPropagation();
              onChange(c);
            }}
            className={chromeHitClass}
          >
            <ColorSwatch
              color={c}
              variant="landmark"
              className="!size-4 !min-h-4 !min-w-4 shrink-0"
            />
          </Button>
        );
      })}
      <label
        title="Custom color"
        className={cn(
          "relative inline-flex cursor-pointer items-center justify-center leading-none",
          chromeHitClass,
          isCustom && chromeHitOnClass,
        )}
      >
        {isCustom ? (
          <ColorSwatch
            color={color}
            variant="landmark"
            className="!size-4 !min-h-4 !min-w-4 shrink-0"
          />
        ) : (
          <span
            className={cn(
              CHIP_CLASS,
              "flex size-4 items-center justify-center rounded-full border-dashed text-[10px] font-semibold leading-none",
            )}
          >
            +
          </span>
        )}
        <input
          type="color"
          value={color}
          aria-label="Custom landmark color"
          className="absolute inset-0 cursor-pointer opacity-0"
          onChange={(e) => onChange(e.target.value)}
          onClick={(e) => e.stopPropagation()}
        />
      </label>
    </div>
  );
}

/** L2 stack anchored above a single L1 control (not the full toolbar). */
export function ToolStack({
  open,
  panel,
  children,
}: {
  open: boolean;
  panel: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="relative flex flex-col items-center">
      {open ? (
        <Rise
          className="pointer-events-auto absolute bottom-[calc(100%+0.375rem)] z-10"
          data-testid="context-l2-anchor"
        >
          <div className={TOOLBAR_CLASS}>{panel}</div>
        </Rise>
      ) : null}
      {children}
    </div>
  );
}

function SignedBufferSlider({
  signed,
  max,
  isPoint,
  both,
  onSigned,
  onBoth,
  onReset,
}: {
  signed: number;
  max: number;
  isPoint: boolean;
  both: boolean;
  onSigned: (v: number, both: boolean) => void;
  onBoth: (next: boolean) => void;
  onReset: () => void;
}) {
  // Signed: − left of center, + right of center.
  const display = isPoint
    ? formatParam(Math.abs(signed), "0")
    : both
      ? formatParam(Math.abs(signed), "0")
      : signed === 0
        ? "0"
        : `${signed < 0 ? "−" : "+"}${formatParam(Math.abs(signed), "0")}`;
  return (
    <div
      // Wide enough for signed capsule + Both + Reset so actions stay inside
      // the Soft Float `landmarks-float--toolbar` pill (not floating beside it).
      className="landmarks-slider-row min-w-[22rem] px-0.5"
      data-testid="context-buffer-panel"
      title={
        isPoint
          ? "Buffer radius"
          : "Signed buffer: − = left/in, + = right/out; snap to center for 0"
      }
    >
      {isPoint ? (
        <SoftFloatCapsuleSlider
          value={Math.abs(signed)}
          min={0}
          max={max}
          step={max / 200 || 0.01}
          onValueChange={(v) => onSigned(v, both)}
          displayValue={display}
          caption="Buffer"
          aria-label="Buffer radius"
          testId="context-buffer-width"
          className="min-w-[15rem]"
          onReset={onReset}
          resetTitle="Reset buffer"
          resetTestId="context-buffer-reset"
        />
      ) : (
        <>
          <Label className="landmarks-slider-caption">Buffer</Label>
          <SoftFloatSignedSlider
            value={signed}
            min={-max}
            max={max}
            both={both}
            onChange={(v) => onSigned(v, both)}
            displayValue={display}
            aria-label="Buffer width; negative is left or in, positive is right or out"
            testId="context-buffer-width"
            className="min-w-0 flex-1"
          />
          <ToolbarDivider />
          <IconBtn
            title="Both sides"
            testId="context-buffer-both"
            active={both}
            onClick={() => onBoth(!both)}
          >
            <ChevronsLeftRightIcon className="size-4" />
          </IconBtn>
          <SoftFloatSliderReset
            title="Reset buffer"
            testId="context-buffer-reset"
            onClick={onReset}
          />
        </>
      )}
    </div>
  );
}

/**
 * Sticky bottom-center context chrome. L2 rises above the pressed tool icon.
 */
export function SelectionToolbar({
  lm,
  engine = null,
}: {
  lm: LandmarksModel;
  engine?: EngineHandle | null;
}) {
  const kind = lm.selected_kind;
  const index = lm.selected_index;
  const isLandmark = kind === "landmark" && index >= 0;
  const isHood = (kind === "selection" || kind === "type") && index >= 0;
  const selectedLm = isLandmark ? lm.selectedLandmark() : null;
  const hood = isHood ? lm.activeNeighborhood() : null;
  const lmType = selectedLm?.type || "";
  const usesBuffer = !!selectedLm && BUFFERABLE.includes(lmType);
  const usesTension = !!selectedLm && TENSION_TYPES.includes(lmType);
  const usesNodes = !!selectedLm && NODE_EDITABLE.includes(lmType);
  const isPoint = lmType === "point";
  const isLineLike = lmType === "line" || lmType === "spline";
  const isNodeMode = lm.mode === "node";
  const showLandmarkBar = isLandmark && !!selectedLm;
  const showHoodBar = isHood && !!hood;

  const [lmL2, setLmL2] = useState<
    "buffer" | "color" | "tension" | "convert" | null
  >(null);

  useEffect(() => {
    setLmL2(null);
  }, [kind, index, isNodeMode]);

  // Node mode keeps ghost-insert armed; no dedicated Add/Delete L1 bar.
  useEffect(() => {
    if (!isNodeMode) return;
    engine?.setNodeInsertArmed?.(true);
  }, [isNodeMode, engine, index]);

  if (!showLandmarkBar && !showHoodBar) return null;

  const color =
    (typeof selectedLm?.color === "string" && selectedLm.color) ||
    landmarkStableColor(selectedLm?.id, index);
  const lineStyle =
    String(selectedLm?.line_style || "solid") === "dashed" ? "dashed" : "solid";
  const side = normalizeBufferSide(
    selectedLm?.buffer_side as string | undefined,
    lmType,
  );
  const bufMax = Math.max(maxBufferWidth(lm.x_bounds, lm.y_bounds), 1);
  const width = Math.min(Math.max(Number(selectedLm?.buffer_width || 0), 0), bufMax);
  const both = side === "both";
  // Signed slider: left/in = negative, right/out = positive; both uses +|w|.
  const signed =
    both || side === "right" ? width : side === "left" ? -width : width;

  const rMax = lm.neighbor_radius_max > 0 ? lm.neighbor_radius_max : bufMax;
  const kMax = Math.max(1, lm.neighbor_k_max || 64);
  const hoodMode = hood?.neighborhood || "off";
  const canPromote = hoodMode === "radius" || hoodMode === "knn";
  const canPromoteBuffer = usesBuffer && width > 0;

  const applySignedBuffer = (nextSigned: number, nextBoth: boolean) => {
    const mag = Math.min(Math.abs(nextSigned), bufMax);
    if (isPoint) {
      lm.patchLandmark({ buffer_width: mag, buffer_side: "both" });
      return;
    }
    if (nextBoth) {
      lm.patchLandmark({ buffer_width: mag, buffer_side: "both" });
      return;
    }
    if (mag === 0) {
      lm.patchLandmark({ buffer_width: 0, buffer_side: side === "both" ? "right" : side });
      return;
    }
    // Explicit: negative → left/in, positive → right/out.
    const nextSide = nextSigned < 0 ? "left" : "right";
    lm.patchLandmark({ buffer_width: mag, buffer_side: nextSide });
  };

  return (
    <TooltipProvider delayDuration={80} skipDelayDuration={0}>
      <div
        className="landmarks__chrome-context"
        data-testid="context-selection-toolbar"
        data-placement="dock"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        onWheel={(e) => e.stopPropagation()}
      >
        <div className={TOOLBAR_CLASS} data-testid="context-toolbar-l1">
          {showLandmarkBar ? (
            <>
              <div className="flex items-center gap-1">
                {!isPoint ? (
                  <IconBtn
                    title={
                      lineStyle === "solid"
                        ? "Line style: solid (click for dashed)"
                        : "Line style: dashed (click for solid)"
                    }
                    testId="context-line-style"
                    onClick={() =>
                      lm.patchLandmark({
                        line_style: lineStyle === "solid" ? "dashed" : "solid",
                      })
                    }
                  >
                    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
                      <line
                        x1="2"
                        y1="8"
                        x2="14"
                        y2="8"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeDasharray={
                          lineStyle === "dashed" ? "3.5 2.5" : undefined
                        }
                      />
                    </svg>
                  </IconBtn>
                ) : null}

                <ToolStack
                  open={lmL2 === "color"}
                  panel={
                    <ColorControl
                      color={color}
                      onChange={(next) => lm.patchLandmark({ color: next })}
                    />
                  }
                >
                  <IconBtn
                    title="Color"
                    testId="context-color-toggle"
                    active={lmL2 === "color"}
                    expandable
                    onClick={() =>
                      setLmL2(lmL2 === "color" ? null : "color")
                    }
                  >
                    <span className="inline-flex size-full items-center justify-center leading-none">
                      <ColorSwatch
                        color={color}
                        variant="landmark"
                        className="!size-4 !min-h-4 !min-w-4 shrink-0"
                      />
                    </span>
                  </IconBtn>
                </ToolStack>

                {usesTension ? (
                  <ToolStack
                    open={lmL2 === "tension"}
                    panel={
                      <div
                        className="flex min-w-[15rem] px-0.5"
                        data-testid="context-tension"
                      >
                        <SoftFloatCapsuleSlider
                          caption="Tension"
                          value={Number(selectedLm?.tension ?? 0)}
                          min={0}
                          max={1}
                          step={0.01}
                          onValueChange={(v) =>
                            lm.patchLandmark({ tension: v })
                          }
                          displayValue={formatParam(
                            Number(selectedLm?.tension ?? 0),
                            "0",
                          )}
                          aria-label="Tension"
                          onReset={() => lm.patchLandmark({ tension: 0 })}
                          resetTitle="Reset tension"
                          resetTestId="context-tension-reset"
                        />
                      </div>
                    }
                  >
                    <IconBtn
                      title="Tension"
                      testId="context-tension-toggle"
                      active={lmL2 === "tension"}
                      expandable
                      onClick={() =>
                        setLmL2(lmL2 === "tension" ? null : "tension")
                      }
                    >
                      <GitCommitHorizontal className="size-4" />
                    </IconBtn>
                  </ToolStack>
                ) : null}
              </div>

              {usesBuffer ? (
                <>
                  <ToolbarDivider />
                  <ToolStack
                    open={lmL2 === "buffer"}
                    panel={
                      <SignedBufferSlider
                        signed={isPoint ? width : signed}
                        max={bufMax}
                        isPoint={isPoint}
                        both={both}
                        onSigned={applySignedBuffer}
                        onBoth={(next) => {
                          if (next) {
                            lm.patchLandmark({
                              buffer_width: width || bufMax * 0.05,
                              buffer_side: "both",
                            });
                          } else {
                            lm.patchLandmark({
                              buffer_side: "right",
                              buffer_width: width,
                            });
                          }
                        }}
                        onReset={() =>
                          lm.patchLandmark({
                            buffer_width: 0,
                            buffer_side: both ? "both" : "right",
                          })
                        }
                      />
                    }
                  >
                    <IconBtn
                      title="Buffer"
                      testId="context-buffer-toggle"
                      active={lmL2 === "buffer" || width > 0}
                      expandable
                      onClick={() =>
                        setLmL2(lmL2 === "buffer" ? null : "buffer")
                      }
                    >
                      <CircleDotDashedIcon className="size-4" />
                    </IconBtn>
                  </ToolStack>
                  <IconBtn
                    title="Make selection from buffer"
                    testId="promote-buffer"
                    disabled={!canPromoteBuffer}
                    onClick={() => lm.promoteBufferToSelection()}
                  >
                    <CirclePlusIcon className="size-4" />
                  </IconBtn>
                </>
              ) : null}

              {usesNodes || isLineLike ? (
                <>
                  <ToolbarDivider />
                  <div className="flex items-center gap-1">
                    {isLineLike ? (
                      <IconBtn
                        title="Reverse"
                        testId="context-reverse"
                        onClick={() => engine?.reverseSelectedLandmark?.()}
                      >
                        <ArrowLeftRightIcon className="size-4" />
                      </IconBtn>
                    ) : null}
                    <ToolStack
                      open={lmL2 === "convert"}
                      panel={
                        <div
                          className="flex items-center gap-1"
                          data-testid="context-convert-types"
                        >
                          {(
                            [
                              {
                                id: "line",
                                label: "Line",
                                Icon: GitCommitHorizontal,
                              },
                              { id: "spline", label: "Spline", Icon: SplineIcon },
                              { id: "shape", label: "Shape", Icon: PentagonIcon },
                            ] as const
                          ).map((opt) => (
                            <IconBtn
                              key={opt.id}
                              title={`Convert to ${opt.label}`}
                              testId={`context-convert-${opt.id}`}
                              active={lmType === opt.id}
                              disabled={lmType === opt.id}
                              onClick={() =>
                                engine?.convertSelectedLandmark?.(opt.id)
                              }
                            >
                              <opt.Icon className="size-4" />
                            </IconBtn>
                          ))}
                        </div>
                      }
                    >
                      <IconBtn
                        title="Convert type"
                        testId="context-convert-toggle"
                        active={lmL2 === "convert"}
                        expandable
                        onClick={() =>
                          setLmL2(lmL2 === "convert" ? null : "convert")
                        }
                      >
                        <PentagonIcon className="size-4" />
                      </IconBtn>
                    </ToolStack>
                  </div>
                </>
              ) : null}
            </>
          ) : null}

          {showHoodBar ? (
            <>
              <ToggleGroup
                type="single"
                variant="default"
                size="sm"
                spacing={1}
                value={hoodMode === "off" ? undefined : hoodMode}
                className="gap-1"
                onValueChange={(next) => {
                  lm.patchNeighborhood({
                    neighborhood: next || "off",
                  });
                }}
              >
                <ToggleGroupItem
                  value="radius"
                  aria-label="Radius neighborhood"
                  data-testid="context-hood-radius-mode"
                  className={chromeHitWideClass}
                >
                  <ChromeTooltip label="Radius neighborhood">
                    <span className="inline-flex items-center gap-0.5">
                      <CircleDotDashedIcon className="size-4" />
                      <ChevronDownIcon className="size-2.5 opacity-70" />
                    </span>
                  </ChromeTooltip>
                </ToggleGroupItem>
                <ToggleGroupItem
                  value="knn"
                  aria-label="k-NN neighborhood"
                  data-testid="context-hood-knn-mode"
                  className={chromeHitWideClass}
                >
                  <ChromeTooltip label="k-NN neighborhood">
                    <span className="inline-flex items-center gap-0.5">
                      <WaypointsIcon className="size-4" />
                      <ChevronDownIcon className="size-2.5 opacity-70" />
                    </span>
                  </ChromeTooltip>
                </ToggleGroupItem>
              </ToggleGroup>
              {hoodMode !== "off" ? (
                <>
                  <ToolbarDivider />
                  <div className="flex min-w-[13rem] items-center gap-1.5 px-0.5">
                    {hoodMode === "radius" ? (
                      <SoftFloatCapsuleSlider
                        caption="r"
                        testId="context-hood-radius"
                        value={Math.min(
                          Number(hood?.neighborhood_radius || 0),
                          rMax,
                        )}
                        min={0}
                        max={rMax}
                        step={rMax / 200 || 1}
                        onValueChange={(v) =>
                          lm.patchNeighborhood({
                            neighborhood: "radius",
                            neighborhood_radius: v,
                          })
                        }
                        displayValue={formatParam(
                          Math.min(
                            Number(hood?.neighborhood_radius || 0),
                            rMax,
                          ),
                          "0",
                        )}
                        aria-label="r"
                        onReset={() =>
                          lm.patchNeighborhood({
                            neighborhood: "radius",
                            neighborhood_radius: 0,
                          })
                        }
                        resetTitle="Reset radius"
                        resetTestId="context-hood-radius-reset"
                      />
                    ) : (
                      <SoftFloatCapsuleSlider
                        caption="k"
                        testId="context-hood-k"
                        value={Math.min(
                          Number(hood?.neighborhood_k || 12),
                          kMax,
                        )}
                        min={1}
                        max={kMax}
                        step={1}
                        onValueChange={(v) =>
                          lm.patchNeighborhood({
                            neighborhood: "knn",
                            neighborhood_k: v,
                          })
                        }
                        displayValue={Math.min(
                          Number(hood?.neighborhood_k || 12),
                          kMax,
                        )}
                        aria-label="k"
                        onReset={() =>
                          lm.patchNeighborhood({
                            neighborhood: "knn",
                            neighborhood_k: 12,
                          })
                        }
                        resetTitle="Reset k"
                        resetTestId="context-hood-k-reset"
                      />
                    )}
                    <IconBtn
                      title="Make selection"
                      testId="promote-neighborhood"
                      disabled={!canPromote}
                      onClick={() => {
                        if (canPromote) lm.promoteNeighborhoodToSelection();
                      }}
                    >
                      <CirclePlusIcon className="size-4" />
                    </IconBtn>
                  </div>
                </>
              ) : null}
            </>
          ) : null}
        </div>
      </div>
    </TooltipProvider>
  );
}
