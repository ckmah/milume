import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { formatLegendValue } from "../helpers";
import type { LandmarksModel } from "../use-landmarks-model";
import { applyBandSnapshot, type BandSnapshot } from "./depth-rail-snapshot";
import { formatDepthRailDragReadout, formatRangeLine } from "./depth-rail-format";
import { usePointZExtent } from "../use-point-z-extent";

import { FLOAT_PANEL } from "./sections";

const MIN_BAND_UM = 5;
/** Spec §(l): arrow 1 µm, Shift+arrow 5 µm, Page Up/Down 10 µm. */
const KEY_STEP_UM = 1;
const KEY_SHIFT_STEP_UM = 5;
const KEY_PAGE_UM = 10;

type DragKind = "lo" | "hi" | "focus";

function clampBand(
  lo: number,
  hi: number,
  extentLo: number,
  extentHi: number,
): [number, number] {
  let a = Math.max(extentLo, Math.min(lo, extentHi));
  let b = Math.max(extentLo, Math.min(hi, extentHi));
  if (b - a < MIN_BAND_UM) {
    const mid = (a + b) / 2;
    a = Math.max(extentLo, mid - MIN_BAND_UM / 2);
    b = Math.min(extentHi, mid + MIN_BAND_UM / 2);
  }
  if (a > b) [a, b] = [b, a];
  return [a, b];
}

function zToPct(z: number, lo: number, hi: number): number {
  const span = hi - lo || 1;
  return ((z - lo) / span) * 100;
}

function railTickValues(extLo: number, extHi: number): number[] {
  const span = extHi - extLo;
  if (!Number.isFinite(span) || span <= 0) return [Math.round(extLo)];
  if (span < 2) return [Math.round(extLo), Math.round(extHi)];
  let step = 1;
  if (span > 80) step = 10;
  else if (span > 40) step = 5;
  else if (span > 12) step = 2;
  const roundTick = (v: number) => Math.round(v / step) * step;
  const ticks = [extLo, extLo + span / 3, extLo + (2 * span) / 3, extHi].map(roundTick);
  return [...new Set(ticks.map((t) => Math.round(t * 1000) / 1000))].sort((a, b) => a - b);
}

function nudgeZ(
  kind: DragKind,
  z: number,
  delta: number,
  bandLo: number,
  bandHi: number,
  extLo: number,
  extHi: number,
) {
  const next = z + delta;
  if (kind === "lo") return Math.min(next, bandHi - MIN_BAND_UM);
  if (kind === "hi") return Math.max(next, bandLo + MIN_BAND_UM);
  return Math.max(extLo, Math.min(next, extHi));
}

