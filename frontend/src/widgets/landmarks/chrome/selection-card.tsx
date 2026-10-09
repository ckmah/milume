import { useMemo } from "react";

import { decodeF32Base64 } from "../binary";
import { inspectWindowOf } from "../use-inspect-cube";
import type { LandmarksModel } from "../use-landmarks-model";
import type { ChipSnapshot } from "./cube-snapshots";
import { knnEdgeCapHiddenNote } from "../neighborhood-perf.js";
import { compositionSlices, resolvePointMask } from "./info-stats";
import { META_LINE } from "./sections";

/** Points in `points_data` (Nx4 float32, base64). */
function pointCount(b64: string): number {
  if (!b64) return 0;
  try {
    return Math.floor(atob(b64).length / 16);
  } catch {
    return 0;
  }
}

/**
 * The masked points' extent in µm, e.g. `x 120–260 · y 80–190 µm`.
 * `points_data` holds x, y in [-1, 1] across `x_bounds` / `y_bounds` (µm).
 */
function boundsText(pointsB64: string, mask: Uint8Array, xBounds: number[], yBounds: number[]): string {
  if (!pointsB64 || xBounds.length < 2 || yBounds.length < 2) return "";
  const pts = decodeF32Base64(pointsB64);
  let [x0, x1, y0, y1] = [Infinity, -Infinity, Infinity, -Infinity];
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i]) continue;
    const x = pts[i * 4]!;
    const y = pts[i * 4 + 1]!;
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  if (!Number.isFinite(x0)) return "";
  const um = (v: number, [lo, hi]: number[]) => Math.round(lo! + ((v + 1) / 2) * (hi! - lo!));
  return `x ${um(x0, xBounds)}–${um(x1, xBounds)} · y ${um(y0, yBounds)}–${um(y1, yBounds)} µm`;
}

/**
 * A selection at a glance (the Selections row's hover card): its cell count,
 * where it is (an inspect entry's window, else the members' extent), the
 * entry's thumbnail, and its top three categories under the live Color-by.
 * Mounted only while the card is open, so nothing here runs per row.
 */
export function SelectionCard({
  lm,
  index,
  snapshot,
  stackZ = null,
}: {
  lm: LandmarksModel;
  index: number;
  snapshot: ChipSnapshot | null;
  /** The 3D image's Z extent (µm), when known. */
  stackZ?: [number, number] | null;
}) {
  const sel = lm.selections[index];
  const win = inspectWindowOf(sel);
  const { points_data, category_codes, category_columns, active_category, selections, x_bounds, y_bounds } = lm;
  const n = useMemo(() => pointCount(points_data || ""), [points_data]);
  const mask = useMemo(
    () =>
      resolvePointMask({
        n,
        selectedKind: "selection",
        selectedIndex: index,
        selections: selections || [],
        pointsDataB64: points_data || "",
        categoryCodesB64: category_codes || "",
        categoryColumns: category_columns || [],
        activeCategory: active_category || "",
      }),
    [n, index, selections, points_data, category_codes, category_columns, active_category],
  );
  const count = useMemo(() => mask.reduce((a, v) => a + v, 0), [mask]);
  const slices = useMemo(
    () =>
      compositionSlices({
        n,
        mask,
        categoryCodesB64: category_codes || "",
        categoryColumns: category_columns || [],
        activeCategory: active_category || "",
      })
        .sort((a, b) => b.value - a.value)
        .slice(0, 3),
    [n, mask, category_codes, category_columns, active_category],
  );
  // Where it is: an inspect entry's window (and its depth cut, unless it is the
  // whole stack), else the members' extent.
  const where = useMemo(() => {
    if (!win) return [boundsText(points_data || "", mask, x_bounds || [], y_bounds || [])].filter(Boolean);
    const r = Math.round;
    const z = win.cut?.length === 6 ? [r(win.cut[4]!), r(win.cut[5]!)] : null;
    const wholeStack = z != null && stackZ != null && z[0] <= r(stackZ[0]) && z[1] >= r(stackZ[1]);
    return [
      `${r(win.size_um)} µm window at ${r(win.cx)}, ${r(win.cy)} µm`,
      z && !wholeStack ? `Depth ${z[0]}–${z[1]} µm` : "",
    ].filter(Boolean);
  }, [win, stackZ, points_data, mask, x_bounds, y_bounds]);
  if (!sel) return null;
  const total = Math.max(count, 1);
  const seedCount = sel.point_indices?.length ?? count;
  const hoodK = Number(sel.neighborhood_k) || 12;
  const edgesCapNote = knnEdgeCapHiddenNote(sel.neighborhood || "off", seedCount, hoodK);

  return (
    <div className="flex flex-col gap-1.5">
      {snapshot ? (
        <img src={snapshot.url} alt="" className="landmarks__selection-card-thumb w-full rounded-md" />
      ) : null}
      <div className="flex flex-col gap-0.5">
        <p className="m-0 truncate text-xs font-medium text-foreground" title={sel.id}>
          {sel.id}
        </p>
        <p className="m-0 text-[11px] text-foreground tabular-nums">
          {count.toLocaleString()} {count === 1 ? "cell" : "cells"}
        </p>
        {where.map((line) => (
          <p key={line} className="landmarks-meta m-0 text-[11px] tabular-nums">
            {line}
          </p>
        ))}
        {edgesCapNote ? (
          <p className={META_LINE} data-testid="knn-edges-cap-note">
            {edgesCapNote}
          </p>
        ) : null}
      </div>
      {slices.length ? (
        <div className="flex flex-col gap-1">
          {slices.map((s) => {
            const pct = (s.value / total) * 100;
            return (
              <div key={s.key} className="flex items-center gap-1.5 text-[11px] text-foreground">
                <span className="w-16 shrink-0 truncate" title={s.label}>
                  {s.label}
                </span>
                <span className="landmarks__selection-card-track relative h-1.5 min-w-0 flex-1 overflow-hidden rounded-full">
                  <span
                    data-testid="selection-card-bar"
                    className="block h-full rounded-full"
                    style={{ width: `${pct}%`, background: s.fill }}
                  />
                </span>
                <span className="landmarks-meta w-8 shrink-0 text-right tabular-nums">{Math.round(pct)}%</span>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
