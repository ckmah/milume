import { cn } from "@/lib/utils";
import { FLOAT_PANEL } from "@/widgets/landmarks/chrome/sections";

import { bandColor, profileBins } from "../geometry";
import type { Field, Scene } from "../types";

export function Profile({ scene, field }: { scene: Scene; field: Field }) {
  const bins = profileBins(scene.cells, field, 8);
  const maxN = Math.max(1, ...bins.map((bin) => bin.n));
  const maxG = Math.max(1e-6, ...bins.map((bin) => bin.geneMean));
  const line = bins
    .map((bin, i) => {
      const x = ((i + 0.5) / bins.length) * 100;
      const y = 100 - (bin.geneMean / maxG) * 100;
      return `${x},${y}`;
    })
    .join(" ");
  return (
    <div data-testid="pseudospace-profile" className={cn(FLOAT_PANEL, "absolute inset-x-3 bottom-3 z-10")}>
      <p className="tact-label px-3 pt-2">{scene.geneName} along pseudospace</p>
      <div className="relative mx-3 mt-2 h-12">
        <div className="flex h-full items-end gap-1">
          {bins.map((bin, i) => (
            <div key={bin.v0} className="flex h-full flex-1 flex-col justify-end" title={`${bin.n} cells`}>
              <div className="flex flex-col" style={{ height: `${(bin.n / maxN) * 100}%` }}>
                {(["high", "mid", "low"] as const).map((band) => (
                  <div
                    key={band}
                    style={{
                      height: bin.n ? `${(bin.bands[band] / bin.n) * 100}%` : 0,
                      background: bandColor(band),
                    }}
                  />
                ))}
              </div>
              <span className="sr-only">
                bin {i} {bin.n}
              </span>
            </div>
          ))}
        </div>
        <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
          <polyline fill="none" stroke="#3d7dff" strokeWidth="1.5" points={line} />
        </svg>
      </div>
      <p className="px-3 py-2 font-[family-name:var(--tact-mono)] text-[10px] text-[var(--tact-muted)]">{scene.compositionNote}</p>
    </div>
  );
}
