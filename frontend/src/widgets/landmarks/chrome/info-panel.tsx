import { useEffect, useMemo, useState, type ReactNode } from "react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import { FieldDescription } from "@/components/ui/field";
import { cn } from "@/lib/utils";

import { decodeI32Base64 } from "../binary";
import { formatParam, landmarkMeasure } from "../helpers";
import type { EngineHandle } from "../engine";
import type { LandmarksModel } from "../use-landmarks-model";
import { colorSignal } from "./coloring";
import { GeneHeatStrips } from "./gene-heat-strips";
import {
  compositionSlices,
  embeddingRgbCloud,
  geneHeatRows,
  numericHeatStripData,
  resolvePointMask,
  CLOUD_OTHER_ALPHA_SCALE,
  CLOUD_OTHER_SIZE_SCALE,
  CLOUD_SELECTED_SIZE_SCALE,
} from "./info-stats";
import { InfoStackedBar } from "./info-stacked-bar";
import { NumHeatStrip } from "./num-heat-strip";
import { CLOUD_CUBE, cubeCornerLabel, embeddingCloudPointRadius } from "./rgb-cube";
import { PlotChannelLegend } from "./plot-channel-legend";
import {
  CHART_CAPTION,
  DATA_CARD_BODY,
  EMBEDDED_PANEL,
  FLOAT_PANEL,
  FLOAT_PANEL_CLIP,
  PANEL_INSET,
  PANEL_INSET_Y,
  PANEL_SCROLL,
} from "./sections";

function formatMeasureUm(value: number, kind: "radius" | "area" | "length") {
  const rounded =
    value >= 100 ? Math.round(value).toLocaleString() : formatParam(value, "0");
  if (kind === "area") return `${rounded} µm²`;
  return `${rounded} µm`;
}

function InfoContextRow({
  lm,
  scopeCount,
  compositionTotal,
}: {
  lm: LandmarksModel;
  scopeCount: number;
  compositionTotal: number;
}) {
  const { selected_kind, selected_index, selections, landmarks } = lm;
  const cohortCount = compositionTotal || scopeCount;

  let primary = "";
  if (selected_kind === "landmark" && selected_index >= 0) {
    const row = landmarks[selected_index];
    const name = row?.id || "Landmark";
    const m = landmarkMeasure(row || null);
    if (m) {
      const kindLabel =
        m.kind === "radius" ? "radius" : m.kind === "area" ? "area" : "length";
      primary = `${name} · ${kindLabel} ${formatMeasureUm(m.value, m.kind)}`;
    } else {
      primary = name;
    }
  } else if (selected_kind === "selection" && selected_index >= 0) {
    primary = selections[selected_index]?.id || "Selection";
  }

  const secondary =
    selected_kind === "type" || selected_kind === "selection"
      ? `${scopeCount.toLocaleString()} cells`
      : `All ${cohortCount.toLocaleString()} cells`;

  return (
    <div className="flex flex-col gap-0.5 pb-1.5" data-testid="info-context-row">
      {primary ? (
        <p className={cn(DATA_CARD_BODY, "m-0 truncate")} title={primary}>
          {primary}
        </p>
      ) : null}
      <p className={cn(DATA_CARD_BODY, "m-0 truncate text-foreground/80")}>{secondary}</p>
    </div>
  );
}

function InfoChartWell({
  children,
  legend,
  compact = false,
}: {
  children: ReactNode;
  legend?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "landmarks-info-chart relative flex w-full shrink-0 items-stretch justify-stretch rounded-[var(--radius)]",
        compact ? "min-h-0 py-1" : "h-44",
      )}
      data-testid="info-chart-well"
    >
      <div className="relative flex w-full flex-col justify-center overflow-hidden rounded-[inherit]">
        {children}
      </div>
      {legend}
    </div>
  );
}

