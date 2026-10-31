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

/** Channel row synced from Python (`volume.channels` mirror). */
export type ImageChannelRow = {
  name: string;
  visible: boolean;
  contrast_limits: [number, number];
  constant_zero?: boolean;
  /** Display tint for map backdrop and layer swatch (optional). */
  color?: string;
};

/** Synced colour catalog (`_color_options`). */
export type ColorOptions = {
  obs?: Record<string, { kind?: string; n_categories?: number; range?: [number, number] }>;
  genes?: GeneColumn[];
  embeddings?: Record<string, number>;
};

/** Derived colour mode and legend (`_color_state`). */
export type ColorStateDict = {
  color_mode?: string;
  legend_title?: string;
  legend_labels?: string[];
  raster_basis?: string;
  raster_embedding_key?: string;
};

/** Palette, gene scale, and embedding RGB dims (`_look`). */
export type LookDict = {
  point_palette?: string[];
  color_vmin?: number;
  color_vmax?: number;
  color_diverging?: boolean;
  color_diverging_override?: boolean;
  gene_scale_mode?: GeneScaleMode;
  gene_log1p?: boolean;
  raster_embedding_dims?: number[];
};

/** The inferred 3D image of a SpatialData (`{}` without one). Frames are z, y, x. */
export type LandmarksVolume = {
  image_url?: string;
  /** The per-slice cell polygons the cube meshes. */
  cells?: CellPolygons;
  voxel_size_um?: [number, number, number];
  origin_um?: [number, number, number];
  contrast_limits?: [number, number];
  dims?: string[];
  is_3d?: boolean;
  coordinate_system?: string;
  image_transform?: Record<string, unknown>;
  channels?: ImageChannelRow[];
};

export type LandmarksState = {
  mode: string;
  selections: SelectionItem[];
  landmarks: LandmarkItem[];
  selected_kind: string;
  selected_index: number;
  selected_type_indices: number[];
  active_category: string;
  active_genes: string[];
  gene_expression_logged: boolean;
  /** Obs column, gene, gene list, or obsm key. */
  color: string | string[];
  _color_options: ColorOptions;
  _color_state: ColorStateDict;
  _look: LookDict;
  _category_columns: CategoryColumn[];
  _category_codes: string;
  type_neighborhoods: TypeNeighborhood[];
  neighbor_radius_max: number;
  neighbor_k_max: number;
  x_bounds: number[];
  y_bounds: number[];
  points_data: string;
  _embedding_values: string;
  _embedding_channel_labels: string[];
  point_size: number;
  default_buffer_width: number;
  promote_buffer_tick: number;
  show_rulers: boolean;
  render_mode: string;
  raster_bin_size: number;
  raster_window_radius: number;
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
  z_focus_um: number;
  z_band_lo_um: number;
  z_band_hi_um: number;
  _image_channels: ImageChannelRow[];
  _image_visible: boolean;
  _image_alpha: number;
};

const MODEL_KEYS: (keyof LandmarksState)[] = [
  "mode",
  "selections",
  "landmarks",
  "selected_kind",
  "selected_index",
  "selected_type_indices",
  "active_category",
  "active_genes",
  "gene_expression_logged",
  "color",
  "_color_options",
  "_color_state",
  "_look",
  "_category_columns",
  "_category_codes",
  "type_neighborhoods",
  "neighbor_radius_max",
  "neighbor_k_max",
  "x_bounds",
  "y_bounds",
  "points_data",
  "_embedding_values",
  "_embedding_channel_labels",
  "point_size",
  "default_buffer_width",
  "promote_buffer_tick",
  "show_rulers",
  "render_mode",
  "raster_bin_size",
  "raster_window_radius",
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
  "z_focus_um",
  "z_band_lo_um",
  "z_band_hi_um",
  "_image_channels",
  "_image_visible",
  "_image_alpha",
];

function colorText(value: unknown): string {
  if (Array.isArray(value)) return value.map(String).filter(Boolean).join(", ");
  return value == null ? "" : String(value);
}

export type LandmarksModel = Omit<LandmarksState, "color"> & {
  /** Single string for chrome; gene lists join with a comma. */
  color: string;
  /** ``_category_columns`` as the chrome reads it. */
  category_columns: CategoryColumn[];
  /** ``_category_codes``. */
  category_codes: string;
  /** Gene catalogue from ``_color_options.genes``. */
  gene_names: GeneColumn[];
  gene_scale_mode: GeneScaleMode;
  gene_log1p: boolean;
  /** ``_color_state.color_mode``. */
  color_mode: string;
  /** Numeric obs names from ``_color_options.obs``. */
  _numeric_obs_columns: string[];
  legend_labels: string[];
  legend_title: string;
  color_vmin: number;
  color_vmax: number;
  color_diverging: boolean;
  point_palette: string[];
  embedding_values: string;
  embedding_channel_labels: string[];
  raster_basis: string;
  raster_embedding_key: string;
  raster_embedding_keys: string[];
  raster_embedding_dims: number[];
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
  setZBand(patch: { focus?: number; lo?: number; hi?: number }): void;
  setImageVisible(visible: boolean): void;
  setImageAlpha(alpha: number): void;
  patchImageChannel(name: string, patch: Partial<Pick<ImageChannelRow, "visible" | "contrast_limits">>): void;
  activeNeighborhood(): ReturnType<typeof neighborhoodFor>;
  selectedLandmark(): LandmarkItem | null;
};