/** Bottom-right depth band control when cells carry z (#122). */
export function DepthRail({ lm }: { lm: LandmarksModel }) {
  const { hasZ, lo: extLo, hi: extHi } = usePointZExtent(lm.points_data);
  const railRef = useRef<HTMLDivElement>(null);
  const dragSnapshot = useRef<BandSnapshot | null>(null);
  const dragActiveRef = useRef<DragKind | null>(null);

  const bandLo = lm.z_band_lo_um;
  const bandHi = lm.z_band_hi_um;
  const focus = lm.z_focus_um;

  useEffect(() => {
    if (!hasZ) return;
    if (bandHi > bandLo && Number.isFinite(bandLo) && Number.isFinite(bandHi)) return;
    const midUm = Math.round((extLo + extHi) / 2);
    const [lo, hi] = clampBand(midUm - 5, midUm + 5, extLo, extHi);
    lm.setZBand({ lo, hi, focus: midUm });
  }, [hasZ, extLo, extHi, bandLo, bandHi, lm]);

  const [drag, setDrag] = useState<DragKind | null>(null);

  const readout = useMemo(() => {
    if (!hasZ) return null;
    const line = formatRangeLine(focus, bandLo, bandHi);
    if (drag) {
      return formatDepthRailDragReadout(focus, bandLo, bandHi);
    }
    return line;
  }, [hasZ, focus, bandLo, bandHi, drag]);

  const pushBand = useCallback(
    (next: { lo?: number; hi?: number; focus?: number; moveBand?: boolean }) => {
      let lo = next.lo ?? bandLo;
      let hi = next.hi ?? bandHi;
      let f = next.focus ?? focus;
      if (next.moveBand && next.focus != null) {
        const w = bandHi - bandLo;
        f = next.focus;
        lo = f - w / 2;
        hi = f + w / 2;
      }
      [lo, hi] = clampBand(lo, hi, extLo, extHi);
      if (next.moveBand) f = (lo + hi) / 2;
      lm.setZBand({ focus: f, lo, hi });
    },
    [bandHi, bandLo, extHi, extLo, focus, lm],
  );

  const pickZ = useCallback(
    (clientY: number) => {
      const el = railRef.current;
      if (!el) return focus;
      const rect = el.getBoundingClientRect();
      const t = 1 - (clientY - rect.top) / rect.height;
      return extLo + t * (extHi - extLo);
    },
    [extHi, extLo, focus],
  );

  const beginDrag = useCallback(
    (kind: DragKind) => {
      dragSnapshot.current = { focus, lo: bandLo, hi: bandHi };
      dragActiveRef.current = kind;
      setDrag(kind);
    },
    [bandHi, bandLo, focus],
  );

  const cancelDrag = useCallback(() => {
    dragActiveRef.current = null;
    const snap = dragSnapshot.current;
    dragSnapshot.current = null;
    if (snap) applyBandSnapshot(snap, (next) => lm.setZBand(next));
    setDrag(null);
    (window as unknown as { __landmarksEngine?: { noteBackdropZBandEnd?: () => void } }).__landmarksEngine?.noteBackdropZBandEnd?.();
  }, [lm]);

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== "Escape" || !dragActiveRef.current) return;
      e.preventDefault();
      cancelDrag();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [cancelDrag]);

  useEffect(() => {
    if (!drag) return;
    const onMove = (e: PointerEvent) => {
      const kind = dragActiveRef.current;
      if (!kind) return;
      const z = pickZ(e.clientY);
      if (kind === "lo") pushBand({ lo: Math.min(z, bandHi - MIN_BAND_UM) });
      else if (kind === "hi") pushBand({ hi: Math.max(z, bandLo + MIN_BAND_UM) });
      else pushBand({ focus: z, moveBand: true });
    };
    const onUp = () => {
      dragSnapshot.current = null;
      dragActiveRef.current = null;
      setDrag(null);
      (window as unknown as { __landmarksEngine?: { noteBackdropZBandEnd?: () => void } }).__landmarksEngine?.noteBackdropZBandEnd?.();
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [drag, bandHi, bandLo, pickZ, pushBand]);

  const onSliderKey =
    (kind: DragKind) =>
    (e: KeyboardEvent<HTMLButtonElement>) => {
      let delta = 0;
      if (e.key === "ArrowUp") delta = e.shiftKey ? KEY_SHIFT_STEP_UM : KEY_STEP_UM;
      else if (e.key === "ArrowDown") delta = e.shiftKey ? -KEY_SHIFT_STEP_UM : -KEY_STEP_UM;
      else if (e.key === "PageUp") delta = KEY_PAGE_UM;
      else if (e.key === "PageDown") delta = -KEY_PAGE_UM;
      else if (e.key === "Home") {
        e.preventDefault();
        if (kind === "lo") pushBand({ lo: extLo });
        else if (kind === "hi") pushBand({ hi: extHi });
        else pushBand({ focus: extLo, moveBand: true });
        return;
      } else if (e.key === "End") {
        e.preventDefault();
        if (kind === "lo") pushBand({ lo: Math.min(extHi - MIN_BAND_UM, bandHi - MIN_BAND_UM) });
        else if (kind === "hi") pushBand({ hi: extHi });
        else pushBand({ focus: extHi, moveBand: true });
        return;
      } else return;
      e.preventDefault();
      const current = kind === "lo" ? bandLo : kind === "hi" ? bandHi : focus;
      const z = nudgeZ(kind, current, delta, bandLo, bandHi, extLo, extHi);
      if (kind === "lo") pushBand({ lo: z });
      else if (kind === "hi") pushBand({ hi: z });
      else pushBand({ focus: z, moveBand: true });
    };

  const ticks = useMemo(() => railTickValues(extLo, extHi), [extLo, extHi]);

  if (!hasZ) return null;

  const bandTop = zToPct(bandHi, extLo, extHi);
  const bandBottom = zToPct(bandLo, extLo, extHi);
  const focusPct = zToPct(focus, extLo, extHi);
  const boundActive = "landmarks-depth-rail__readout-bound--active";

  return (
    <div
      className={cn(FLOAT_PANEL, "landmarks-depth-rail pointer-events-auto")}
      data-testid="depth-rail"
      role="group"
      aria-label="Focus depth"
    >
      <div
        className={cn(
          "landmarks-depth-rail__readout",
          drag && "landmarks-depth-rail__readout--dragging",
        )}
      >
        <div className="landmarks-depth-rail__readout-line">
          <span className="landmarks-depth-rail__readout-muted">z </span>
          <span
            className={cn(
              "landmarks-depth-rail__readout-main",
              drag === "focus" && boundActive,
            )}
          >
            {readout?.main}
          </span>
        </div>
        <div className="landmarks-depth-rail__readout-sub">
          <span className={cn(drag === "lo" && boundActive)}>{readout?.subLo}</span>
          {"–"}
          <span className={cn(drag === "hi" && boundActive)}>{readout?.subHi}</span>
          {" µm"}
        </div>
      </div>
      <div className="landmarks-depth-rail__track-wrap">
        <div ref={railRef} className="landmarks-depth-rail__track">
          <div
            className="landmarks-depth-rail__band"
            style={{
              bottom: `${bandBottom}%`,
              height: `${Math.max(0, bandTop - bandBottom)}%`,
            }}
          />
          <Button
            type="button"
            variant="ghost"
            className={cn(
              "landmarks-depth-rail__thumb landmarks-depth-rail__thumb--lo",
              drag === "lo" && "landmarks-depth-rail__thumb--dragging",
            )}
            style={{ bottom: `calc(${bandBottom}% - 2px)` }}
            role="slider"
            aria-label="Lower z bound"
            aria-valuemin={extLo}
            aria-valuemax={bandHi - MIN_BAND_UM}
            aria-valuenow={bandLo}
            aria-valuetext={`${formatLegendValue(bandLo)} µm`}
            tabIndex={0}
            onKeyDown={onSliderKey("lo")}
            onPointerDown={(e) => {
              e.preventDefault();
              e.currentTarget.setPointerCapture(e.pointerId);
              beginDrag("lo");
            }}
          />
          <Button
            type="button"
            variant="ghost"
            className={cn(
              "landmarks-depth-rail__thumb landmarks-depth-rail__thumb--hi",
              drag === "hi" && "landmarks-depth-rail__thumb--dragging",
            )}
            style={{ bottom: `calc(${bandTop}% - 2px)` }}
            role="slider"
            aria-label="Upper z bound"
            aria-valuemin={bandLo + MIN_BAND_UM}
            aria-valuemax={extHi}
            aria-valuenow={bandHi}
            aria-valuetext={`${formatLegendValue(bandHi)} µm`}
            tabIndex={0}
            onKeyDown={onSliderKey("hi")}
            onPointerDown={(e) => {
              e.preventDefault();
              e.currentTarget.setPointerCapture(e.pointerId);
              beginDrag("hi");
            }}
          />
          <Button
            type="button"
            variant="ghost"
            className={cn(
              "landmarks-depth-rail__focus",
              drag === "focus" && "landmarks-depth-rail__focus--dragging",
            )}
            style={{ bottom: `calc(${focusPct}% - 2px)` }}
            role="slider"
            aria-label="Focus z"
            aria-valuemin={extLo}
            aria-valuemax={extHi}
            aria-valuenow={focus}
            aria-valuetext={`${formatLegendValue(focus)} µm`}
            tabIndex={0}
            onKeyDown={onSliderKey("focus")}
            onPointerDown={(e) => {
              e.preventDefault();
              e.currentTarget.setPointerCapture(e.pointerId);
              beginDrag("focus");
            }}
          />
        </div>
        <div className="landmarks-depth-rail__ruler" aria-hidden>
          {ticks.map((z) => (
            <span
              key={z}
              className="landmarks-depth-rail__ruler-tick"
              style={{ bottom: `${zToPct(z, extLo, extHi)}%` }}
            >
              {formatLegendValue(z)}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
