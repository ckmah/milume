import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Pie,
  PieChart,
  Cell,
  Sector,
  Label,
} from "recharts";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { FieldDescription } from "@/components/ui/field";
import { cn } from "@/lib/utils";

import { decodeI32Base64 } from "../binary";
import { formatLegendValue, formatParam, landmarkMeasure } from "../helpers";
import type { EngineHandle } from "../engine";
import type { LandmarksModel } from "../use-landmarks-model";
import { colorSignal } from "./coloring";
import {
  compositionSlices,
  embeddingRgbCloud,
  geneDensities,
  niceAxisTicks,
  resolvePointMask,
  CLOUD_OTHER_ALPHA_SCALE,
  CLOUD_OTHER_SIZE_SCALE,
  CLOUD_SELECTED_SIZE_SCALE,
  type DensityRow,
  type DensitySeries,
} from "./info-stats";
import { CLOUD_CUBE, embeddingCloudPointRadius } from "./rgb-cube";
import { PlotChannelLegend } from "./plot-channel-legend";
import { geneDisplayBounds } from "./genes-ternary";
import {
  EMBEDDED_PANEL,
  FLOAT_PANEL,
  FLOAT_PANEL_CLIP,
  PANEL_INSET,
  PANEL_SCROLL,
} from "./sections";

/** Fixed chart slot so Category / Genes / Embedding swaps do not resize the card. */
function InfoChartWell({
  children,
  legend,
}: {
  children: ReactNode;
  legend?: ReactNode;
}) {
  return (
    <div
      className="landmarks-info-chart relative flex h-44 w-full shrink-0 items-stretch justify-stretch rounded-[var(--radius)]"
      data-testid="info-chart-well"
    >
      <div className="absolute inset-0 overflow-hidden rounded-[inherit]">
        {children}
      </div>
      {legend}
    </div>
  );
}

/** Minimal ridgeline: one density ridge per selected gene (no y labels). */
function GeneRidgelines({
  series,
  rows,
  xMin,
  xMax,
}: {
  series: DensitySeries[];
  rows: DensityRow[];
  xMin: number;
  xMax: number;
}) {
  const n = series.length;
  if (!n || !rows.length) return null;

  const plotW = 240;
  const padTop = 10;
  const axisH = 26;
  const plotH = 146;
  const rowH = plotH / n;
  const padX = 6;
  const width = plotW + padX * 2;
  const height = padTop + plotH + axisH;
  const span = xMax - xMin || 1;
  const ticks = niceAxisTicks(xMin, xMax, 3);

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-full w-full"
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label="Gene expression densities"
      data-testid="gene-ridgelines"
    >
      {series.map((s, gi) => {
        const vals = rows.map((r) => Number(r[s.key]) || 0);
        const peak = Math.max(...vals, 1e-12);
        const baseline = padTop + (gi + 1) * rowH - 2;
        const amp = rowH * 0.78;
        let d = `M ${padX} ${baseline}`;
        for (let bi = 0; bi < rows.length; bi++) {
          const x = padX + (bi / Math.max(rows.length - 1, 1)) * plotW;
          const y = baseline - (vals[bi] / peak) * amp;
          d += ` L ${x.toFixed(2)} ${y.toFixed(2)}`;
        }
        d += ` L ${padX + plotW} ${baseline} Z`;
        return (
          <path
            key={s.key}
            d={d}
            fill={s.color}
            fillOpacity={0.28}
            stroke={s.color}
            strokeWidth={1.15}
            strokeLinejoin="round"
          />
        );
      })}
      <line
        x1={padX}
        y1={padTop + plotH}
        x2={padX + plotW}
        y2={padTop + plotH}
        className="stroke-foreground/25"
        strokeWidth={1}
      />
      {ticks.map((value, i) => {
        const t = (value - xMin) / span;
        const x = padX + t * plotW;
        const anchor =
          i === 0 ? "start" : i === ticks.length - 1 ? "end" : "middle";
        return (
          <text
            key={`${value}-${i}`}
            x={x}
            y={height - 6}
            textAnchor={anchor}
            className="fill-foreground/70"
            style={{ fontSize: 10, fontWeight: 500 }}
          >
            {formatLegendValue(value)}
          </text>
        );
      })}
    </svg>
  );
}

