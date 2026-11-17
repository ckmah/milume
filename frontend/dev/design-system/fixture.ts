import type { GeneStore } from "@/widgets/landmarks/gene-store";
import type { LandmarkItem, SelectionItem } from "@/widgets/landmarks/helpers";
import type { LandmarksModel } from "@/widgets/landmarks/use-landmarks-model";

/** One XY point at z = 12 µm, float32 little-endian. */
export const ONE_POINT_B64 = "AAAAAAAAAAAAAAAAAABAQQ==";

const noop = () => {};

function geneStore(partial: Partial<GeneStore> = {}): GeneStore {
  return {
    version: 0,
    aggregate: "mean",
    setAggregate: noop,
    subscribe: () => noop,
    setEager: noop,
    clear: noop,
    dropColumns: noop,
    has: () => false,
    meta: () => null,
    error: () => null,
    pending: () => [],
    ensure: async () => {},
    column: () => null,
    stats: () => ({
      fetches: 0,
      fetchedGenes: 0,
      densified: 0,
      evictions: 0,
      lruBytes: 0,
      lruGenes: 0,
      pinnedGenes: 0,
      denseColumns: 0,
      denseBytes: 0,
      pending: 0,
      budgetBytes: 0,
    }),
    ...partial,
  };
}

const pointLandmark: LandmarkItem = {
  id: "crypt-1",
  type: "point",
  color: "#3d7dff",
  vertices: [[0, 0]],
};

const selection: SelectionItem = {
  id: "lasso-1",
  type: "lasso",
};

/** Plain fixture. Methods are no-ops. Callers override the fields they render. */
export function harnessModel(
  partial: Partial<LandmarksModel> = {},
): LandmarksModel {
  const base = {
    color: "cell_type",
    category_columns: [
      {
        name: "cell_type",
        labels: ["Epithelium", "Stroma"],
        palette: ["#3d7dff", "#ff8a00"],
      },
    ],
    category_codes: "",
    gene_names: [
      { name: "Epcam" },
      { name: "Col1a1" },
      { name: "A very long gene symbol that should clip in the chip" },
    ],
    gene_scale_mode: "independent",
    gene_log1p: false,
    gene_expression_logged: false,
    color_mode: "categorical",
    _numeric_obs_columns: ["nCount_RNA"],
    legend_labels: ["Epithelium", "Stroma"],
    legend_title: "cell_type",
    color_vmin: 0,
    color_vmax: 8,
    color_diverging: false,
    point_palette: ["#1a1a1a", "#3d7dff", "#ffd60a", "#ff3b3b"],
    embedding_values: "",
    embedding_channel_labels: ["PC1", "PC2", "PC3"],
    raster_basis: "composition",
    raster_embedding_key: "X_pca",
    raster_embedding_keys: ["X_pca", "X_umap"],
    raster_embedding_dims: [0, 1, 2],
    genes: geneStore(),
    gene_version: 0,
    active_genes: ["Epcam"],
    active_category: "cell_type",
    x_bounds: [0, 100],
    y_bounds: [0, 80],
    point_size: 4,
    points_data: "",
    render_mode: "points",
    show_rulers: false,
    mode: "select",
    selected_kind: "",
    selected_index: -1,
    selected_type_indices: [],
    landmarks: [pointLandmark],
    selections: [selection],
    volume: {
      image_url: "fixture://image",
      channels: [],
    },
    _image_channels: [
      {
        name: "DAPI",
        visible: true,
        contrast_limits: [0, 255] as [number, number],
        color: "#3d7dff",
      },
      {
        name: "A channel name long enough to overflow the row",
        visible: false,
        contrast_limits: [10, 200] as [number, number],
        color: "#ff3b3b",
      },
    ],
    _image_visible: true,
    _image_alpha: 0.55,
    z_band_lo_um: 2,
    z_band_hi_um: 10,
    z_focus_um: 6,
    setGeneAggregate: noop,
    setMode: noop,
    select: noop,
    setActiveCategory: noop,
    setColor: noop,
    setActiveGenes: noop,
    setGeneScaleMode: noop,
    setGeneLog1p: noop,
    selectType: noop,
    patchNeighborhood: noop,
    patchLandmark: noop,
    deleteSelection: noop,
    deleteLandmark: noop,
    duplicateLandmark: noop,
    renameSelection: noop,
    renameLandmark: noop,
    toggleLandmarkHidden: noop,
    toggleSelectionHidden: noop,
    promoteNeighborhoodToSelection: noop,
    promoteBufferToSelection: noop,
    reverseLandmark: noop,
    convertLandmarkType: noop,
    patchLandmarks: noop,
    deleteLandmarks: noop,
    setShowRulers: noop,
    setRenderMode: noop,
    setRasterBinSize: noop,
    setRasterBasis: noop,
    setRasterEmbeddingKey: noop,
    setRasterEmbeddingDims: noop,
    setRasterThreshold: noop,
    clearRasterQuery: noop,
    setZBand: noop,
    setImageVisible: noop,
    setImageAlpha: noop,
    setPointSize: noop,
    patchImageChannel: noop,
    activeNeighborhood: () => null,
    selectedLandmark: () => pointLandmark,
  };
  return { ...base, ...partial, genes: partial.genes ?? base.genes } as LandmarksModel;
}
