import { useMemo } from "react";

import type { MapScatterPoint } from "@/widgets/volume-cube/cube-points";

import type { EngineHandle } from "./engine";
import type { LandmarksModel } from "./use-landmarks-model";

/**
 * Scatter points inside an Inspect window, coloured like the 2D layer. Empty
 * when points mode is off or the window centre is unset.
 */
export function useCubeScatterPoints(
  engine: EngineHandle | null,
  lm: LandmarksModel,
  cx: number | null | undefined,
  cy: number | null | undefined,
  sizeUm: number,
): MapScatterPoint[] {
  const showPoints = (lm.render_mode || "points") === "points";

  return useMemo(() => {
    if (!engine || !showPoints || cx == null || cy == null) return [];
    return engine.getScatterPointsInWindow(cx, cy, sizeUm);
  }, [
    engine,
    showPoints,
    cx,
    cy,
    sizeUm,
    lm.points_data,
    lm.x_bounds,
    lm.y_bounds,
    lm.point_size,
    lm.color_by,
    lm.active_category,
    lm.category_columns,
    lm.category_codes,
    lm.active_genes,
    lm.gene_values,
    lm.gene_scale_mode,
    lm.gene_log1p,
    lm.embedding_values,
    lm.embedding_channel_labels,
    lm.selected_kind,
    lm.selected_index,
    lm.selected_type_indices,
    lm.selections,
    lm.type_neighborhoods,
    lm.raster_similarity_enabled,
    lm.raster_query_bin,
  ]);
}