export function InfoPanel({
  lm,
  engine = null,
  embedded = false,
  bare = false,
}: {
  lm: LandmarksModel;
  engine?: EngineHandle | null;
  embedded?: boolean;
  /** Skip outer inset when nested in RightChromeStack. */
  bare?: boolean;
}) {
  const {
    selected_kind,
    selected_index,
    selected_type_indices,
    selections,
    points_data,
    category_codes,
    category_columns,
    active_category,
    gene_values,
    gene_format,
    gene_csc_indptr,
    gene_csc_indices,
    gene_csc_data,
    active_genes,
    gene_columns,
    gene_log1p,
    gene_expression_logged,
  } = lm;

  const [hoverTypeIndex, setHoverTypeIndex] = useState<number | null>(null);

  const n = useMemo(() => {
    const b64 = points_data || "";
    if (!b64) return 0;
    try {
      return Math.floor(atob(b64).length / 16);
    } catch {
      return 0;
    }
  }, [points_data]);

  useEffect(() => {
    if (!engine?.subscribeHover) return;
    return engine.subscribeHover((hit) => {
      if (!hit || hit.kind !== "molecule") {
        setHoverTypeIndex(null);
        return;
      }
      const cols = category_columns || [];
      const active = active_category || "";
      const ci = cols.findIndex((c) => c.name === active);
      if (ci < 0 || !category_codes || n <= 0) {
        setHoverTypeIndex(null);
        return;
      }
      try {
        const codes = decodeI32Base64(category_codes);
        const code = codes[ci * n + hit.index];
        setHoverTypeIndex(Number.isFinite(code) ? Number(code) : null);
      } catch {
        setHoverTypeIndex(null);
      }
    });
  }, [engine, category_codes, category_columns, active_category, n]);

  const genes = active_genes || [];
  const signal = colorSignal(lm);
  const showGenes = signal === "genes";
  const showEmbedding = signal === "embedding";

  const maskOpts = {
    n,
    selectedKind: selected_kind || "",
    selectedIndex: selected_index,
    selectedTypeIndices: selected_type_indices || [],
    selections: selections || [],
    pointsDataB64: points_data || "",
    categoryCodesB64: category_codes || "",
    categoryColumns: category_columns || [],
    activeCategory: active_category || "",
  };

  // Donut: selection scope or all cells; type focus only highlights a slice.
  const compositionMask = useMemo(
    () => resolvePointMask({ ...maskOpts, filterByType: false }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- maskOpts fields listed
    [
      n,
      selected_kind,
      selected_index,
      selected_type_indices,
      selections,
      points_data,
      category_codes,
      category_columns,
      active_category,
    ],
  );

  // Genes / “selected cells” count still follow type or selection focus.
  const focusMask = useMemo(
    () => resolvePointMask({ ...maskOpts, filterByType: true }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      n,
      selected_kind,
      selected_index,
      selected_type_indices,
      selections,
      points_data,
      category_codes,
      category_columns,
      active_category,
    ],
  );

  const scopeCount = useMemo(() => {
    let c = 0;
    const m =
      selected_kind === "type" || selected_kind === "selection"
        ? focusMask
        : compositionMask;
    for (let i = 0; i < m.length; i++) if (m[i]) c += 1;
    return c;
  }, [selected_kind, focusMask, compositionMask]);

  const composition = useMemo(
    () =>
      showGenes
        ? []
        : compositionSlices({
            n,
            mask: compositionMask,
            categoryCodesB64: category_codes || "",
            categoryColumns: category_columns || [],
            activeCategory: active_category || "",
          }),
    [
      showGenes,
      n,
      compositionMask,
      category_codes,
      category_columns,
      active_category,
    ],
  );

  const densities = useMemo(
    () => {
      if (!showGenes) return { series: [], rows: [], xMin: 0, xMax: 1 };
      const applyLog = !!gene_log1p && !gene_expression_logged;
      const geneBounds = genes.map((name) =>
        geneDisplayBounds(
          gene_columns.find((c) => c.name === name),
          applyLog,
        ),
      );
      return geneDensities({
        n,
        mask: focusMask,
        geneValuesB64: gene_values || "",
        activeGenes: genes,
        geneLog1p: applyLog,
        geneBounds,
        geneColumns: gene_columns || [],
        geneFormat: gene_format || "dense",
        geneCscIndptrB64: gene_csc_indptr || "",
        geneCscIndicesB64: gene_csc_indices || "",
        geneCscDataB64: gene_csc_data || "",
      });
    },
    [
      showGenes,
      n,
      focusMask,
      gene_values,
      gene_format,
      gene_csc_indptr,
      gene_csc_indices,
      gene_csc_data,
      genes,
      gene_columns,
      gene_log1p,
      gene_expression_logged,
    ],
  );


  const activeTypeIndex = useMemo(() => {
    if (hoverTypeIndex != null) return hoverTypeIndex;
    if (selected_kind === "type" && selected_index >= 0) return selected_index;
    return null;
  }, [hoverTypeIndex, selected_kind, selected_index]);

  const pieConfig = useMemo(() => {
    const cfg: ChartConfig = {};
    for (const s of composition) {
      cfg[s.key] = { label: s.label, color: s.fill };
    }
    return cfg;
  }, [composition]);

  const pieTotal = useMemo(
    () => composition.reduce((acc, s) => acc + s.value, 0),
    [composition],
  );

  const embeddingCloud = useMemo(() => {
    if (!showEmbedding) return [];
    const labels = lm.embedding_channel_labels || [];
    const hasFocus =
      selected_kind === "type" || selected_kind === "selection";
    // Always sample the full cohort; emphasize focus via size/opacity.
    const allMask = new Uint8Array(n);
    allMask.fill(1);
    return embeddingRgbCloud({
      n,
      mask: allMask,
      focusMask,
      hasFocus,
      embeddingValuesB64: lm.embedding_values || "",
      nChannels: labels.length,
    });
  }, [
    showEmbedding,
    n,
    focusMask,
    selected_kind,
    lm.embedding_values,
    lm.embedding_channel_labels,
  ]);

  const embKey =
    lm.raster_embedding_key || lm.raster_embedding_keys?.[0] || "embedding";
  const embLabels = lm.embedding_channel_labels || [];

  const charts = showEmbedding ? (
        embeddingCloud.length ? (
          <div className="box-border h-full w-full px-1.5 pb-3 pt-2">
            <svg
              viewBox={`0 0 ${CLOUD_CUBE.vbW} ${CLOUD_CUBE.vbH}`}
              className="h-full w-full"
              preserveAspectRatio="xMidYMid meet"
              role="img"
              aria-label={`${embKey} RGB cloud in current scope`}
            >
              {(() => {
                const baseR = embeddingCloudPointRadius(embeddingCloud.length);
                const emphasize =
                  selected_kind === "type" || selected_kind === "selection";
                return embeddingCloud.map((p, i) => {
                  const scale = !emphasize
                    ? 1
                    : p.selected
                      ? CLOUD_SELECTED_SIZE_SCALE
                      : CLOUD_OTHER_SIZE_SCALE;
                  const opacity = !emphasize
                    ? 0.85
                    : p.selected
                      ? 0.95
                      : 0.85 * CLOUD_OTHER_ALPHA_SCALE;
                  return (
                    <circle
                      key={i}
                      cx={p.x}
                      cy={p.y}
                      r={baseR * scale}
                      fill={p.color}
                      fillOpacity={opacity}
                    />
                  );
                });
              })()}
            </svg>
          </div>
        ) : (
          <div className="flex h-full w-full items-center justify-center px-2 pb-3 pt-2">
            <FieldDescription className="m-0 max-w-[16rem] text-center">
              {embLabels.length
                ? "No cells in this scope for the embedding cloud."
                : "Pick an embedding in Explore to color points and see the RGB mix."}
            </FieldDescription>
          </div>
        )
      ) : showGenes ? (
        densities.rows.length && densities.series.length ? (
          <div className="box-border h-full w-full px-1 pb-2.5 pt-1.5">
            <GeneRidgelines
              series={densities.series}
              rows={densities.rows}
              xMin={densities.xMin}
              xMax={densities.xMax}
            />
          </div>
        ) : (
          <div className="flex h-full w-full items-center justify-center px-2 pb-2.5 pt-1.5">
            <FieldDescription className="m-0 text-center">
              {genes.length
                ? "No expression in this scope."
                : "Pick genes in Explore to see densities."}
            </FieldDescription>
          </div>
        )
      ) : composition.length ? (
        <div className="flex h-full w-full items-center justify-center">
          <div className="relative aspect-square h-full max-h-44 w-auto max-w-full">
          <ChartContainer
            config={pieConfig}
            className="aspect-square h-full w-full [&_.recharts-responsive-container]:!aspect-square"
            initialDimension={{ width: 176, height: 176 }}
          >
            <PieChart>
              <ChartTooltip
                cursor={false}
                content={
                  <ChartTooltipContent
                    hideLabel
                    formatter={(value, _name, item) => {
                      const row = item?.payload as
                        | { label?: string; value?: number }
                        | undefined;
                      const count = Number(value) || 0;
                      const pct =
                        pieTotal > 0
                          ? ((count / pieTotal) * 100).toFixed(1)
                          : "0";
                      return (
                        <div className="flex min-w-0 flex-col gap-0.5">
                          <span className="truncate font-medium text-foreground">
                            {row?.label ?? ""}
                          </span>
                          <span className="whitespace-nowrap text-muted-foreground tabular-nums">
                            {count.toLocaleString()} cells · {pct}%
                          </span>
                        </div>
                      );
                    }}
                  />
                }
              />
              <Pie
                data={composition}
                dataKey="value"
                nameKey="key"
                innerRadius="66%"
                outerRadius="82%"
                stroke="none"
                strokeWidth={0}
                isAnimationActive={false}
                // Recharts 3 drives activeIndex from tooltip hover only; use shape.
                shape={(props) => {
                  const p = props as {
                    outerRadius?: number;
                    cx?: number;
                    cy?: number;
                    innerRadius?: number;
                    startAngle?: number;
                    endAngle?: number;
                    fill?: string;
                    payload?: { key?: string };
                  };
                  const typeIdx = Number(
                    String(p.payload?.key ?? "").replace(/^c/, ""),
                  );
                  const active =
                    activeTypeIndex != null &&
                    Number.isFinite(typeIdx) &&
                    typeIdx === activeTypeIndex;
                  return (
                    <Sector
                      cx={p.cx}
                      cy={p.cy}
                      innerRadius={p.innerRadius}
                      outerRadius={(p.outerRadius ?? 0) + (active ? 10 : 0)}
                      startAngle={p.startAngle}
                      endAngle={p.endAngle}
                      fill={p.fill}
                      stroke="none"
                    />
                  );
                }}
              >
                {composition.map((s) => (
                  <Cell key={s.key} fill={s.fill} fillOpacity={1} />
                ))}
                <Label
                  content={({ viewBox }) => {
                    if (!viewBox || !("cx" in viewBox) || !("cy" in viewBox)) {
                      return null;
                    }
                    const { cx, cy } = viewBox;
                    return (
                      <text
                        x={cx}
                        y={cy}
                        textAnchor="middle"
                        dominantBaseline="middle"
                      >
                        <tspan
                          x={cx}
                          y={(cy ?? 0) - 6}
                          className="fill-foreground text-lg font-semibold tabular-nums"
                        >
                          {scopeCount.toLocaleString()}
                        </tspan>
                        <tspan
                          x={cx}
                          y={(cy ?? 0) + 12}
                          className="fill-muted-foreground text-[0.65rem]"
                        >
                          cells
                        </tspan>
                      </text>
                    );
                  }}
                />
              </Pie>
            </PieChart>
          </ChartContainer>
          </div>
        </div>
      ) : (
        <FieldDescription className="m-0 text-center">
          {category_columns.length
            ? "No category counts in this scope."
            : "Load categories for composition, or color by genes."}
        </FieldDescription>
      );

  const body = (
    <div className="flex min-h-0 flex-1 flex-col">
      {selected_kind === "landmark" && selected_index >= 0
        ? (() => {
            const row = lm.landmarks[selected_index];
            const m = landmarkMeasure(row || null);
            if (!m) return null;
            const label =
              m.kind === "radius"
                ? "Buffer radius"
                : m.kind === "area"
                  ? "Area"
                  : "Length";
            return (
              <FieldDescription
                className="m-0 px-1 pb-1 text-[0.6875rem] tabular-nums"
                data-testid="landmark-measure"
              >
                {label}: {formatParam(m.value, "0")}
              </FieldDescription>
            );
          })()
        : null}
      <InfoChartWell legend={<PlotChannelLegend lm={lm} />}>
        {charts}
      </InfoChartWell>
    </div>
  );

  if (embedded) {
    if (bare) {
      return (
        <div className="flex min-h-0 flex-col" data-testid="info-panel">
          {body}
        </div>
      );
    }
    return (
      <div
        className={cn(EMBEDDED_PANEL, "flex min-h-0 flex-col")}
        data-testid="info-panel"
      >
        <div
          className={cn(
            PANEL_SCROLL,
            PANEL_INSET,
          )}
        >
          {body}
        </div>
      </div>
    );
  }

  return (
    <Card className={FLOAT_PANEL} data-testid="info-panel">
      <div className={FLOAT_PANEL_CLIP}>
        <CardHeader className="sr-only">
          <CardDescription>
            Selection-linked composition and gene densities
          </CardDescription>
        </CardHeader>
        <CardContent
          className={cn(
            PANEL_SCROLL,
            PANEL_INSET,
          )}
        >
          {body}
        </CardContent>
      </div>
    </Card>
  );
}
