import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { FLOAT_PANEL } from "@/widgets/landmarks/chrome/sections";

import { bandColor, compositionProfile, geneProfile } from "../geometry";
import type { Field, Scene } from "../types";

const SWATCH = ["#a50f15", "#fd8d3c", "#74c476", "#6baed6", "#542788", "#737373"];

export function Measure({
  scene,
  field,
  geneName,
  mode,
  onGene,
  onMode,
}: {
  scene: Scene;
  field: Field;
  geneName: string;
  mode: "gene" | "category";
  onGene: (name: string) => void;
  onMode: (mode: "gene" | "category") => void;
}) {
  const gene = scene.genes.find((column) => column.name === geneName) ?? scene.genes[0];
  const nnz = (column: { values: ArrayLike<number> }) => {
    let n = 0;
    for (let i = 0; i < column.values.length; i++) if (column.values[i]) n += 1;
    return n;
  };
  const shown = scene.genes
    .slice()
    .sort((a, b) => nnz(b) - nnz(a))
    .slice(0, 8);
  if (gene && !shown.some((column) => column.name === gene.name)) shown.unshift(gene);
  const profile = gene ? geneProfile(scene.cells, field, gene.values) : null;
  const composition = compositionProfile(scene.cells, field);
  const bins = profile?.bins ?? [];
  const maxMean = Math.max(1e-6, ...bins.map((bin) => bin.hi));
  const meanLine = bins
    .map((bin, i) => {
      const x = ((i + 0.5) / bins.length) * 100;
      const y = 100 - (bin.mean / maxMean) * 100;
      return `${x},${y}`;
    })
    .join(" ");
  const band = bins
    .map((bin, i) => {
      const x = ((i + 0.5) / bins.length) * 100;
      const y = 100 - (bin.hi / maxMean) * 100;
      return `${x},${y}`;
    })
    .concat(
      bins
        .slice()
        .reverse()
        .map((bin, i) => {
          const index = bins.length - 1 - i;
          const x = ((index + 0.5) / bins.length) * 100;
          const y = 100 - (bin.lo / maxMean) * 100;
          return `${x},${y}`;
        }),
    )
    .join(" ");

  return (
    <div data-testid="pseudospace-measure" className={cn(FLOAT_PANEL, "absolute inset-x-3 bottom-3 z-10")}>
      <div className="flex items-center gap-2 px-3 pt-2">
        <p className="tact-label">Measure</p>
        <Button type="button" size="sm" variant={mode === "gene" ? "default" : "outline"} className="rounded-none" onClick={() => onMode("gene")}>
          Gene
        </Button>
        <Button
          type="button"
          size="sm"
          variant={mode === "category" ? "default" : "outline"}
          className="rounded-none"
          onClick={() => onMode("category")}
        >
          {scene.categoryName}
        </Button>
        {mode === "gene" && profile ? (
          <p className="ml-auto font-[family-name:var(--tact-mono)] text-[11px]" data-testid="pseudospace-rho">
            Spearman rho {profile.rho.toFixed(2)}
          </p>
        ) : null}
      </div>
      {mode === "gene" ? (
        <div className="flex gap-3 px-3 pb-2 pt-1">
          <div className="max-h-16 min-w-0 flex-1 overflow-auto">
            {shown.map((column) => (
              <Button
                key={column.name}
                type="button"
                size="sm"
                variant={column.name === gene?.name ? "default" : "ghost"}
                className="mr-1 rounded-none"
                data-testid={`gene-${column.name}`}
                onClick={() => onGene(column.name)}
              >
                {column.name}
              </Button>
            ))}
          </div>
          <svg className="h-16 w-48 shrink-0" viewBox="0 0 100 100" preserveAspectRatio="none" aria-label="Gene along pseudospace">
            <polygon points={band} fill="#3d7dff" opacity="0.28" />
            <polyline fill="none" stroke="#3d7dff" strokeWidth="1.6" points={meanLine} />
          </svg>
        </div>
      ) : (
        <div className="flex h-16 items-end gap-1 px-3 pb-2 pt-1">
          {composition.bins.map((bin) => {
            const total = bin.counts.reduce((sum, count) => sum + count, 0) || 1;
            return (
              <div key={bin.v0} className="flex h-full flex-1 flex-col justify-end">
                {composition.labels.map((label, i) => (
                  <div
                    key={label}
                    title={label}
                    style={{
                      height: `${((bin.counts[i] ?? 0) / total) * 100}%`,
                      background: SWATCH[i % SWATCH.length] ?? bandColor("mid"),
                    }}
                  />
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
