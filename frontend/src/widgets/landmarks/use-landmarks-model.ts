import { useModel } from "@/hooks/use-model";

import type {
  AnyModel,
  CategoryColumn,
  GeneColumn,
  GeneScaleMode,
  LandmarkItem,
  SelectionItem,
  TypeNeighborhood,
} from "./helpers";
import {
  applyActiveCategory,
  clearRasterQuery as clearRasterQueryTrait,
  deleteLandmark as deleteLandmarkTrait,
  deleteSelection as deleteSelectionTrait,
  duplicateLandmark as duplicateLandmarkTrait,
  neighborhoodFor,
  patchLandmark as patchLandmarkTrait,
  patchNeighborhood as patchNeighborhoodTrait,
  renameLandmark as renameLandmarkTrait,
  renameSelection as renameSelectionTrait,
  promoteBufferToSelection as promoteBufferToSelectionTrait,
  promoteNeighborhoodToSelection as promoteNeighborhoodToSelectionTrait,
  reverseLandmark as reverseLandmarkTrait,
  convertLandmarkType as convertLandmarkTypeTrait,
  deleteLandmarks as deleteLandmarksTrait,
  patchLandmarks as patchLandmarksTrait,
  setActiveGenes as setActiveGenesTrait,
  setGeneLog1p as setGeneLog1pTrait,
  setGeneScaleMode as setGeneScaleModeTrait,
  setMode as setModeTrait,
  setRasterBasis as setRasterBasisTrait,
  setRasterBinSize as setRasterBinSizeTrait,
  setRasterEmbeddingDims as setRasterEmbeddingDimsTrait,
  setRasterEmbeddingKey as setRasterEmbeddingKeyTrait,
  setRasterThreshold as setRasterThresholdTrait,
  setRenderMode as setRenderModeTrait,
  setSelected,
  toggleLandmarkHidden as toggleLandmarkHiddenTrait,
  toggleSelectionHidden as toggleSelectionHiddenTrait,
} from "./state";

/** The inferred 3D image of a SpatialData (`{}` without one). Frames are z, y, x. */
export type LandmarksVolume = {
  image_url?: string;
  labels_url?: string;
  voxel_size_um?: [number, number, number];
  origin_um?: [number, number, number];
  contrast_limits?: [number, number];
};

export type LandmarksState = {
  mode: string;
  selections: SelectionItem[];
  landmarks: LandmarkItem[];
  selected_kind: string;
  selected_index: number;
  category_columns: CategoryColumn[];
  active_category: string;
  gene_columns: GeneColumn[];
  active_genes: string[];
  gene_scale_mode: GeneScaleMode;
  gene_log1p: boolean;
  gene_expression_logged: boolean;
  color_by: string;
  legend_labels: string[];
  type_neighborhoods: TypeNeighborhood[];
  neighbor_radius_max: number;
  neighbor_k_max: number;
  x_bounds: number[];
  y_bounds: number[];
  points_data: string;
  category_codes: string;
  gene_values: string;
  gene_format: string;
  gene_csc_indptr: string;
  gene_csc_indices: string;
  gene_csc_data: string;
  embedding_values: string;
  embedding_channel_labels: string[];
  point_size: number;
  default_buffer_width: number;
  promote_buffer_tick: number;
  show_rulers: boolean;
  render_mode: string;
  raster_bin_size: number;
  raster_window_radius: number;
  raster_basis: string;
  raster_embedding_key: string;
  raster_embedding_keys: string[];
  raster_embedding_dims: number[];
  raster_feature_dim: number;
  raster_feature_labels: string[];
  raster_threshold: number;
  raster_query_bin: number;
  raster_status: string;
  raster_n_bins: number;
  raster_similarity_enabled: boolean;
  volume: LandmarksVolume;
  /** Base64 int32 label id per table row (0 = none). */
  volume_label_ids: string;
  /** x0, x1, y0, y1, z0, z1 in µm; `[]` before a cut exists. */
  volume_cut: number[];
  inspect_cx: number | null;
  inspect_cy: number | null;
  inspect_size_um: number;
};

const MODEL_KEYS: (keyof LandmarksState)[] = [
  "mode",
  "selections",
  "landmarks",
  "selected_kind",
  "selected_index",
  "category_columns",
  "active_category",
  "gene_columns",
  "active_genes",
  "gene_scale_mode",
  "gene_log1p",
  "gene_expression_logged",
  "color_by",
  "legend_labels",
  "type_neighborhoods",
  "neighbor_radius_max",
  "neighbor_k_max",
  "x_bounds",
  "y_bounds",
  "points_data",
  "category_codes",
  "gene_values",
  "gene_format",
  "gene_csc_indptr",
  "gene_csc_indices",
  "gene_csc_data",
  "embedding_values",
  "embedding_channel_labels",
  "point_size",
  "default_buffer_width",
  "promote_buffer_tick",
  "show_rulers",
  "render_mode",
  "raster_bin_size",
  "raster_window_radius",
  "raster_basis",
  "raster_embedding_key",
  "raster_embedding_keys",
  "raster_embedding_dims",
  "raster_feature_dim",
  "raster_feature_labels",
  "raster_threshold",
  "raster_query_bin",
  "raster_status",
  "raster_n_bins",
  "raster_similarity_enabled",
  "volume",
  "volume_label_ids",
  "volume_cut",
  "inspect_cx",
  "inspect_cy",
  "inspect_size_um",
];

