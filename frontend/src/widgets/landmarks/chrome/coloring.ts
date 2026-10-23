import type { LandmarksModel } from "../use-landmarks-model";

/** Exclusive tissue coloring family (geometry is Points/Raster separately). */
export type ColorSignal = "categories" | "genes" | "embedding";

/** Resolve the active coloring family from model traits. */
export function colorSignal(lm: LandmarksModel): ColorSignal {
  if (lm.color_mode === "obs") return "categories";
  if (lm.render_mode === "raster") {
    if (lm.raster_basis === "embedding") return "embedding";
    if (lm.raster_basis === "genes") return "genes";
    return "categories";
  }
  if (lm.color_mode === "embedding") return "embedding";
  if (lm.color_mode === "continuous") return "genes";
  // Genes intent can outlive an empty selection (user cleared genes).
  if (lm.raster_basis === "genes") return "genes";
  // Prefer genes whenever any are selected — color_mode can lag after View flips.
  if ((lm.active_genes?.length || 0) > 0) {
    return "genes";
  }
  return "categories";
}

/** Short status label for the current coloring value. */
export function colorSignalDetail(
  lm: LandmarksModel,
  signal: ColorSignal = colorSignal(lm),
): string {
  if (signal === "genes") {
    const genes = lm.active_genes || [];
    return genes.length ? genes.join(", ") : "None selected";
  }
  if (signal === "embedding") {
    const key =
      lm.raster_embedding_key ||
      lm.raster_embedding_keys?.[0] ||
      "None selected";
    const labels = lm.embedding_channel_labels || [];
    if (labels.length) return `${key} · ${labels.join(", ")}`;
    return key;
  }
  if (lm.color_mode === "obs") {
    return lm.legend_title || "None selected";
  }
  return lm.active_category || "None selected";
}

export function activateCategories(lm: LandmarksModel) {
  const cols = lm.category_columns || [];
  const col =
    cols.find((c) => c.name === lm.active_category) || cols[0] || null;
  if (col) {
    lm.setActiveCategory(col);
    return;
  }
  lm.setRasterBasis("composition");
}

export function activateGenes(lm: LandmarksModel) {
  const genes = lm.active_genes || [];
  if (genes.length) {
    lm.setActiveGenes(genes);
    return;
  }
  // Intent only until the user picks genes; keep raster basis aligned.
  lm.setRasterBasis("genes");
}

export function activateEmbedding(lm: LandmarksModel) {
  const keys = lm.raster_embedding_keys || [];
  const key = lm.raster_embedding_key || keys[0] || "";
  if (!key) {
    lm.setRasterBasis("embedding");
    return;
  }
  lm.setRasterEmbeddingKey(key);
}
