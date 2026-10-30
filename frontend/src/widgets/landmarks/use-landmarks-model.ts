import { useSyncExternalStore } from "react";

import { useModel } from "@/hooks/use-model";
import type { CellPolygons } from "@/widgets/volume-cube/cell-mesh-source";

import type {
  AnyModel,
  CategoryColumn,
  GeneColumn,
  GeneScaleMode,
  LandmarkItem,
  SelectionItem,
  TypeNeighborhood,
} from "./helpers";
import type { GeneAggregate, GeneStore } from "./gene-store.js";
import { geneStoreFor } from "./gene-store-model";
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
  selectTypeIndex as selectTypeIndexTrait,
  toggleLandmarkHidden as toggleLandmarkHiddenTrait,
  toggleSelectionHidden as toggleSelectionHiddenTrait,
} from "./state";

/** The inferred 3D image of a SpatialData (`{}` without one). Frames are z, y, x. */
export type LandmarksVolume = {
  image_url?: string;
  /** The per-slice cell polygons the cube meshes. */
  cells?: CellPolygons;
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
  selected_type_indices: number[];
  category_columns: CategoryColumn[];
  active_category: string;
  gene_names: GeneColumn[];
  active_genes: string[];
  gene_scale_mode: GeneScaleMode;
  gene_log1p: boolean;
  gene_expression_logged: boolean;
  color_mode: string;
  color: string;
  numeric_obs_columns: string[];
  legend_labels: string[];
  legend_title: string;
  color_vmin: number;
  color_vmax: number;
  point_palette: string[];
  type_neighborhoods: TypeNeighborhood[];
  neighbor_radius_max: number;
  neighbor_k_max: number;
  x_bounds: number[];
  y_bounds: number[];
  points_data: string;
  category_codes: string;
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
  /** Base64 int32 table row per polygon cell (-1 = none), in the polygons' cell order. */
  volume_cell_rows: string;
  /** x0, x1, y0, y1, z0, z1 in µm; `[]` before a cut exists. */
  volume_cut: number[];
  inspect_cx: number | null;
  inspect_cy: number | null;
  inspect_size_um: number;
  /** Whether the Inspect cube is open; Python opens and closes it, the widget writes it back. */
  inspect_open: boolean;
};

const MODEL_KEYS: (keyof LandmarksState)[] = [
  "mode",
  "selections",
  "landmarks",
  "selected_kind",
  "selected_index",
  "selected_type_indices",
  "category_columns",
  "active_category",
  "gene_names",
  "active_genes",
  "gene_scale_mode",
  "gene_log1p",
  "gene_expression_logged",
  "color_mode",
  "color",
  "numeric_obs_columns",
  "legend_labels",
  "legend_title",
  "color_vmin",
  "color_vmax",
  "point_palette",
  "type_neighborhoods",
  "neighbor_radius_max",
  "neighbor_k_max",
  "x_bounds",
  "y_bounds",
  "points_data",
  "category_codes",
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
  "volume_cell_rows",
  "volume_cut",
  "inspect_cx",
  "inspect_cy",
  "inspect_size_um",
  "inspect_open",
];

export type LandmarksModel = LandmarksState & {
  /** Loaded gene slices and the multi-gene aggregate (UI-only, shared with the engine). */
  genes: GeneStore;
  /** Bumps when a gene slice lands or the aggregate changes. */
  gene_version: number;
  setGeneAggregate(mode: GeneAggregate): void;
  setMode(mode: string): void;
  select(kind: string, index: number): void;
  setActiveCategory(col: CategoryColumn): void;
  setColor(key: string): void;
  setActiveGenes(names: string[]): void;
  setGeneScaleMode(mode: GeneScaleMode): void;
  setGeneLog1p(enabled: boolean): void;
  selectType(
    col: CategoryColumn,
    labelIndex: number,
    event?: { metaKey?: boolean; ctrlKey?: boolean },
  ): void;
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
  const genes = geneStoreFor(model);
  const gene_version = useSyncExternalStore(genes.subscribe, () => genes.version);
  const numeric_obs_columns =
    state.numeric_obs_columns ??
    (Array.isArray(model.get("numeric_obs_columns"))
      ? (model.get("numeric_obs_columns") as string[])
      : []);

  return {
    ...state,
    numeric_obs_columns,
    color: state.color ?? String(model.get("color") ?? ""),
    genes,
    gene_version,
    setGeneAggregate(mode) {
      genes.setAggregate(mode);
    },
    setMode(mode) {
      setModeTrait(model, mode);
    },
    select(kind, index) {
      setSelected(model, kind, index);
    },
    setActiveCategory(col) {
      applyActiveCategory(model, col);
    },
    setColor(key) {
      model.set("color", key);
      model.save_changes();
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
    selectType(col, labelIndex, event) {
      if (col.name !== state.active_category) {
        applyActiveCategory(model, col);
      }
      const additive = !!(event?.metaKey || event?.ctrlKey);
      selectTypeIndexTrait(model, labelIndex, { additive });
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