export type LandmarksModel = LandmarksState & {
  setMode(mode: string): void;
  select(kind: string, index: number): void;
  setActiveCategory(col: CategoryColumn): void;
  setActiveGenes(names: string[]): void;
  setGeneScaleMode(mode: GeneScaleMode): void;
  setGeneLog1p(enabled: boolean): void;
  selectType(col: CategoryColumn, labelIndex: number): void;
  patchNeighborhood(patch: Record<string, unknown>): void;
  patchLandmark(patch: Record<string, unknown>): void;
  deleteSelection(index: number): void;
  deleteLandmark(index: number): void;
  duplicateLandmark(index: number): void;
  renameSelection(index: number, name: string): void;
  renameLandmark(index: number, name: string): void;
  toggleLandmarkHidden(index: number): void;
  toggleSelectionHidden(index: number): void;
  promoteNeighborhoodToSelection(): void;
  promoteBufferToSelection(): void;
  reverseLandmark(): void;
  convertLandmarkType(nextType: string): void;
  patchLandmarks(indices: number[], patch: Record<string, unknown>): void;
  deleteLandmarks(indices: number[]): void;
  setShowRulers(show: boolean): void;
  setRenderMode(mode: string): void;
  setRasterBinSize(size: number): void;
  setRasterBasis(basis: string): void;
  setRasterEmbeddingKey(key: string): void;
  setRasterEmbeddingDims(dims: number[]): void;
  setRasterThreshold(value: number): void;
  clearRasterQuery(): void;
  activeNeighborhood(): ReturnType<typeof neighborhoodFor>;
  selectedLandmark(): LandmarkItem | null;
};

/** Typed landmarks state + domain actions; chrome never touches raw traitlets. */
export function useLandmarksModel(model: AnyModel): LandmarksModel {
  const state = useModel<LandmarksState>(model, MODEL_KEYS);

  return {
    ...state,
    setMode(mode) {
      setModeTrait(model, mode);
    },
    select(kind, index) {
      setSelected(model, kind, index);
    },
    setActiveCategory(col) {
      applyActiveCategory(model, col);
    },
    setActiveGenes(names) {
      setActiveGenesTrait(model, names);
    },
    setGeneScaleMode(mode) {
      setGeneScaleModeTrait(model, mode);
    },
    setGeneLog1p(enabled) {
      setGeneLog1pTrait(model, enabled);
    },
    selectType(col, labelIndex) {
      if (col.name !== state.active_category) {
        applyActiveCategory(model, col);
      }
      setSelected(model, "type", labelIndex);
    },
    patchNeighborhood(patch) {
      patchNeighborhoodTrait(
        model,
        state.selected_kind,
        state.selected_index,
        patch,
        state.selections,
        state.type_neighborhoods,
        state.legend_labels,
        state.active_category,
      );
    },
    patchLandmark(patch) {
      if (state.selected_kind !== "landmark" || state.selected_index < 0) return;
      patchLandmarkTrait(model, state.selected_index, patch, state.landmarks);
    },
    deleteSelection(index) {
      deleteSelectionTrait(
        model,
        index,
        state.selections,
        state.selected_kind,
        state.selected_index,
      );
    },
    deleteLandmark(index) {
      deleteLandmarkTrait(
        model,
        index,
        state.landmarks,
        state.selected_kind,
        state.selected_index,
      );
    },
    duplicateLandmark(index) {
      duplicateLandmarkTrait(model, index, state.landmarks);
    },
    renameSelection(index, name) {
      renameSelectionTrait(model, index, name, state.selections);
    },
    renameLandmark(index, name) {
      renameLandmarkTrait(model, index, name, state.landmarks);
    },
    toggleLandmarkHidden(index) {
      toggleLandmarkHiddenTrait(model, index, state.landmarks);
    },
    toggleSelectionHidden(index) {
      toggleSelectionHiddenTrait(model, index, state.selections);
    },
    promoteNeighborhoodToSelection() {
      promoteNeighborhoodToSelectionTrait(model);
    },
    promoteBufferToSelection() {
      promoteBufferToSelectionTrait(model);
    },
    reverseLandmark() {
      if (state.selected_kind !== "landmark" || state.selected_index < 0) return;
      reverseLandmarkTrait(
        model,
        state.selected_index,
        state.landmarks,
      );
    },
    convertLandmarkType(nextType) {
      if (state.selected_kind !== "landmark" || state.selected_index < 0) return;
      convertLandmarkTypeTrait(
        model,
        state.selected_index,
        state.landmarks,
        nextType,
      );
    },
    patchLandmarks(indices, patch) {
      patchLandmarksTrait(model, indices, patch, state.landmarks);
    },
    deleteLandmarks(indices) {
      deleteLandmarksTrait(
        model,
        indices,
        state.landmarks,
        state.selected_kind,
        state.selected_index,
      );
    },
    setShowRulers(show) {
      model.set("show_rulers", !!show);
      model.save_changes();
    },
    setRenderMode(mode) {
      setRenderModeTrait(model, mode);
    },
    setRasterBinSize(size) {
      setRasterBinSizeTrait(model, size);
    },
    setRasterBasis(basis) {
      setRasterBasisTrait(model, basis);
    },
    setRasterEmbeddingKey(key) {
      setRasterEmbeddingKeyTrait(model, key);
    },
    setRasterEmbeddingDims(dims) {
      setRasterEmbeddingDimsTrait(model, dims);
    },
    setRasterThreshold(value) {
      setRasterThresholdTrait(model, value);
    },
    clearRasterQuery() {
      clearRasterQueryTrait(model);
    },
    activeNeighborhood() {
      return neighborhoodFor(
        state.selected_kind,
        state.selected_index,
        state.selections,
        state.type_neighborhoods,
        state.legend_labels,
        state.active_category,
      );
    },
    selectedLandmark() {
      if (state.selected_kind !== "landmark" || state.selected_index < 0) {
        return null;
      }
      return state.landmarks[state.selected_index] ?? null;
    },
  };
}