/** Typed landmarks state + domain actions; chrome never touches raw traitlets. */
function numericObsColumns(options: ColorOptions | undefined): string[] {
  return Object.entries(options?.obs ?? {})
    .filter(([, meta]) => meta?.kind === "numeric")
    .map(([name]) => name);
}

export function useLandmarksModel(model: AnyModel): LandmarksModel {
  const state = useModel<LandmarksState>(model, MODEL_KEYS);
  const genes = geneStoreFor(model);
  const gene_version = useSyncExternalStore(genes.subscribe, () => genes.version);
  const colorState = state._color_state ?? {};
  const look = state._look ?? {};
  const options = state._color_options ?? {};
  const category_columns = state._category_columns ?? [];
  const category_codes = state._category_codes ?? "";
  const legend_labels = colorState.legend_labels ?? [];
  const legend_title = colorState.legend_title ?? "";
  const active_category = state.active_category ?? "";
  const color_mode = colorState.color_mode || "categorical";
  const raster_basis = colorState.raster_basis || "composition";
  const raster_embedding_key = colorState.raster_embedding_key ?? "";
  const raster_embedding_keys = Object.keys(options.embeddings ?? {});
  const raster_embedding_dims = look.raster_embedding_dims ?? [];
  const point_palette = look.point_palette ?? [];
  const color_vmin = look.color_vmin ?? 0;
  const color_vmax = look.color_vmax ?? 1;
  const color_diverging = !!look.color_diverging;
  const gene_scale_mode: GeneScaleMode = look.gene_scale_mode === "shared" ? "shared" : "independent";
  const gene_log1p = !!look.gene_log1p;
  const gene_names = options.genes ?? [];
  const embedding_values = state._embedding_values ?? "";
  const embedding_channel_labels = state._embedding_channel_labels ?? [];
  const _numeric_obs_columns = numericObsColumns(options);
  const color = colorText(state.color ?? model.get("color"));

  return {
    ...state,
    color,
    category_columns,
    category_codes,
    gene_names,
    gene_scale_mode,
    gene_log1p,
    color_mode,
    _numeric_obs_columns,
    legend_labels,
    legend_title,
    color_vmin,
    color_vmax,
    color_diverging,
    point_palette,
    embedding_values,
    embedding_channel_labels,
    raster_basis,
    raster_embedding_key,
    raster_embedding_keys,
    raster_embedding_dims,
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
      if (col.name !== active_category) {
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
        legend_labels,
        active_category,
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
    setZBand(patch) {
      if (patch.focus != null) model.set("z_focus_um", patch.focus);
      if (patch.lo != null) model.set("z_band_lo_um", patch.lo);
      if (patch.hi != null) model.set("z_band_hi_um", patch.hi);
      model.save_changes();
    },
    setImageVisible(visible) {
      model.set("_image_visible", visible);
      model.save_changes();
    },
    setImageAlpha(alpha) {
      model.set("_image_alpha", Math.max(0, Math.min(1, alpha)));
      model.save_changes();
    },
    patchImageChannel(name, patch) {
      const rows = [...(model.get("_image_channels") as ImageChannelRow[] | undefined) || []];
      const vol = { ...(model.get("volume") as LandmarksVolume | undefined) };
      const volChannels = [...(vol.channels || [])];
      const apply = (list: ImageChannelRow[]) => {
        const i = list.findIndex((c) => c.name === name);
        if (i < 0) return list;
        const next = { ...list[i], ...patch };
        if (patch.contrast_limits) {
          next.contrast_limits = [
            patch.contrast_limits[0],
            patch.contrast_limits[1],
          ] as [number, number];
        }
        const out = list.slice();
        out[i] = next;
        return out;
      };
      const nextRows = apply(rows);
      const nextVolChannels = apply(volChannels);
      model.set("_image_channels", nextRows);
      model.set("volume", { ...vol, channels: nextVolChannels });
      model.save_changes();
    },
    activeNeighborhood() {
      return neighborhoodFor(
        state.selected_kind,
        state.selected_index,
        state.selections,
        state.type_neighborhoods,
        legend_labels,
        active_category,
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