function embedChannelCaption(labels: string[]): string {
  if (labels.length >= 3) {
    return `Red ${cubeCornerLabel(labels[0], 0)} · Green ${cubeCornerLabel(labels[1], 1)} · Blue ${cubeCornerLabel(labels[2], 2)}`;
  }
  return labels.join(" · ");
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
    active_genes,
    gene_log1p,
    gene_expression_logged,
    mode,
    x_bounds,
    y_bounds,
    color_vmin,
    color_vmax,
    point_palette,
    legend_title,
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
  const showNumeric = signal === "numeric";
  const showGenes = signal === "genes";
  const showEmbedding = signal === "embedding";
  const showCategories = signal === "categories";

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
    xBounds: x_bounds || [],
    yBounds: y_bounds || [],
  };

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
      x_bounds,
      y_bounds,
    ],
  );

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
      x_bounds,
      y_bounds,
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
      showGenes || showNumeric
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
      showNumeric,
      n,
      compositionMask,
      category_codes,
      category_columns,
      active_category,
    ],
  );

  const compositionTotal = useMemo(
    () => composition.reduce((acc, s) => acc + s.value, 0),
    [composition],
  );

  const geneRows = useMemo(() => {
    if (!showGenes || !genes.length) return [];
    const applyLog = !!gene_log1p && !gene_expression_logged;
    return geneHeatRows({
      n,
      mask: focusMask,
      activeGenes: genes,
      geneLog1p: applyLog,
      columnAt: (name) => lm.genes.column(name),
    });
  }, [
    showGenes,
    n,
    focusMask,
    genes,
    lm.genes,
    lm.gene_version,
    gene_log1p,
    gene_expression_logged,
  ]);

  const numericStrip = useMemo(() => {
    if (!showNumeric) return null;
    return numericHeatStripData({
      n,
      mask: compositionMask,
      pointsDataB64: points_data || "",
      vmin: color_vmin,
      vmax: color_vmax,
    });
  }, [showNumeric, n, compositionMask, points_data, color_vmin, color_vmax]);

  const activeTypeIndex = useMemo(() => {
    if (hoverTypeIndex != null) return hoverTypeIndex;
    if (selected_kind === "type" && selected_index >= 0) return selected_index;
    return null;
  }, [hoverTypeIndex, selected_kind, selected_index]);

  const embeddingCloud = useMemo(() => {
    if (!showEmbedding) return [];
    const labels = lm.embedding_channel_labels || [];
    const hasFocus = selected_kind === "type" || selected_kind === "selection";
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
      <div className="box-border flex h-full min-h-[9rem] w-full flex-col px-0 pb-1 pt-1">
        <svg
          viewBox={`0 0 ${CLOUD_CUBE.vbW} ${CLOUD_CUBE.vbH}`}
          className="min-h-0 w-full flex-1"
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
        {embLabels.length >= 3 ? (
          <p className={cn(CHART_CAPTION, "m-0 pt-1 text-center")} data-testid="embed-axis-caption">
            {embedChannelCaption(embLabels)}
          </p>
        ) : null}
      </div>
    ) : (
      <div className="flex h-full w-full items-center justify-center">
        <FieldDescription className="m-0 max-w-[16rem] text-center text-xs">
          {embLabels.length
            ? "No cells in this scope for the embedding cloud."
            : "Pick an embedding to color points and see the RGB mix."}
        </FieldDescription>
      </div>
    )
  ) : showGenes ? (
    geneRows.length ? (
      <div className="box-border w-full px-0 py-1">
        <GeneHeatStrips rows={geneRows} />
      </div>
    ) : (
      <div className="flex w-full items-center justify-center py-4">
        <FieldDescription className="m-0 text-center text-xs">
          {genes.length
            ? "No expression in this scope."
            : mode === "inspect"
              ? "Pick a gene to color cells"
              : "Pick genes to see expression strips."}
        </FieldDescription>
      </div>
    )
  ) : showNumeric ? (
    numericStrip ? (
      <div className="relative w-full py-1">
        <NumHeatStrip
          data={numericStrip}
          palette={point_palette || []}
          title={legend_title || lm.color || ""}
        />
      </div>
    ) : (
      <div className="flex w-full items-center justify-center py-4">
        <FieldDescription className="m-0 text-center text-xs">
          Pick a numeric obs column to see the heat strip.
        </FieldDescription>
      </div>
    )
  ) : showCategories && composition.length ? (
    <div className="flex w-full flex-col justify-center gap-2 py-1">
      <InfoStackedBar slices={composition} activeTypeIndex={activeTypeIndex} />
    </div>
  ) : (
    <FieldDescription className="m-0 py-4 text-center text-xs">
      {category_columns.length
        ? "No category counts in this scope."
        : "Load categories for composition, or color by genes."}
    </FieldDescription>
  );

  const body = (
    <div className="flex min-h-0 flex-1 flex-col">
      <InfoContextRow
        lm={lm}
        scopeCount={scopeCount}
        compositionTotal={compositionTotal}
      />
      <InfoChartWell
        compact={showCategories || showNumeric || showGenes}
        legend={<PlotChannelLegend lm={lm} />}
      >
        {charts}
      </InfoChartWell>
    </div>
  );

  const insetClass = cn(PANEL_SCROLL, PANEL_INSET, PANEL_INSET_Y);

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
        <div className={insetClass}>{body}</div>
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
        <CardContent className={insetClass}>{body}</CardContent>
      </div>
    </Card>
  );
}
