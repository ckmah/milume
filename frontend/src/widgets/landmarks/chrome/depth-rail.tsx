import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { formatLegendValue } from "../helpers";
import type { LandmarksModel } from "../use-landmarks-model";
import { usePointZExtent } from "../use-point-z-extent";
import { FLOAT_PANEL } from "./sections";

const MIN_BAND_UM = 5;

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

/**
 * Bottom-right depth band control (3D only). Fades scatter via synced z traits.
 */
export function DepthRail({ lm }: { lm: LandmarksModel }) {
  const { hasZ, lo: extLo, hi: extHi } = usePointZExtent(lm.points_data);
  const railRef = useRef<HTMLDivElement>(null);

  const focus = lm.z_focus_um;
  const bandLo = lm.z_band_lo_um;
  const bandHi = lm.z_band_hi_um;

  useEffect(() => {
    if (!hasZ) return;
    if (bandHi > bandLo && Number.isFinite(bandLo) && Number.isFinite(bandHi)) return;
    const mid = (extLo + extHi) / 2;
    const [lo, hi] = clampBand(mid - 5, mid + 5, extLo, extHi);
    lm.setZBand({ focus: mid, lo, hi });
  }, [hasZ, extLo, extHi, bandLo, bandHi, lm]);

  const rasterOn = (lm.render_mode || "points") === "raster";

  const readout = useMemo(() => {
    if (!hasZ) return null;
    if (rasterOn) {
      return { line1: "Raster", line2: "all z" };
    }
    const half = (bandHi - bandLo) / 2;
    const symmetric =
      Math.abs(focus - (bandLo + bandHi) / 2) < 0.05 &&
      Math.abs(half * 2 - (bandHi - bandLo)) < 0.05 &&
      Math.abs(half - Math.round(half)) < 0.05;
    if (symmetric && half > 0) {
      return {
        line1: `z ${formatLegendValue(focus)} ± ${formatLegendValue(half)}`,
        line2: `${formatLegendValue(bandLo)}–${formatLegendValue(bandHi)} µm`,
      };
    }
    return {
      line1: `z ${formatLegendValue(focus)}`,
      line2: `${formatLegendValue(bandLo)}–${formatLegendValue(bandHi)} µm`,
    };
  }, [hasZ, rasterOn, focus, bandLo, bandHi]);

  const pushBand = useCallback(
    (next: { focus?: number; lo?: number; hi?: number }) => {
      const f = next.focus ?? focus;
      let lo = next.lo ?? bandLo;
      let hi = next.hi ?? bandHi;
      if (next.focus != null && next.lo == null && next.hi == null) {
        const w = bandHi - bandLo;
        lo = f - w / 2;
        hi = f + w / 2;
      }
      [lo, hi] = clampBand(lo, hi, extLo, extHi);
      lm.setZBand({ focus: f, lo, hi });
    },
    [bandHi, bandLo, extHi, extLo, focus, lm],
  );

  const [drag, setDrag] = useState<"lo" | "hi" | "focus" | null>(null);

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

  useEffect(() => {
    if (!drag) return;
    const onMove = (e: PointerEvent) => {
      const z = pickZ(e.clientY);
      if (drag === "lo") pushBand({ lo: Math.min(z, bandHi - MIN_BAND_UM) });
      else if (drag === "hi") pushBand({ hi: Math.max(z, bandLo + MIN_BAND_UM) });
      else pushBand({ focus: z });
    };
    const onUp = () => setDrag(null);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [drag, bandHi, bandLo, pickZ, pushBand]);

  if (!hasZ) return null;

  const bandTop = zToPct(bandHi, extLo, extHi);
  const bandBottom = zToPct(bandLo, extLo, extHi);
  const focusPct = zToPct(focus, extLo, extHi);

  return (
    <div
      className={cn(FLOAT_PANEL, "landmarks-depth-rail pointer-events-auto")}
      data-testid="depth-rail"
      role="group"
      aria-label="Focus depth"
    >
      <div className="landmarks-depth-rail__readout">
        <span className="landmarks-depth-rail__readout-muted">z</span>
        <span className="landmarks-depth-rail__readout-main">{readout?.line1}</span>
        <span className="landmarks-depth-rail__readout-sub">{readout?.line2}</span>
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
            className="landmarks-depth-rail__thumb landmarks-depth-rail__thumb--lo"
            style={{ bottom: `calc(${bandBottom}% - 2px)` }}
            aria-label="Lower z bound"
            onPointerDown={(e) => {
              e.preventDefault();
              setDrag("lo");
            }}
          />
          <Button
            type="button"
            variant="ghost"
            className="landmarks-depth-rail__thumb landmarks-depth-rail__thumb--hi"
            style={{ bottom: `calc(${bandTop}% - 2px)` }}
            aria-label="Upper z bound"
            onPointerDown={(e) => {
              e.preventDefault();
              setDrag("hi");
            }}
          />
          <Button
            type="button"
            variant="ghost"
            className="landmarks-depth-rail__focus"
            style={{ bottom: `calc(${focusPct}% - 2px)` }}
            aria-label="Focus z"
            aria-valuetext={`${formatLegendValue(focus)} µm`}
            onPointerDown={(e) => {
              e.preventDefault();
              setDrag("focus");
            }}
          />
        </div>
      </div>
    </div>
  );
}
