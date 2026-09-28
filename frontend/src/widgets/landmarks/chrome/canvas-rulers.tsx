import { useEffect, useMemo, useState } from "react";
import { Rise } from "cube-motion/react";

import type { EngineHandle } from "../engine";
import type { LandmarksModel } from "../use-landmarks-model";
import { formatParam } from "../helpers";

/** Nice tick step for a world-space span. */
function niceStep(span: number) {
  if (!(span > 0) || !Number.isFinite(span)) return 1;
  const raw = span / 6;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const n = raw / pow;
  const f = n < 1.5 ? 1 : n < 3.5 ? 2 : n < 7.5 ? 5 : 10;
  return f * pow;
}

type Tick = { value: number; label: string; pct: number };

/**
 * A tick at `pct` of the whole canvas, placed in a strip that starts one ruler
 * band in (the rulers' corner), so labels and grid lines sit on the data.
 */
const along = (pct: number) => `calc((100% + var(--lm-ruler-band)) * ${pct / 100} - var(--lm-ruler-band))`;

/**
 * Edge rulers framing the canvas (top + left axes) and a thin grid line at
 * every tick, over the map and under the chrome (pointer-events none).
 * The map's Y runs down, like the screen. Chrome docks shift via
 * `.landmarks--rulers` (cube-motion curve).
 */
export function CanvasRulers({
  lm,
  engine,
}: {
  lm: LandmarksModel;
  engine: EngineHandle | null;
}) {
  const show = !!lm.show_rulers;
  const [bounds, setBounds] = useState<[number, number, number, number] | null>(
    null,
  );

  useEffect(() => {
    if (!show || !engine) return;
    const sync = () => {
      setBounds(engine.getViewportWorldBounds());
    };
    sync();
    const unsub = engine.subscribeViewState(() => sync());
    window.addEventListener("resize", sync);
    return () => {
      unsub();
      window.removeEventListener("resize", sync);
    };
  }, [show, engine]);

  const ticks = useMemo(() => {
    if (!bounds) return { x: [] as Tick[], y: [] as Tick[] };
    const [x0, y0, x1, y1] = bounds;
    const axis = (lo: number, hi: number): Tick[] => {
      const step = niceStep(hi - lo);
      const out: Tick[] = [];
      // Multiples of the step (no accumulated float error).
      for (let i = Math.ceil(lo / step); i * step <= hi; i++) {
        const v = i * step;
        out.push({ value: v, label: formatParam(v, String(v)), pct: ((v - lo) / (hi - lo)) * 100 });
      }
      return out;
    };
    return { x: axis(x0, x1), y: axis(y0, y1) };
  }, [bounds]);

  return (
    <Rise
      show={show}
      className="landmarks-rulers pointer-events-none absolute inset-0 z-[5]"
      data-testid="canvas-rulers"
      aria-hidden={!show}
    >
      <div className="landmarks-ruler-grid">
        {ticks.x.map((t) => (
          <span
            key={`gx-${t.value}`}
            className="landmarks-ruler-grid-line landmarks-ruler-grid-line--x"
            style={{ left: along(t.pct) }}
          />
        ))}
        {ticks.y.map((t) => (
          <span
            key={`gy-${t.value}`}
            className="landmarks-ruler-grid-line landmarks-ruler-grid-line--y"
            style={{ top: along(t.pct) }}
          />
        ))}
      </div>
      <div className="landmarks-ruler landmarks-ruler--x">
        {ticks.x.map((t) => (
          <span
            key={`x-${t.value}`}
            className="landmarks-ruler-tick"
            data-value={t.value}
            style={{ left: along(t.pct) }}
          >
            {t.label}
          </span>
        ))}
      </div>
      <div className="landmarks-ruler landmarks-ruler--y">
        {ticks.y.map((t) => (
          <span
            key={`y-${t.value}`}
            className="landmarks-ruler-tick"
            data-value={t.value}
            style={{ top: along(t.pct) }}
          >
            {t.label}
          </span>
        ))}
      </div>
    </Rise>
  );
}
