/** Read colour catalog, derived state, and look settings from the widget model. */

export function colorState(model) {
  return model.get("_color_state") || {};
}

export function lookState(model) {
  return model.get("_look") || {};
}

export function colorOptions(model) {
  return model.get("_color_options") || { obs: {}, genes: [], embeddings: {} };
}

export function colorMode(model) {
  return colorState(model).color_mode || "categorical";
}

export function legendTitle(model) {
  return colorState(model).legend_title || "";
}

export function legendLabels(model) {
  return colorState(model).legend_labels || [];
}

export function rasterBasis(model) {
  return colorState(model).raster_basis || "composition";
}

export function rasterEmbeddingKey(model) {
  return colorState(model).raster_embedding_key || "";
}

export function embeddingKeys(model) {
  return Object.keys(colorOptions(model).embeddings || {});
}

export function pointPalette(model) {
  return lookState(model).point_palette || [];
}

export function colorVmin(model) {
  return lookState(model).color_vmin ?? 0;
}

export function colorVmax(model) {
  return lookState(model).color_vmax ?? 1;
}

export function geneScaleMode(model) {
  return lookState(model).gene_scale_mode || "independent";
}

export function geneLog1p(model) {
  return !!lookState(model).gene_log1p;
}

export function rasterEmbeddingDims(model) {
  return lookState(model).raster_embedding_dims || [];
}

export function categoryColumns(model) {
  return model.get("_category_columns") || [];
}

export function categoryCodes(model) {
  return model.get("_category_codes") || "";
}

export function geneCatalog(model) {
  return colorOptions(model).genes || [];
}

export function numericObsColumns(model) {
  const obs = colorOptions(model).obs || {};
  return Object.entries(obs)
    .filter(([, meta]) => meta && meta.kind === "numeric")
    .map(([name]) => name);
}

export function patchLook(model, patch) {
  model.set("_look", { ...lookState(model), ...patch });
}

export const COLOR_DERIVED_WATCH_KEYS = ["_color_state", "_look"];
export const COLOR_BULK_WATCH_KEYS = [
  "_category_columns",
  "_category_codes",
  "_color_options",
  "_embedding_values",
  "_embedding_channel_labels",
  "_embedding_matrix",
  "_embedding_matrix_dim",
  "_gene_csc_data",
  "_gene_csc_indices",
  "_gene_csc_indptr",
];
