import {
  Deck,
  OrthographicView,
  LinearInterpolator,
} from "@deck.gl/core";
import {
  ScatterplotLayer,
  PathLayer,
  PolygonLayer,
  BitmapLayer,
  TextLayer,
} from "@deck.gl/layers";
import { PathStyleExtension } from "@deck.gl/extensions";
import { ZoomWidget, ResetViewWidget } from "@deck.gl/widgets";
import {
  neighborhoodFor as neighborhoodForArgs,
  patchLandmark,
  patchNeighborhood,
  setSelected as setSelectedTrait,
  setMode as setModeTrait,
  deleteLandmark as deleteLandmarkTrait,
  deleteSelection as deleteSelectionTrait,
  withHood,
  setLandmarks,
  insertLandmarkVertex,
  deleteLandmarkVertex,
  reverseLandmark,
  convertLandmarkType,
  typeFocusIndices,
} from "./landmarks_state.js";
import {
  BUFFERABLE,
  TENSION_TYPES,
  NODE_EDITABLE,
  circlePolygon,
  bufferPolylineRound,
  shapeBufferCorridor,
  bufferPolysToDeck,
  pointInBufferPolys,
  pointInRing,
  distPointToSeg,
} from "./landmarks_geometry.js";
import {
  blendGeneSrgb,
  LOW_EXPR_SRGB,
} from "./gene-expression-blend.js";
import {
  buildSpatialIndex,
  queryNeighbors,
  warmNeighborQueryScratch,
} from "../../frontend/src/widgets/landmarks/spatial-neighbors.js";
import {
  hashSeedIndices,
  neighborGeomCacheKey,
  shouldDrawKnnEdgeLines,
} from "../../frontend/src/widgets/landmarks/neighborhood-perf.js";
import { bakeRadiusDistanceField } from "../../frontend/src/widgets/landmarks/neighborhood-radius-bake.js";
import {
  DEFAULT_BIN_SIZE,
  buildRaster,
  defaultWindowRadius,
} from "../../frontend/src/widgets/landmarks/spatial-raster.js";

/** Pinned with frontend package.json (@deck.gl/*@9.2.11); bundled by Vite. */
const DECK_MODULES = {
  Deck,
  OrthographicView,
  LinearInterpolator,
  ScatterplotLayer,
  PathLayer,
  PolygonLayer,
  BitmapLayer,
  TextLayer,
  PathStyleExtension,
  ZoomWidget,
  ResetViewWidget,
};

/** Landmark dashed stroke (path units / pixels). */
const LANDMARK_DASH = [8, 5];
/** Selection outline: dotted [dot, gap] in path units (pixels with widthUnits). */
const SELECTION_DOT = [2, 4];

/** Hide stock widget DOM; React/shadcn chrome calls the same handle methods. */
const HIDDEN_WIDGET_STYLE = { display: "none" };
const OVERLAY_GL = { depthCompare: "always", depthWriteEnabled: false };

const COLORS = ["#00e5ff", "#ff2d95", "#b8ff00", "#ffb000", "#7c4dff", "#00ffa3"];
const FALLBACK_POINT = "#00e5ff";
const SEL_COLORS = ["#a3a3a3", "#8a8a8a", "#737373", "#c4c4c4"];
const POINT_OPACITY = 0.8;
/** When a map mosaic backdrop is configured, scatter alpha is scaled so tissue reads through. */
const MAP_MOSAIC_POINT_ALPHA_SCALE = 0.52;
const LANDMARK_OPACITY = 0.28;
const STROKE_WIDTH = 2;
const DEFAULT_TENSION = 0;
const DEFAULT_BUFFER_SIDE = "both";
/** DESIGN.md neighborhood-teal */
const NEIGH_COLOR = "#b3f2e8";
const NEIGH_FILL_ALPHA = 0.3;
const NEIGH_LINE_ALPHA = 0.9;
/** kNN edge restyle: thin, low-opacity teal wash */
const NEIGH_EDGE_ALPHA = 0.28;
const NEIGH_EDGE_WIDTH = 0.75;
/** Radius soft-gradient field (baked BitmapLayer; no per-seed disk strokes). */
/** Peak alpha kept low so scatter + seed/neighbor roles stay primary. */
const NEIGH_GRADIENT_PEAK_ALPHA = 0.18;
/** Muted teal wash (DESIGN neighborhood-teal desaturated) for the field only. */
const NEIGH_GRADIENT_COLOR = "#8ebfb6";
const SEED_ROLE = 2;
const NEIGH_ROLE = 1;
/** Selected / seed points grow slightly when a type or selection is focused. */
const SELECTED_SIZE_SCALE = 1.28;
/** Unselected points shrink when a type/selection is focused. */
const OTHER_SIZE_SCALE = 0.55;
/** Unselected point alpha multiplier while focused. */
const OTHER_ALPHA_SCALE = 0.28;
/**
 * Single-gene / observation high stop (DESIGN sequential-high).
 * Low stop is the plot background (theme-aware).
 */
const RASTER_SEQ_HIGH = [255, 0, 153];
/** Additive embedding / multi-gene channels (keep in sync with helpers GENE_COLORS): magenta / lime / azure. */
const RASTER_RGB_CHANNELS = ["#ff0099", "#5cbf00", "#0088cc"];

function clamp01(t) {
  return Math.max(0, Math.min(1, Number(t) || 0));
}

function lerpRgb(low, high, t) {
  const u = clamp01(t);
  return [
    Math.round(low[0] + (high[0] - low[0]) * u),
    Math.round(low[1] + (high[1] - low[1]) * u),
    Math.round(low[2] + (high[2] - low[2]) * u),
  ];
}

/** Similarity colormap: Fabio Crameri lajolla (sequential, 0→1). */
const LAJOLLA_LUT = [
  [25, 25, 0],
  [32, 28, 4],
  [39, 30, 8],
  [48, 33, 13],
  [57, 36, 18],
  [67, 40, 23],
  [78, 44, 29],
  [92, 48, 36],
  [106, 53, 44],
  [121, 58, 51],
  [137, 63, 58],
  [154, 67, 64],
  [173, 71, 70],
  [188, 76, 73],
  [202, 81, 75],
  [213, 90, 77],
  [220, 101, 78],
  [224, 112, 79],
  [226, 122, 80],
  [228, 131, 81],
  [230, 142, 81],
  [232, 151, 82],
  [234, 161, 83],
  [236, 170, 84],
  [238, 180, 85],
  [241, 192, 88],
  [243, 203, 96],
  [246, 215, 111],
  [249, 227, 132],
  [252, 239, 159],
  [254, 247, 182],
  [255, 254, 203],
];

function sampleSimilarityColor(t) {
  const u = clamp01(t);
  const n = LAJOLLA_LUT.length;
  if (n <= 1) return LAJOLLA_LUT[0] || [0, 0, 0];
  const x = u * (n - 1);
  const i0 = Math.min(n - 2, Math.max(0, Math.floor(x)));
  const f = x - i0;
  return lerpRgb(LAJOLLA_LUT[i0], LAJOLLA_LUT[i0 + 1], f);
}

/** Parse ``rgb()`` / ``rgba()`` / ``#hex`` to ``[r,g,b]``; fallback black. */
function cssColorToRgb(css) {
  const s = String(css || "").trim();
  if (!s) return [0, 0, 0];
  if (s[0] === "#") {
    const h = s.slice(1);
    const full =
      h.length === 3
        ? h
            .split("")
            .map((c) => c + c)
            .join("")
        : h.padEnd(6, "0").slice(0, 6);
    const n = Number.parseInt(full, 16);
    if (!Number.isFinite(n)) return [0, 0, 0];
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const m = s.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i);
  if (m) {
    return [
      Math.round(Number(m[1])),
      Math.round(Number(m[2])),
      Math.round(Number(m[3])),
    ];
  }
  return [0, 0, 0];
}

function rasterGrayCssGradient(dir = "to top") {
  return `linear-gradient(${dir}, #000 0%, #fff 100%)`;
}

const RASTER_DENSITY_ALPHA = 0.85;
const RASTER_DIM_ALPHA = 0.18;
const RASTER_QUERY_STROKE = "#ffffff";
const RASTER_HOVER_STROKE = "#e5e5e5";
/** Probe window disk at cursor / pinned query (world units, radius = window). */
const PROBE_PINNED_STROKE = "#ffffff";
const PROBE_HOVER_STROKE = "#d4d4d4";
const PROBE_PINNED_WIDTH = 2;
const PROBE_HOVER_WIDTH = 1.5;
const RASTER_TEXTURE_MAX = 1024;
const RASTER_LANDMARK_GRAY = "#c4c4c4";

/** CSS/Penner easeOutQuart for camera transitions. */
function easeOutQuart(t) {
  return 1 - Math.pow(1 - t, 4);
}

const WHEEL_ZOOM_SPEED = 0.01; // deck.gl default
const WHEEL_ZOOM_BOOST = 4; // extra gain at tiny deltas (trackpad gesture start)
const WHEEL_ZOOM_KNEE = 10; // px delta where the boost has fallen to 1/2

/** Shift+wheel often reports deltaX on macOS/Chrome; prefer vertical then horizontal. */
function wheelDelta(e) {
  const dy = e.deltaY || 0;
  const dx = e.deltaX || 0;
  if (dy !== 0) return dy;
  return dx;
}

function decodeF32Base64(b64) {
  if (!b64) return new Float32Array(0);
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Float32Array(bytes.buffer);
}

function decodeI32Base64(b64) {
  if (!b64) return new Int32Array(0);
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Int32Array(bytes.buffer);
}

function cssColorToClear(color) {
  const probe = document.createElement("canvas");
  probe.width = probe.height = 1;
  const ctx = probe.getContext("2d", { willReadFrequently: true });
  ctx.fillStyle = "#000000";
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
  return [r / 255, g / 255, b / 255, a / 255 || 1];
}

/** The Inspect window's side (µm), fixed in X/Y: the dock loads it at full resolution. */
export const INSPECT_WINDOW_UM = 300;

/**
 * `inspectWindowUm` overrides the Inspect window's side (harness only: the toy
 * volume is smaller than the product window).
 */
export function mountEngine({ model, host, inspectWindowUm = INSPECT_WINDOW_UM }) {
  if (!host) throw new Error("mountEngine: host element is required");

  const container = host.closest(".landmarks");
  const body = host.closest(".landmarks__body");
  const main = host.closest(".landmarks__main") || host.parentElement;
  if (!container || !body || !main) {
    throw new Error(
      "mountEngine: host must sit inside .landmarks > .landmarks__body > .landmarks__main",
    );
  }

  host.replaceChildren();
  host.classList.add("landmarks__plot-host");
  host.style.position = "relative";
  host.style.flex = "1 1 auto";
  host.style.minHeight = "0";
  host.style.width = "100%";
  host.style.height = "100%";

  const plotStack = document.createElement("div");
  plotStack.className = "landmarks__plot";
  const webglCanvas = document.createElement("canvas");
  webglCanvas.className = "landmarks__webgl";
  webglCanvas.tabIndex = 0;
  const legend = document.createElement("div");
  legend.className = "landmarks__legend";
  legend.hidden = true;
  plotStack.append(webglCanvas, legend);
  host.append(plotStack);

  // React owns theme class apply (dark / landmarks--dark / landmarks--light).
  // Re-clear the deck when those classes change on the container.
  let rasterImageCache = { key: "", image: null, bounds: null };
  let mapMosaicCache = { url: "", image: null, bounds: null, loading: false };
  let applyPlotBackground = () => { };
  /** Cached CSS bg + deck clearColor — invalidated on theme class changes. */
  let cachedPlotBackground = null;
  let cachedPlotClearColor = null;
  const themeObserver = new MutationObserver(() => {
    applyPlotBackground();
    // Observation sequential low-stop tracks plot background — rebuild texture.
    rasterImageCache = { key: "", image: null, bounds: null };
    if (deckgl) setDeckLayers();
  });
  themeObserver.observe(container, {
    attributes: true,
    attributeFilter: ["class"],
  });

  function tooltipStyle() {
    const styles = getComputedStyle(container);
    return {
      background: styles.getPropertyValue("--lm-tooltip-bg").trim() || "#0f172a",
      color: styles.getPropertyValue("--lm-tooltip-text").trim() || "#f8fafc",
      fontSize: "11px",
      fontWeight: "500",
      padding: "4px 8px",
      borderRadius: "4px",
      boxShadow: "0 2px 8px rgba(0, 0, 0, 0.18)",
    };
  }

  /** Native Deck tooltip content (replaces engine-owned tooltip DOM). */
  function deckTooltip(info) {
    const drafting =
      draft.length > 0 && ["polygon", "line", "spline", "shape"].includes(currentMode);
    if (drafting) {
      const need = currentMode === "line" || currentMode === "spline" ? 2 : 3;
      return {
        text: draft.length >= need ? "Enter to finish" : "Click",
        style: tooltipStyle(),
      };
    }
    // No hover tooltips: landmark tips are off and cells are not hover-picked
    // (a GPU pick over ~10^5 points stalled wheel zoom).
    return null;
  }

  legend.addEventListener("mousedown", (e) => e.stopPropagation());
  legend.addEventListener("wheel", (e) => e.stopPropagation(), { passive: true });

  const INTERACTION_MODES = ["select", "node", "move", "probe", "inspect"];
  const GEOMETRY_MODES = ["lasso", "polygon", "rectangle", "ellipse"];
  const LANDMARK_MODES = ["point", "line", "spline", "shape"];
  const modes = [...INTERACTION_MODES, ...GEOMETRY_MODES, ...LANDMARK_MODES];
  /** Single-key mode map (digits = landmark tools; letters = nav / selection). */
  const MODE_BY_KEY = {
    v: "select",
    n: "node",
    h: "move",
    p: "probe",
    i: "inspect",
    l: "lasso",
    r: "rectangle",
    o: "ellipse",
    g: "polygon",
    1: "point",
    2: "line",
    3: "spline",
    4: "shape",
  };
  let currentMode = model.get("mode") || "select";
  // Migrate legacy pick id "pointer" → select. (Older "select"=pan already remapped to move in prior releases.)
  if (currentMode === "select") currentMode = "select";
  if (!modes.includes(currentMode)) currentMode = modes[0] || "select";
  /** When true (default in node mode), edge hover ghost + click inserts a vertex. */
  let nodeInsertArmed = true;

  /** In-memory clipboard for landmark / selection copy-paste. */
  let editClipboard = null;

  let hoverTarget = null;
  let hoverRaf = 0;

  function isGeometryMode(mode) {
    return ["lasso", "polygon", "rectangle", "ellipse"].includes(mode);
  }
  function isLandmarkDrawMode(mode) {
    return ["point", "line", "spline", "shape"].includes(mode);
  }
  function sameTarget(a, b) {
    if (!a && !b) return true;
    if (!a || !b) return false;
    return a.kind === b.kind && a.index === b.index;
  }


  let deckgl = null;
  let deckModules = null;
  let zoomWidget = null;
  let resetWidget = null;
  let plotW = 0;
  let plotH = 0;
  let currentViewState = null;
  let viewStateListeners = [];
  /** `loading` until deck's first fit; `error` on init failure or timeout. */
  let plotBootstrap = { state: "loading" };
  let plotBootstrapListeners = [];
  const PLOT_BOOTSTRAP_TIMEOUT_MS = 45_000;
  let plotBootstrapTimer = setTimeout(() => {
    if (plotBootstrap.state !== "loading") return;
    setPlotBootstrap({
      state: "error",
      message: "Map took too long to load",
    });
  }, PLOT_BOOTSTRAP_TIMEOUT_MS);
  function setPlotBootstrap(next) {
    if (plotBootstrap.state === next.state && plotBootstrap.message === next.message) return;
    plotBootstrap = next;
    if (next.state !== "loading" && plotBootstrapTimer) {
      clearTimeout(plotBootstrapTimer);
      plotBootstrapTimer = 0;
    }
    for (const fn of plotBootstrapListeners) {
      try {
        fn(plotBootstrap);
      } catch {
        /* ignore */
      }
    }
  }
  let hoverListeners = [];
  let landmarkMenuListeners = [];
  let layerRaf = 0;
  /** Last non-probe deck layers we published (never read deck.props.layers). */
  let probeBaseLayers = [];
  let fittedOnce = false;
  let fitZoom = null;
  let pointsCache = { key: "", data: [] };
  let pointRoles = null;
  let pointRoleMode = false;
  let hoodEdges = [];
  let hoodKnnEdgeLinesDrawn = false;
  let focusGeomCache = { key: "", pointRoles: null, hoodEdges: [], knnEdgeLinesDrawn: false };
  let hoodRadiusBake = null; // { key, dist, w, h, bounds, seedCount, textureSize, rMax }
  let hoodRadiusGradient = null; // remapped view { key, image, bounds, seedCount, textureSize, radius, bakeRMax }
  let zoomBy = () => { };
  let resetZoom = () => { };
  let zoomInterpolator = null;
  let categoryCodes = null;
  let geneValues = null; // dense Float32Array col-major (all catalog genes) or null
  let geneCsc = null; // { indptr, indices, data, nObs } or null
  /** Lazily densified CSC → col-major Float32Array (nObs × nGenes), same layout as gene_values. */
  let geneDenseFromCsc = null;
  let spatialIndex = null;
  let spatialIndexPointCount = 0;
  let spatialIndexBuildHandle = 0;
  let spatialIndexReadyMs = null;
  let perfEpochMs = performance.now();
  /** Harness: force k-NN edge PathLayer for cutoff sweeps. */
  let benchForceKnnEdges = false;
  /** GPU scatter: base fill colors (full opacity), rebuilt when coloring changes. */
  let pointFillColors = null;
  let pointDimColors = null;
  let pointFillColorsKey = "";
  let pointPositionBuffer = null;
  let pointPositionBufferSource = null;
  let hoodHighlightData = [];
  let hoodHighlightKey = "";
  let deckLayersPublishSeq = 0;
  let pointFillColorsBuildHandle = 0;
  let scatterDisplayColors = null;
  let scatterDisplayRadii = null;
  let scatterRoleRevision = 0;
  let embeddingValues = null;
  let embeddingMatrix = null; // Float32Array row-major n×d raw
  let embeddingMatrixDim = 0;
  let rasterCache = {
    key: "",
    rows: null,
    cols: null,
    counts: null,
    features: null,
    flatToCompact: null,
  };
  let rasterScores = null; // Float32Array | null
  let rasterScoreKey = "";
  let clientRasterKey = "";
  let rasterRebuildDepth = 0;
  let hoverBinIndex = -1;
  let hoverPointIndex = -1;

  function refreshCategoryCodes() {
    const b64 = model.get("category_codes") || "";
    categoryCodes = b64 ? decodeI32Base64(b64) : null;
  }
  refreshCategoryCodes();

  function refreshGeneValues() {
    const fmt = model.get("gene_format") || "dense";
    geneValues = null;
    geneCsc = null;
    geneDenseFromCsc = null;
    if (fmt === "csc") {
      const indptr = decodeI32Base64(model.get("gene_csc_indptr") || "");
      const indices = decodeI32Base64(model.get("gene_csc_indices") || "");
      const data = decodeF32Base64(model.get("gene_csc_data") || "");
      if (indptr.length) geneCsc = { indptr, indices, data };
      return;
    }
    const b64 = model.get("gene_values") || "";
    geneValues = b64 ? decodeF32Base64(b64) : null;
  }
  refreshGeneValues();

  /** One-time CSC → dense for O(1) point lookups (coloring + raster). */
  function ensureGeneDenseFromCsc() {
    if (!geneCsc) return null;
    const { indptr, indices, data } = geneCsc;
    const nGenes = Math.max(0, (indptr.length | 0) - 1);
    const n = getPointsData().length;
    if (!nGenes || !n) {
      geneDenseFromCsc = new Float32Array(0);
      return geneDenseFromCsc;
    }
    if (geneDenseFromCsc && geneDenseFromCsc.length === n * nGenes) {
      return geneDenseFromCsc;
    }
    const dense = new Float32Array(n * nGenes);
    for (let g = 0; g < nGenes; g++) {
      const start = indptr[g] | 0;
      const end = indptr[g + 1] | 0;
      const col = g * n;
      for (let p = start; p < end; p++) {
        const i = indices[p] | 0;
        if (i >= 0 && i < n) dense[col + i] = data[p] || 0;
      }
    }
    geneDenseFromCsc = dense;
    return dense;
  }

  function refreshEmbeddingValues() {
    const b64 = model.get("embedding_values") || "";
    embeddingValues = b64 ? decodeF32Base64(b64) : null;
  }
  refreshEmbeddingValues();

  function refreshEmbeddingMatrix() {
    const b64 = model.get("embedding_matrix") || "";
    embeddingMatrix = b64 ? decodeF32Base64(b64) : null;
    embeddingMatrixDim = model.get("embedding_matrix_dim") | 0;
  }
  refreshEmbeddingMatrix();

  function invalidatePointColorBuffers() {
    pointFillColors = null;
    pointDimColors = null;
    pointFillColorsKey = "";
    if (pointFillColorsBuildHandle && typeof cancelIdleCallback === "function") {
      cancelIdleCallback(pointFillColorsBuildHandle);
    }
    pointFillColorsBuildHandle = 0;
  }

  function schedulePointFillColorsBuild() {
    if (pointFillColorsBuildHandle) return;
    const run = () => {
      pointFillColorsBuildHandle = 0;
      const data = getPointsData();
      if (!data.length) return;
      const probeField =
        pointSimilarityOn() || rasterSimilarityOn()
          ? activePointProbeScores()
          : null;
      ensurePointFillColors(probeField);
    };
    if (typeof requestIdleCallback === "function") {
      pointFillColorsBuildHandle = requestIdleCallback(run, { timeout: 2500 });
    } else {
      setTimeout(run, 0);
    }
  }

  function rebuildPointFillColorsFast(probeField) {
    const data = getPointsData();
    const n = data.length;
    const colors = new Uint8ClampedArray(n * 4);
    const mode = model.get("color_by") || "categorical";
    if (!probeField && mode === "categorical" && categoryCodes) {
      const cols = model.get("category_columns") || [];
      const ci = activeCategoryIndex();
      const col = ci >= 0 ? cols[ci] : null;
      const palette = (col && col.palette) || model.get("point_palette") || [FALLBACK_POINT];
      const row = ci >= 0 ? ci * n : 0;
      for (let i = 0; i < n; i++) {
        const code = col ? categoryCodes[row + i] | 0 : Math.round(data[i].valueA);
        const rgba = hexToRgbaBytes(
          palette[((code % palette.length) + palette.length) % palette.length],
          POINT_OPACITY,
        );
        const o = i * 4;
        colors[o] = rgba[0];
        colors[o + 1] = rgba[1];
        colors[o + 2] = rgba[2];
        colors[o + 3] = rgba[3];
      }
      pointFillColors = colors;
      pointFillColorsKey = pointColorCacheKey(probeField);
      pointDimColors = null;
      return colors;
    }
    for (let i = 0; i < n; i++) {
      writeFillColorForPoint(data[i], probeField, colors, i * 4);
    }
    pointFillColors = colors;
    pointFillColorsKey = pointColorCacheKey(probeField);
    pointDimColors = null;
    return colors;
  }

  function invalidatePointGeometryBuffers() {
    pointPositionBuffer = null;
    pointPositionBufferSource = null;
    scatterDisplayColors = null;
    scatterDisplayRadii = null;
    invalidatePointColorBuffers();
  }

  function syncScatterRoleAttributes() {
    const data = getPointsData();
    const n = data.length;
    if (!n) return;
    const size = model.get("point_size") ?? 2;
    const probeField =
      pointSimilarityOn() || rasterSimilarityOn()
        ? activePointProbeScores()
        : null;
    const base = ensurePointFillColors(probeField);
    if (!scatterDisplayColors || scatterDisplayColors.length !== n * 4) {
      scatterDisplayColors = new Uint8ClampedArray(n * 4);
    }
    if (!scatterDisplayRadii || scatterDisplayRadii.length !== n) {
      scatterDisplayRadii = new Float32Array(n);
    }
    if (!pointRoleMode || !pointRoles) {
      scatterDisplayColors.set(base);
      if (mapMosaicUrl()) {
        for (let i = 0; i < n; i++) {
          const o = i * 4 + 3;
          scatterDisplayColors[o] = scaleAlphaForMapMosaic(scatterDisplayColors[o] || 255);
        }
      }
      scatterDisplayRadii.fill(size);
      scatterRoleRevision++;
      return;
    }
    for (let i = 0; i < n; i++) {
      const role = pointRoles[i] || 0;
      const o = i * 4;
      scatterDisplayColors[o] = base[o];
      scatterDisplayColors[o + 1] = base[o + 1];
      scatterDisplayColors[o + 2] = base[o + 2];
      if (role === SEED_ROLE || role === NEIGH_ROLE) {
        scatterDisplayColors[o + 3] = 255;
        scatterDisplayRadii[i] =
          role === SEED_ROLE ? size * SELECTED_SIZE_SCALE : size;
      } else {
        scatterDisplayColors[o + 3] = Math.round((base[o + 3] || 255) * OTHER_ALPHA_SCALE);
        scatterDisplayRadii[i] = size * OTHER_SIZE_SCALE;
      }
    }
    scatterRoleRevision++;
  }

  function ensurePointPositionBuffer(data) {
    if (!data.length) {
      pointPositionBuffer = null;
      pointPositionBufferSource = null;
      return;
    }
    if (data === pointPositionBufferSource && pointPositionBuffer) return;
    const n = data.length;
    const buf = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const o = i * 3;
      buf[o] = data[i].x;
      buf[o + 1] = data[i].y;
      buf[o + 2] = 0;
    }
    pointPositionBuffer = buf;
    pointPositionBufferSource = data;
  }

  function pointColorCacheKey(probeField) {
    return [
      pointsCache.key,
      POINT_OPACITY,
      model.get("point_palette"),
      model.get("color_by"),
      model.get("active_genes"),
      model.get("gene_values"),
      model.get("gene_scale_mode"),
      model.get("gene_log1p"),
      model.get("embedding_values"),
      model.get("embedding_channel_labels"),
      model.get("embedding_matrix"),
      clientRasterKey,
      model.get("raster_n_bins"),
      model.get("raster_feature_dim"),
      model.get("raster_query_bin"),
      model.get("raster_similarity_enabled"),
      model.get("raster_embedding_dims"),
      hoverBinIndex,
      hoverPointIndex,
      pinnedPointIndex,
      probeScrubSeq,
      pinnedProbeWorld,
      currentMode,
      model.get("category_columns"),
      model.get("active_category"),
      probeField ? 1 : 0,
    ].join("|");
  }

  function writeFillColorForPoint(d, probeField, out, offset) {
    const opacity = POINT_OPACITY;
    const sim = similarityRgbaForPoint(d.i, opacity, probeField);
    if (sim) {
      out[offset] = sim[0];
      out[offset + 1] = sim[1];
      out[offset + 2] = sim[2];
      out[offset + 3] = sim[3];
      return;
    }
    const mode = model.get("color_by") || "categorical";
    let rgba;
    if (mode === "embedding") {
      rgba =
        blendEmbeddingColors(d.i, opacity) ||
        hexToRgbaBytes("#6b7280", opacity * 0.35);
    } else if (mode === "continuous") {
      const activeGenes = model.get("active_genes") || [];
      if (activeGenes.length > 0) {
        rgba =
          blendGeneColors(d.i, opacity) ||
          hexToRgbaBytes("#6b7280", opacity * 0.35);
      } else {
        rgba = hexToRgbaBytes("#6b7280", opacity);
      }
    } else {
      const cols = model.get("category_columns") || [];
      const ci = activeCategoryIndex();
      const col = ci >= 0 ? cols[ci] : null;
      const palette = (col && col.palette) || model.get("point_palette") || [FALLBACK_POINT];
      const code = col ? categoryCodeAt(d.i) : Math.round(d.valueA);
      rgba = hexToRgbaBytes(palette[((code % palette.length) + palette.length) % palette.length], opacity);
    }
    out[offset] = rgba[0];
    out[offset + 1] = rgba[1];
    out[offset + 2] = rgba[2];
    out[offset + 3] = rgba[3];
  }

  function ensurePointFillColors(probeField) {
    const data = getPointsData();
    const n = data.length;
    const key = pointColorCacheKey(probeField);
    if (pointFillColors && key === pointFillColorsKey && pointFillColors.length === n * 4) {
      return pointFillColors;
    }
    return rebuildPointFillColorsFast(probeField);
  }

  function scheduleSpatialIndexBuild(sync = false) {
    const pts = getPointsData();
    if (!pts.length) {
      spatialIndex = null;
      return;
    }
    if (spatialIndex && !sync) return;
    if (sync) {
      if (spatialIndexBuildHandle) {
        cancelIdleCallback(spatialIndexBuildHandle);
        spatialIndexBuildHandle = 0;
      }
      spatialIndex = buildSpatialIndex(pts);
      spatialIndexPointCount = pts.length;
      if (spatialIndexReadyMs == null) spatialIndexReadyMs = performance.now() - perfEpochMs;
      warmNeighborQueryScratch(pts.length);
      return;
    }
    if (spatialIndexBuildHandle) return;
    const run = () => {
      spatialIndexBuildHandle = 0;
      spatialIndex = buildSpatialIndex(pts);
      spatialIndexPointCount = pts.length;
      if (spatialIndexReadyMs == null) spatialIndexReadyMs = performance.now() - perfEpochMs;
      warmNeighborQueryScratch(pts.length);
    };
    if (typeof requestIdleCallback === "function") {
      spatialIndexBuildHandle = requestIdleCallback(run, { timeout: 1500 });
    } else {
      setTimeout(run, 0);
    }
  }

  function ensureSpatialIndexForQuery() {
    const pts = getPointsData();
    if (spatialIndex && spatialIndexPointCount === pts.length) return spatialIndex;
    if (spatialIndexBuildHandle) {
      if (typeof cancelIdleCallback === "function") {
        cancelIdleCallback(spatialIndexBuildHandle);
      }
      spatialIndexBuildHandle = 0;
    }
    spatialIndex = buildSpatialIndex(pts);
    spatialIndexPointCount = pts.length;
    if (spatialIndexReadyMs == null) spatialIndexReadyMs = performance.now() - perfEpochMs;
    warmNeighborQueryScratch(pts.length);
    return spatialIndex;
  }

  function refreshSpatialIndex() {
    if (spatialIndexBuildHandle) {
      if (typeof cancelIdleCallback === "function") {
        cancelIdleCallback(spatialIndexBuildHandle);
      }
      spatialIndexBuildHandle = 0;
    }
    spatialIndex = null;
    spatialIndexPointCount = 0;
    scheduleSpatialIndexBuild(true);
  }

  function isRasterMode() {
    return (model.get("render_mode") || "points") === "raster";
  }

  function probeModeOn() {
    return currentMode === "probe" || !!model.get("raster_similarity_enabled");
  }

  function hasRasterFeatures() {
    return (model.get("raster_n_bins") | 0) > 0 && (model.get("raster_feature_dim") | 0) > 0;
  }

  /** Raster probe: bin-feature cosine (requires packed raster features). */
  function rasterSimilarityOn() {
    return probeModeOn() && isRasterMode() && hasRasterFeatures();
  }

  /** Points probe: similarity field while scrubbing / pinned. */
  function pointSimilarityOn() {
    return probeModeOn() && !isRasterMode();
  }

  /** Prefer bin-backed query+scores (raster cost) when packed features exist. */
  function binBackedPointsProbeOn() {
    return pointSimilarityOn() && hasRasterFeatures();
  }

  /**
   * Gene coloring (points continuous or raster genes basis).
   */
  function genesColoringOn() {
    if (isRasterMode()) return model.get("raster_basis") === "genes";
    return model.get("color_by") === "continuous";
  }

  /**
   * Gene mode with no selection: hover stays inert (no circle / scrub).
   * With active_genes, hover scrubs like other color modes.
   */
  function genesProbeHoverInert() {
    if (!genesColoringOn()) return false;
    return !(model.get("active_genes") || []).length;
  }

  function shouldMaintainClientRaster() {
    return (
      isRasterMode() ||
      probeModeOn() ||
      !!model.get("raster_similarity_enabled") ||
      (model.get("raster_n_bins") | 0) > 0
    );
  }

  /** Build gene feature matrix row-major (n × active_genes). */
  function geneFeatureMatrix(n) {
    const active = model.get("active_genes") || [];
    const dim = active.length | 0;
    if (!dim) return { features: null, dim: 0, labels: [] };
    if (!geneValues?.length && !geneCsc) return { features: null, dim: 0, labels: [] };
    const denseCsc = geneCsc ? ensureGeneDenseFromCsc() : null;
    const features = new Float32Array(n * dim);
    for (let g = 0; g < dim; g++) {
      const gi = geneColumnIndex(active[g]);
      if (gi < 0) continue;
      if (denseCsc) {
        const col = gi * n;
        for (let i = 0; i < n; i++) {
          features[i * dim + g] = denseCsc[col + i] || 0;
        }
      } else {
        for (let i = 0; i < n; i++) {
          features[i * dim + g] = genePackedAt(i, gi) || 0;
        }
      }
    }
    return { features, dim, labels: active.map(String) };
  }

  /** Active-category codes as Int32Array length n. */
  function compositionCodeVector(n) {
    const cols = model.get("category_columns") || [];
    const ci = activeCategoryIndex();
    const col = ci >= 0 ? cols[ci] : null;
    const labels = col?.labels || [];
    const nLabels = labels.length | 0;
    if (!nLabels || !categoryCodes) {
      return { codes: null, nCats: 0, labels: [] };
    }
    const codes = new Int32Array(n);
    for (let i = 0; i < n; i++) {
      codes[i] = categoryCodes[ci * n + i] | 0;
    }
    return { codes, nCats: nLabels, labels: labels.map(String) };
  }

  /**
   * Client-side bin assignment + windowed multi-d aggregation.
   * Writes scalar meta onto the model facade; TypedArrays stay in rasterCache.
   */
  function ensureClientRaster() {
    if (!shouldMaintainClientRaster()) {
      return null;
    }
    if (rasterRebuildDepth) return rasterCache.key ? rasterCache : null;
    const pts = getPointsData();
    const n = pts.length;
    let binSize = Number(model.get("raster_bin_size")) || 0;
    if (!(binSize > 0)) {
      binSize = DEFAULT_BIN_SIZE;
      model.set("raster_bin_size", binSize);
    }
    let windowRadius = Number(model.get("raster_window_radius"));
    if (!(windowRadius > 0) || !Number.isFinite(windowRadius)) {
      windowRadius = defaultWindowRadius(binSize);
      model.set("raster_window_radius", windowRadius);
    }
    const basis = model.get("raster_basis") || "composition";
    const genes = (model.get("active_genes") || []).join(",");
    const embKey = model.get("raster_embedding_key") || "";
    const cat = model.get("active_category") || "";
    const key = [
      pointsCache.key,
      n,
      binSize,
      windowRadius,
      basis,
      genes,
      embKey,
      cat,
      embeddingMatrix ? embeddingMatrix.length : 0,
      embeddingMatrixDim,
      geneValues ? geneValues.length : 0,
      geneCsc ? geneCsc.indptr.length : 0,
      categoryCodes ? categoryCodes.length : 0,
    ].join("|");
    if (
      key === clientRasterKey &&
      rasterCache.features != null &&
      (rasterCache.nBins | 0) >= 0
    ) {
      return rasterCache;
    }

    rasterRebuildDepth += 1;
    try {
      if (!spatialIndex) refreshSpatialIndex();

      let built;
      if (basis === "genes") {
        const gm = geneFeatureMatrix(n);
        built = buildRaster({
          xy: pts,
          binSize,
          windowRadius,
          tree: spatialIndex,
          basis: "genes",
          features: gm.features,
          featureDim: gm.dim,
          featureLabels: gm.labels,
        });
      } else if (basis === "embedding") {
        const dim = embeddingMatrixDim | 0;
        const ok =
          dim > 0 && embeddingMatrix && embeddingMatrix.length >= n * dim;
        const labels = ok
          ? Array.from({ length: dim }, (_, i) => String(i))
          : [];
        built = buildRaster({
          xy: pts,
          binSize,
          windowRadius,
          tree: spatialIndex,
          basis: "embedding",
          features: ok ? embeddingMatrix : null,
          featureDim: ok ? dim : 0,
          featureLabels: labels,
        });
      } else {
        const comp = compositionCodeVector(n);
        built = buildRaster({
          xy: pts,
          binSize,
          windowRadius,
          tree: spatialIndex,
          basis: "composition",
          codes: comp.codes,
          nCats: comp.nCats,
          catLabels: comp.labels,
        });
      }

      // Publish cache before model meta so nested onChange sees a complete build.
      rasterCache = {
        key,
        rows: built.rows,
        cols: built.cols,
        counts: built.counts,
        features: built.features,
        flatToCompact: built.flatToCompact,
        nBins: built.n_bins,
        dim: built.feature_dim,
        normed: null,
      };
      clientRasterKey = key;
      rasterScores = null;
      rasterScoreKey = "";
      rasterImageCache = { key: "", image: null, bounds: null };
      pointBinCache = { key: "", bins: null };

      if ((model.get("raster_query_bin") ?? -1) >= 0) {
        model.set("raster_query_bin", -1);
      }
      model.set("raster_origin_x", built.origin_x);
      model.set("raster_origin_y", built.origin_y);
      model.set("raster_bin_size", built.bin_size);
      model.set("raster_window_radius", built.window_radius);
      model.set("raster_n_cols", built.n_cols);
      model.set("raster_n_rows", built.n_rows);
      model.set("raster_n_bins", built.n_bins);
      model.set("raster_feature_dim", built.feature_dim);
      model.set("raster_feature_labels", built.feature_labels);
      model.set("raster_status", "ready");
      return rasterCache;
    } catch (err) {
      model.set("raster_status", `error:${err?.message || err}`);
      clientRasterKey = "";
      return null;
    } finally {
      rasterRebuildDepth -= 1;
    }
  }

  function refreshRasterArrays() {
    const built = ensureClientRaster();
    if (built) return built;
    if (rasterCache.key === "empty") return rasterCache;
    rasterCache = {
      key: "empty",
      rows: new Int32Array(0),
      cols: new Int32Array(0),
      counts: new Int32Array(0),
      features: new Float32Array(0),
      flatToCompact: new Int32Array(0),
      nBins: 0,
      dim: 0,
      normed: null,
    };
    clientRasterKey = "";
    return rasterCache;
  }

  /** Row-wise L2-normalized bin features (full dim); built once per raster cache. */
  function normalizedRasterFeatures(cache) {
    if (cache.normed) return cache.normed;
    const n = cache.nBins | 0;
    const dim = cache.dim | 0;
    const feats = cache.features;
    if (!n || !dim || !feats || feats.length < n * dim) {
      cache.normed = null;
      return null;
    }
    const normed = new Float32Array(n * dim);
    for (let i = 0; i < n; i++) {
      let rn = 0;
      const off = i * dim;
      for (let d = 0; d < dim; d++) {
        const v = feats[off + d] || 0;
        normed[off + d] = v;
        rn += v * v;
      }
      rn = Math.sqrt(rn) || 1;
      const inv = 1 / rn;
      for (let d = 0; d < dim; d++) normed[off + d] *= inv;
    }
    cache.normed = normed;
    return normed;
  }

  function lerpHex(a, b, t) {
    const pa = hexToRgbaBytes(a, 1);
    const pb = hexToRgbaBytes(b, 1);
    const u = Math.max(0, Math.min(1, t));
    return [
      Math.round(pa[0] + (pb[0] - pa[0]) * u),
      Math.round(pa[1] + (pb[1] - pa[1]) * u),
      Math.round(pa[2] + (pb[2] - pa[2]) * u),
    ];
  }

  function cosineScoresForQuery(queryIdx) {
    const cache = refreshRasterArrays();
    const n = cache.nBins | 0;
    const dim = cache.dim | 0;
    const feats = cache.features;
    if (queryIdx < 0 || queryIdx >= n || !dim || !feats || feats.length < n * dim) {
      return null;
    }
    const dimMask = embeddingDimMask(dim);
    const key = `${cache.key}:${queryIdx}:${dimMask.join(",")}`;
    if (rasterScoreKey === key && rasterScores) return rasterScores;
    const scores = new Float32Array(n);
    const fullMask = dimMask.length === dim;
    if (fullMask) {
      // Pre-normalized rows → cosine is a dot product.
      const normed = normalizedRasterFeatures(cache);
      if (!normed) return null;
      const qOff = queryIdx * dim;
      for (let i = 0; i < n; i++) {
        let dot = 0;
        const off = i * dim;
        for (let d = 0; d < dim; d++) dot += normed[off + d] * normed[qOff + d];
        scores[i] = dot;
      }
    } else {
      // Embedding dim subset: normalize on the masked coords only.
      const q = new Float32Array(dimMask.length);
      let qn = 0;
      const qOff = queryIdx * dim;
      for (let k = 0; k < dimMask.length; k++) {
        const v = feats[qOff + dimMask[k]] || 0;
        q[k] = v;
        qn += v * v;
      }
      qn = Math.sqrt(qn) || 1;
      for (let k = 0; k < q.length; k++) q[k] /= qn;
      for (let i = 0; i < n; i++) {
        let dot = 0;
        let rn = 0;
        const off = i * dim;
        for (let k = 0; k < dimMask.length; k++) {
          const v = feats[off + dimMask[k]] || 0;
          rn += v * v;
          dot += v * q[k];
        }
        rn = Math.sqrt(rn) || 1;
        scores[i] = dot / rn;
      }
    }
    rasterScores = scores;
    rasterScoreKey = key;
    return scores;
  }

  /** Empty trait = all dims. Non-embedding bases ignore the mask. */
  function embeddingDimMask(dim) {
    const basis = model.get("raster_basis") || "composition";
    if (basis !== "embedding") {
      const all = new Array(dim);
      for (let i = 0; i < dim; i++) all[i] = i;
      return all;
    }
    const raw = model.get("raster_embedding_dims") || [];
    const picked = [];
    const seen = new Set();
    for (const d of raw) {
      const i = d | 0;
      if (i >= 0 && i < dim && !seen.has(i)) {
        seen.add(i);
        picked.push(i);
      }
    }
    if (!picked.length) {
      const all = new Array(dim);
      for (let i = 0; i < dim; i++) all[i] = i;
      return all;
    }
    return picked;
  }

  function columnMinMax(feats, n, dim, col) {
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = 0; i < n; i++) {
      const v = feats[i * dim + col];
      if (!Number.isFinite(v)) continue;
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    if (!(hi > lo)) return { lo: 0, span: 1 };
    return { lo, span: hi - lo };
  }

  /** Plot-canvas RGB used as the continuous low stop (dark/light aware). */
  function observationLowRgb() {
    return cssColorToRgb(resolvePlotBackground());
  }

  /**
   * Rest-state observation RGB for one compact bin (no similarity).
   * Composition: majority category → point_palette (same as points categorical).
   * Genes: selected active_genes — 1 gene background→magenta; multi additive
   * magenta/lime/azure over background. Embedding: additive RGB channels.
   */
  function observationColorForBin(i, cache, colStats) {
    const basis = model.get("raster_basis") || "composition";
    const dim = cache.dim | 0;
    const feats = cache.features;
    const n = cache.nBins | 0;
    const low = observationLowRgb();
    // Genes at rest (none selected): match points continuous → neutral grey.
    if (basis === "genes") {
      const active = model.get("active_genes") || [];
      if (!active.length) {
        const grey = hexToRgbaBytes("#6b7280", 1);
        return [grey[0], grey[1], grey[2]];
      }
    }
    if (!dim || !feats || feats.length < n * dim) {
      return low;
    }
    const off = i * dim;
    if (basis === "embedding") {
      const mask = embeddingDimMask(dim);
      const channels = mask.slice(0, 3);
      if (channels.length === 0) return low;
      let r = 0;
      let g = 0;
      let b = 0;
      let w = 0;
      for (let ci = 0; ci < channels.length; ci++) {
        const col = channels[ci];
        const st = colStats[col] || { lo: 0, span: 1 };
        const t = clamp01((feats[off + col] - st.lo) / st.span);
        if (!(t > 0)) continue;
        const rgb = hexToRgbaBytes(RASTER_RGB_CHANNELS[ci % RASTER_RGB_CHANNELS.length], 1);
        r += rgb[0] * t;
        g += rgb[1] * t;
        b += rgb[2] * t;
        w += t;
      }
      if (w < 1e-6) return low;
      // Mix additive signal over the plot background so lows read on light canvases.
      const a = Math.min(1, w);
      return [
        Math.min(255, Math.round(low[0] * (1 - a) + r)),
        Math.min(255, Math.round(low[1] * (1 - a) + g)),
        Math.min(255, Math.round(low[2] * (1 - a) + b)),
      ];
    }
    if (basis === "composition") {
      // Majority cell type = argmax category fraction (same palette as points).
      let best = 0;
      let bestV = -1;
      for (let d = 0; d < dim; d++) {
        const v = Math.max(0, feats[off + d] || 0);
        if (v > bestV) {
          bestV = v;
          best = d;
        }
      }
      if (!(bestV > 0)) return low;
      const palette = model.get("point_palette") || [];
      const hex =
        palette.length > 0
          ? palette[((best % palette.length) + palette.length) % palette.length]
          : FALLBACK_POINT;
      const rgb = hexToRgbaBytes(hex, 1);
      return [rgb[0], rgb[1], rgb[2]];
    }
    if (basis === "genes") {
      // Selected active genes only (feature cols match active_genes order).
      // 1 gene: theme background → magenta (points continuous). Multi: additive
      // Magenta / lime / azure over background (points ``blendGeneColors``).
      if (dim === 1) {
        const st = colStats[0] || { lo: 0, span: 1 };
        const t = clamp01((feats[off] - st.lo) / st.span);
        return lerpRgb(low, RASTER_SEQ_HIGH, t);
      }
      let r = 0;
      let g = 0;
      let b = 0;
      let w = 0;
      const nChan = Math.min(dim, RASTER_RGB_CHANNELS.length);
      for (let d = 0; d < nChan; d++) {
        const st = colStats[d] || { lo: 0, span: 1 };
        const t = clamp01((feats[off + d] - st.lo) / st.span);
        if (!(t > 0)) continue;
        const rgb = hexToRgbaBytes(RASTER_RGB_CHANNELS[d % RASTER_RGB_CHANNELS.length], 1);
        r += rgb[0] * t;
        g += rgb[1] * t;
        b += rgb[2] * t;
        w += t;
      }
      if (dim > nChan) {
        let extra = 0;
        let extraN = 0;
        for (let d = nChan; d < dim; d++) {
          const st = colStats[d] || { lo: 0, span: 1 };
          extra += clamp01((feats[off + d] - st.lo) / st.span);
          extraN += 1;
        }
        if (extraN) {
          const t = extra / extraN;
          const rgb = hexToRgbaBytes(RASTER_RGB_CHANNELS[0], 1);
          r += rgb[0] * t;
          g += rgb[1] * t;
          b += rgb[2] * t;
          w += t;
        }
      }
      if (w < 1e-6) return low;
      const a = Math.min(1, w);
      return [
        Math.min(255, Math.round(low[0] * (1 - a) + r)),
        Math.min(255, Math.round(low[1] * (1 - a) + g)),
        Math.min(255, Math.round(low[2] * (1 - a) + b)),
      ];
    }
    return low;
  }

  function activeQueryBin() {
    // Hover wins for live scrubbing (not genes — hover is inert there).
    if (hoverBinIndex >= 0 && !genesProbeHoverInert()) return hoverBinIndex;
    const pinned = model.get("raster_query_bin");
    if (pinned != null && pinned >= 0) return pinned | 0;
    return -1;
  }

  function pickBinAtWorld(x, y) {
    const cache = refreshRasterArrays();
    if (!(cache.nBins | 0)) return -1;
    const size = Number(model.get("raster_bin_size")) || 0;
    const nCols = model.get("raster_n_cols") | 0;
    const nRows = model.get("raster_n_rows") | 0;
    if (!(size > 0) || nCols <= 0 || nRows <= 0 || !cache.flatToCompact) return -1;
    const ox = Number(model.get("raster_origin_x")) || 0;
    const oy = Number(model.get("raster_origin_y")) || 0;
    const col = Math.floor((x - ox) / size);
    const row = Math.floor((y - oy) / size);
    if (col < 0 || row < 0 || col >= nCols || row >= nRows) return -1;
    const flat = col + nCols * row;
    return cache.flatToCompact[flat] ?? -1;
  }

  /**
   * Cursor-aligned raster probe: nearest packed (nonempty) bin center within R.
   * Packed bins are nonempty by construction — no grid-cell-under-cursor snap.
   * Searches only grid cells overlapping the disk (not all nBins).
   */
  function nearestNonemptyBinWithinRadius(x, y) {
    const cache = refreshRasterArrays();
    const n = cache.nBins | 0;
    if (!n) return -1;
    const size = Number(model.get("raster_bin_size")) || 0;
    if (!(size > 0)) return -1;
    const R = probeWindowRadius();
    if (!(R > 0)) return -1;
    const R2 = R * R;
    const ox = Number(model.get("raster_origin_x")) || 0;
    const oy = Number(model.get("raster_origin_y")) || 0;
    const nCols = model.get("raster_n_cols") | 0;
    const nRows = model.get("raster_n_rows") | 0;
    const flatToCompact = cache.flatToCompact;
    if (!flatToCompact || nCols <= 0 || nRows <= 0) return -1;
    const span = Math.ceil(R / size) + 1;
    const c0 = Math.floor((x - ox) / size);
    const r0 = Math.floor((y - oy) / size);
    let best = -1;
    let bestD = Infinity;
    for (let dc = -span; dc <= span; dc++) {
      const col = c0 + dc;
      if (col < 0 || col >= nCols) continue;
      for (let dr = -span; dr <= span; dr++) {
        const row = r0 + dr;
        if (row < 0 || row >= nRows) continue;
        const compact = flatToCompact[col + nCols * row];
        if (compact == null || compact < 0) continue;
        const cx = ox + (col + 0.5) * size;
        const cy = oy + (row + 0.5) * size;
        const dx = cx - x;
        const dy = cy - y;
        const d2 = dx * dx + dy * dy;
        if (d2 <= R2 && d2 < bestD) {
          bestD = d2;
          best = compact | 0;
        }
      }
    }
    return best;
  }

  function binCenterDist2(compactIdx, x, y) {
    const cache = refreshRasterArrays();
    if (compactIdx < 0 || compactIdx >= (cache.nBins | 0)) return Infinity;
    const size = Number(model.get("raster_bin_size")) || 0;
    if (!(size > 0)) return Infinity;
    const ox = Number(model.get("raster_origin_x")) || 0;
    const oy = Number(model.get("raster_origin_y")) || 0;
    const cx = ox + ((cache.cols[compactIdx] | 0) + 0.5) * size;
    const cy = oy + ((cache.rows[compactIdx] | 0) + 0.5) * size;
    const dx = cx - x;
    const dy = cy - y;
    return dx * dx + dy * dy;
  }

  /**
   * Sticky nearest-bin pick — hysteresis stops Voronoi-edge flicker when the
   * cursor straddles two bin centers and similarity would otherwise thrash.
   */
  function stickyHoverBin(x, y) {
    const next = nearestNonemptyBinWithinRadius(x, y);
    // Keep last query if this sample is empty (picking reset / off-tissue).
    // Resting color only returns on real leave / pin / mode change.
    if (next < 0) return hoverBinIndex;
    if (hoverBinIndex < 0 || hoverBinIndex === next) return next;
    const size = Number(model.get("raster_bin_size")) || 0;
    const R = probeWindowRadius();
    const hyst = Math.max(size * 0.35, R * 0.12, 1e-6);
    const dCur = binCenterDist2(hoverBinIndex, x, y);
    const R2 = R * R;
    // Current query left the window — accept the new nearest.
    if (!(dCur <= R2)) return next;
    const dNext = binCenterDist2(next, x, y);
    // Switch only when next is closer by a clear margin.
    if (Math.sqrt(dNext) + hyst < Math.sqrt(dCur)) return next;
    return hoverBinIndex;
  }


  function worldFromDeckInfo(info) {
    // Deck fires onHover with x/y = -1 on pointerleave / picking reset.
    // Unprojecting that snaps the query off-canvas and drops to rest color.
    const sx = info?.x;
    const sy = info?.y;
    if (sx != null && sy != null && (sx < 0 || sy < 0)) return null;
    if (webglCanvas) {
      const w = webglCanvas.clientWidth || 0;
      const h = webglCanvas.clientHeight || 0;
      if (w > 0 && h > 0 && sx != null && sy != null && (sx > w || sy > h)) {
        return null;
      }
    }
    if (info?.coordinate && Number.isFinite(info.coordinate[0])) {
      return [info.coordinate[0], info.coordinate[1]];
    }
    if (sx == null || sy == null || !deckgl) return null;
    try {
      const vp = deckgl.isInitialized
        ? deckgl.getViewports()?.[0]
        : deckgl.getViewports?.()?.[0];
      if (!vp?.unproject) return null;
      // Match eventPoint(): deck OrthographicView unproject without topLeft.
      const p = vp.unproject([sx, sy]);
      if (!p || !Number.isFinite(p[0])) return null;
      return [p[0], p[1]];
    } catch {
      return null;
    }
  }

  function probeWindowRadius() {
    const r = Number(model.get("raster_window_radius"));
    if (Number.isFinite(r) && r > 0) return r;
    const bin = Number(model.get("raster_bin_size"));
    // Same default as milume.landmarks.DEFAULT_WINDOW_RADIUS: 3 x bin, else 24 µm.
    if (Number.isFinite(bin) && bin > 0) return bin * 3;
    return 24;
  }

  let pointFeatCache = { key: "", features: null, dim: 0, n: 0 };
  let pointScoreCache = { key: "", scores: null };
  let pinnedPointIndex = -1;
  /** Cursor-aligned probe disk (points): hover overrides pin while scrubbing. */
  let hoverProbeWorld = null; // {x,y} | null — raw cursor (scores / sticky)
  let probeDisplayWorld = null; // {x,y} | null — smoothed circle draw
  let probeSmoothRaf = 0;
  /** Esc clears pin/hover; stay on observation colors until the pointer moves. */
  let probeScrubPaused = false;
  let probePauseWorld = null; // {x,y} | null — park point after Esc
  let pinnedProbeWorld = null; // {x,y} | null
  let probeScrubSeq = 0;
  /** Last scrubbed probe window held no cells (see scrubProbeAtWorld). */
  let probeDiskWasEmpty = false;
  let pointDiskScoreCache = { key: "", scores: null };
  /** Spatial hash for fallback disk means when bin features are missing. */
  let pointSpatialIndex = { key: "", cellSize: 0, ox: 0, oy: 0, cells: null };
  /** Row-L2-normalized point features for fallback cosine. */
  let pointNormCache = { key: "", features: null, dim: 0, n: 0 };

  let rawPointFeatCache = { key: "", features: null, dim: 0, n: 0 };

  /** Per-cell observation matrix for the active raster_basis / color signal. */
  function rawPointFeatureMatrix(n) {
    const basis = model.get("raster_basis") || "composition";
    const colorBy = model.get("color_by") || "categorical";
    const key = [
      pointsCache.key,
      n,
      basis,
      colorBy,
      (model.get("active_genes") || []).join(","),
      model.get("raster_embedding_key") || "",
      model.get("active_category") || "",
      geneValues ? geneValues.length : 0,
      embeddingValues ? embeddingValues.length : 0,
      categoryCodes ? categoryCodes.length : 0,
    ].join("|");
    if (rawPointFeatCache.key === key && rawPointFeatCache.n === n) {
      return rawPointFeatCache;
    }
    if (basis === "genes" || colorBy === "continuous") {
      const gm = geneFeatureMatrix(n);
      rawPointFeatCache = { key, features: gm.features, dim: gm.dim, n };
      return rawPointFeatCache;
    }
    if (basis === "embedding" || colorBy === "embedding") {
      const labels = model.get("embedding_channel_labels") || [];
      const dim = labels.length | 0;
      if (!dim || !embeddingValues || embeddingValues.length < n * dim) {
        rawPointFeatCache = { key, features: null, dim: 0, n };
        return rawPointFeatCache;
      }
      const features = new Float32Array(n * dim);
      for (let c = 0; c < dim; c++) {
        const off = c * n;
        for (let i = 0; i < n; i++) {
          features[i * dim + c] = embeddingValues[off + i] || 0;
        }
      }
      rawPointFeatCache = { key, features, dim, n };
      return rawPointFeatCache;
    }
    // Composition: one-hot of active category codes.
    const cols = model.get("category_columns") || [];
    const ci = activeCategoryIndex();
    const col = ci >= 0 ? cols[ci] : null;
    const nLabels = (col?.labels || []).length | 0;
    if (!nLabels || !categoryCodes) {
      rawPointFeatCache = { key, features: null, dim: 0, n };
      return rawPointFeatCache;
    }
    const features = new Float32Array(n * nLabels);
    for (let i = 0; i < n; i++) {
      const code = categoryCodes[ci * n + i] | 0;
      if (code >= 0 && code < nLabels) features[i * nLabels + code] = 1;
    }
    rawPointFeatCache = { key, features, dim: nLabels, n };
    return rawPointFeatCache;
  }

  /** Window-mean features around each point (radius graph, distance ≤ window). */
  function pointWindowFeatures() {
    const pts = getPointsData();
    const n = pts.length;
    const radius = probeWindowRadius();
    const basis = model.get("raster_basis") || "";
    const colorBy = model.get("color_by") || "";
    const genes = (model.get("active_genes") || []).join(",");
    const embKey = model.get("raster_embedding_key") || "";
    const cat = model.get("active_category") || "";
    const key = [
      pointsCache.key,
      n,
      radius,
      basis,
      colorBy,
      genes,
      embKey,
      cat,
      radiusGraph ? radiusGraph.indptr.length : 0,
      geneValues ? geneValues.length : 0,
      embeddingValues ? embeddingValues.length : 0,
      categoryCodes ? categoryCodes.length : 0,
    ].join("|");
    if (pointFeatCache.key === key && pointFeatCache.features) return pointFeatCache;
    const raw = rawPointFeatureMatrix(n);
    if (!raw.features || !raw.dim) {
      pointFeatCache = { key, features: null, dim: 0, n };
      pointScoreCache = { key: "", scores: null };
      return pointFeatCache;
    }
    const dim = raw.dim;
    const src = raw.features;
    const out = new Float32Array(n * dim);
    const g = radiusGraph;
    for (let i = 0; i < n; i++) {
      for (let d = 0; d < dim; d++) out[i * dim + d] = src[i * dim + d];
      let count = 1;
      if (g && g.indptr && g.indices) {
        const a = g.indptr[i] | 0;
        const b = g.indptr[i + 1] | 0;
        for (let k = a; k < b; k++) {
          const dist = g.distances ? g.distances[k] : 0;
          if (radius > 0 && dist > radius) continue;
          const j = g.indices[k] | 0;
          if (j < 0 || j >= n) continue;
          for (let d = 0; d < dim; d++) out[i * dim + d] += src[j * dim + d];
          count += 1;
        }
      }
      const inv = 1 / count;
      for (let d = 0; d < dim; d++) out[i * dim + d] *= inv;
    }
    pointFeatCache = { key, features: out, dim, n };
    pointScoreCache = { key: "", scores: null };
    return pointFeatCache;
  }

  function cosineScoresForPointQuery(queryIdx) {
    const cache = pointWindowFeatures();
    const n = cache.n | 0;
    const dim = cache.dim | 0;
    const feats = cache.features;
    if (queryIdx < 0 || queryIdx >= n || !dim || !feats) return null;
    const key = `${cache.key}:q${queryIdx}`;
    if (pointScoreCache.key === key && pointScoreCache.scores) return pointScoreCache.scores;
    const q = new Float32Array(dim);
    let qn = 0;
    const qOff = queryIdx * dim;
    for (let d = 0; d < dim; d++) {
      const v = feats[qOff + d] || 0;
      q[d] = v;
      qn += v * v;
    }
    qn = Math.sqrt(qn) || 1;
    for (let d = 0; d < dim; d++) q[d] /= qn;
    const scores = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      let dot = 0;
      let rn = 0;
      const off = i * dim;
      for (let d = 0; d < dim; d++) {
        const v = feats[off + d] || 0;
        rn += v * v;
        dot += v * q[d];
      }
      rn = Math.sqrt(rn) || 1;
      scores[i] = dot / rn;
    }
    pointScoreCache = { key, scores };
    return scores;
  }

  function pickPointAtWorld(x, y) {
    const pts = getPointsData();
    if (!pts.length) return -1;
    const win = probeWindowRadius();
    const size = Number(model.get("point_size")) || 2;
    const maxR = Math.max(win, size * 8);
    const maxR2 = maxR * maxR;
    let best = -1;
    let bestD = Infinity;
    for (let i = 0; i < pts.length; i++) {
      const dx = pts[i].x - x;
      const dy = pts[i].y - y;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestD && d2 <= maxR2) {
        bestD = d2;
        best = i;
      }
    }
    return best;
  }

  function activeQueryPoint() {
    // Legacy index helpers; disk probe uses hoverProbeWorld / pinnedProbeWorld.
    if (hoverPointIndex >= 0) return hoverPointIndex;
    if (pinnedPointIndex >= 0) return pinnedPointIndex;
    return -1;
  }

  function activeProbeWorld() {
    // Genes with no selection: ignore hover — only a pin drives similarity.
    if (hoverProbeWorld && !genesProbeHoverInert()) return hoverProbeWorld;
    if (pinnedProbeWorld) return pinnedProbeWorld;
    return null;
  }

  /** Quantize world coords to ~R/2 grid (fallback probe cache key). */
  function quantizeProbeWorld(x, y) {
    const R = probeWindowRadius();
    const q = Math.max(R * 0.5, 1e-6);
    return {
      x: Math.round(x / q) * q,
      y: Math.round(y / q) * q,
    };
  }

  /** Cell → point indices for disk membership (cell size ≈ R). */
  function pointSpatialCells(cellSize) {
    const pts = getPointsData();
    const key = `${pointsCache.key}:${pts.length}:${cellSize}`;
    if (
      pointSpatialIndex.key === key &&
      pointSpatialIndex.cells &&
      pointSpatialIndex.cellSize === cellSize
    ) {
      return pointSpatialIndex;
    }
    const cells = new Map();
    let ox = 0;
    let oy = 0;
    if (pts.length) {
      let minX = Infinity;
      let minY = Infinity;
      for (let i = 0; i < pts.length; i++) {
        if (pts[i].x < minX) minX = pts[i].x;
        if (pts[i].y < minY) minY = pts[i].y;
      }
      ox = minX;
      oy = minY;
      const inv = 1 / cellSize;
      for (let i = 0; i < pts.length; i++) {
        const c = Math.floor((pts[i].x - ox) * inv);
        const r = Math.floor((pts[i].y - oy) * inv);
        const ck = `${c},${r}`;
        let bucket = cells.get(ck);
        if (!bucket) {
          bucket = [];
          cells.set(ck, bucket);
        }
        bucket.push(i);
      }
    }
    pointSpatialIndex = { key, cellSize, ox, oy, cells };
    return pointSpatialIndex;
  }

  /** Raw point feature rows, L2-normalized once per feature key. */
  function normalizedPointFeatureMatrix(n) {
    const raw = rawPointFeatureMatrix(n);
    if (!raw.features || !raw.dim) {
      pointNormCache = { key: "", features: null, dim: 0, n };
      return pointNormCache;
    }
    const key = [
      pointsCache.key,
      n,
      raw.dim,
      model.get("raster_basis") || "",
      model.get("color_by") || "",
      (model.get("active_genes") || []).join(","),
      model.get("raster_embedding_key") || "",
      model.get("active_category") || "",
      geneValues ? geneValues.length : 0,
      embeddingValues ? embeddingValues.length : 0,
      categoryCodes ? categoryCodes.length : 0,
    ].join("|");
    if (pointNormCache.key === key && pointNormCache.features) return pointNormCache;
    const dim = raw.dim;
    const src = raw.features;
    const out = new Float32Array(n * dim);
    for (let i = 0; i < n; i++) {
      let rn = 0;
      const off = i * dim;
      for (let d = 0; d < dim; d++) {
        const v = src[off + d] || 0;
        out[off + d] = v;
        rn += v * v;
      }
      rn = Math.sqrt(rn) || 1;
      const inv = 1 / rn;
      for (let d = 0; d < dim; d++) out[off + d] *= inv;
    }
    pointNormCache = { key, features: out, dim, n };
    pointDiskScoreCache = { key: "", scores: null };
    return pointNormCache;
  }

  /**
   * Mean of raw point features inside disk (x,y,R), using a spatial hash.
   * Fallback when packed bin features are unavailable.
   */
  /** Any point inside the probe window at (x, y)? Bucket lookups only, no features. */
  function probeDiskHasPoints(x, y) {
    const pts = getPointsData();
    const R = probeWindowRadius();
    if (!(R > 0) || !pts.length) return false;
    const R2 = R * R;
    const index = pointSpatialCells(R);
    const c0 = Math.floor((x - index.ox) / R);
    const r0 = Math.floor((y - index.oy) / R);
    for (let dc = -1; dc <= 1; dc++) {
      for (let dr = -1; dr <= 1; dr++) {
        const bucket = index.cells.get(`${c0 + dc},${r0 + dr}`);
        if (!bucket) continue;
        for (let b = 0; b < bucket.length; b++) {
          const p = pts[bucket[b]];
          const dx = p.x - x;
          const dy = p.y - y;
          if (dx * dx + dy * dy <= R2) return true;
        }
      }
    }
    return false;
  }

  function meanRawFeaturesInDisk(x, y) {
    const pts = getPointsData();
    const n = pts.length;
    const raw = rawPointFeatureMatrix(n);
    if (!raw.features || !raw.dim) return null;
    const R = probeWindowRadius();
    if (!(R > 0) || !n) return null;
    const R2 = R * R;
    const dim = raw.dim;
    const src = raw.features;
    const acc = new Float32Array(dim);
    let count = 0;
    const cellSize = R;
    const index = pointSpatialCells(cellSize);
    const inv = 1 / cellSize;
    const c0 = Math.floor((x - index.ox) * inv);
    const r0 = Math.floor((y - index.oy) * inv);
    const span = Math.ceil(R / cellSize) + 1;
    for (let dc = -span; dc <= span; dc++) {
      for (let dr = -span; dr <= span; dr++) {
        const bucket = index.cells.get(`${c0 + dc},${r0 + dr}`);
        if (!bucket) continue;
        for (let b = 0; b < bucket.length; b++) {
          const i = bucket[b];
          const dx = pts[i].x - x;
          const dy = pts[i].y - y;
          if (dx * dx + dy * dy > R2) continue;
          const off = i * dim;
          for (let d = 0; d < dim; d++) acc[d] += src[off + d] || 0;
          count += 1;
        }
      }
    }
    if (!count) return null;
    const invCount = 1 / count;
    for (let d = 0; d < dim; d++) acc[d] *= invCount;
    return { vector: acc, dim, count };
  }

  /** Cosine of each L2-normalized point to a query vector (fallback path). */
  function cosineScoresForFeatureVector(qVec, dim, qx, qy) {
    const pts = getPointsData();
    const n = pts.length;
    const norm = normalizedPointFeatureMatrix(n);
    if (!norm.features || norm.dim !== dim || !qVec) return null;
    const key = [
      norm.key,
      n,
      dim,
      qx,
      qy,
      qVec[0],
      qVec[Math.min(dim - 1, 1)] || 0,
      qVec[dim - 1] || 0,
    ].join("|");
    if (pointDiskScoreCache.key === key && pointDiskScoreCache.scores) {
      return pointDiskScoreCache.scores;
    }
    let qn = 0;
    const q = new Float32Array(dim);
    for (let d = 0; d < dim; d++) {
      const v = qVec[d] || 0;
      q[d] = v;
      qn += v * v;
    }
    qn = Math.sqrt(qn) || 1;
    const invQ = 1 / qn;
    for (let d = 0; d < dim; d++) q[d] *= invQ;
    const src = norm.features;
    const scores = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      let dot = 0;
      const off = i * dim;
      for (let d = 0; d < dim; d++) dot += src[off + d] * q[d];
      scores[i] = dot;
    }
    pointDiskScoreCache = { key, scores };
    return scores;
  }

  function prefersReducedMotion() {
    try {
      return !!window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    } catch {
      return false;
    }
  }

  function stopProbeSmooth() {
    if (probeSmoothRaf) {
      cancelAnimationFrame(probeSmoothRaf);
      probeSmoothRaf = 0;
    }
  }

  /** World position for the floating probe window stroke. */
  function probeCircleWorld() {
    return probeDisplayWorld || hoverProbeWorld;
  }

  function tickProbeSmooth() {
    probeSmoothRaf = 0;
    if (!hoverProbeWorld) {
      probeDisplayWorld = null;
      return;
    }
    if (prefersReducedMotion() || !probeDisplayWorld) {
      probeDisplayWorld = { x: hoverProbeWorld.x, y: hoverProbeWorld.y };
      publishProbeCircleOnly();
      return;
    }
    // Exponential chase — circle glides; scores still use raw hoverProbeWorld.
    const a = 0.32;
    const dx = hoverProbeWorld.x - probeDisplayWorld.x;
    const dy = hoverProbeWorld.y - probeDisplayWorld.y;
    probeDisplayWorld = {
      x: probeDisplayWorld.x + dx * a,
      y: probeDisplayWorld.y + dy * a,
    };
    publishProbeCircleOnly();
    const R = probeWindowRadius();
    const eps2 = Math.max((R * 0.003) ** 2, 1e-10);
    if (dx * dx + dy * dy > eps2) {
      probeSmoothRaf = requestAnimationFrame(tickProbeSmooth);
    } else {
      probeDisplayWorld = { x: hoverProbeWorld.x, y: hoverProbeWorld.y };
      publishProbeCircleOnly();
    }
  }

  function startProbeSmooth() {
    if (probeSmoothRaf) return;
    probeSmoothRaf = requestAnimationFrame(tickProbeSmooth);
  }

  function publishProbeCircleOnly() {
    // Own path — must not cancel scheduleProbeRedraw's hoverRaf (score rebuilds).
    if (!deckgl?.isInitialized || !probeBaseLayers.length) return;
    publishDeckLayers([
      ...probeBaseLayers,
      ...buildProbeOutlineLayers(),
    ]);
  }

  function isProbeWindowLayer(layer) {
    return String(layer?.id || "").startsWith("probe-window-");
  }

  function pulseViewTransition() {
    if (!plotStack || prefersReducedMotion()) return;
    plotStack.classList.remove("landmarks__plot--view-swap");
    // Force restart if the user toggles again mid-animation.
    void plotStack.offsetWidth;
    plotStack.classList.add("landmarks__plot--view-swap");
    const done = () => {
      plotStack.classList.remove("landmarks__plot--view-swap");
      plotStack.removeEventListener("animationend", done);
    };
    plotStack.addEventListener("animationend", done);
  }

  /** Set when a view/color swap should blur — fired only after layers are ready. */
  let pendingViewPulse = false;

  /**
   * Start the continuity blur only once the canvas shows the destination mode.
   * Points → raster waits for a drawable bitmap so the pulse isn't mid-glitch.
   */
  function maybePulsePendingViewTransition() {
    if (!pendingViewPulse) return;
    if (prefersReducedMotion()) {
      pendingViewPulse = false;
      return;
    }
    if (isRasterMode() && !rasterBitmapReady()) return;
    pendingViewPulse = false;
    // Next frame: deck has painted the new layers, then blur settles over them.
    requestAnimationFrame(() => {
      pulseViewTransition();
    });
  }

  function publishDeckLayers(layers) {
    const list = (layers || []).filter(Boolean);
    probeBaseLayers = list.filter((layer) => !isProbeWindowLayer(layer));
    applyDeckProps({ layers: list });
  }

  function scheduleProbeRedraw(opts = {}) {
    const circleOnly = !!opts.circleOnly && probeBaseLayers.length > 0;
    if (hoverRaf) cancelAnimationFrame(hoverRaf);
    hoverRaf = requestAnimationFrame(() => {
      hoverRaf = 0;
      // Move the window circle without rebuilding scatter/raster. Must reuse
      // *our* last published base layers — deck.props.layers is the constructor
      // stack and was snapping colors back to rest/pin when the pointer stopped.
      if (circleOnly && deckgl?.isInitialized) {
        publishDeckLayers([
          ...probeBaseLayers,
          ...buildProbeOutlineLayers(),
        ]);
        return;
      }
      setDeckLayers();
    });
  }

  function scrubProbeAtWorld(x, y) {
    if (!probeModeOn()) return false;
    // Genes with no selection: hover shows nothing until a gene is selected.
    if (genesProbeHoverInert()) {
      if (hoverBinIndex >= 0 || hoverPointIndex >= 0 || hoverProbeWorld || probeDisplayWorld) {
        clearProbeHover();
        scheduleProbeRedraw({ circleOnly: false });
      }
      return true;
    }
    // Esc reset: hold observation colors until the cursor actually moves.
    if (probeScrubPaused) {
      if (!probePauseWorld) {
        probePauseWorld = { x, y };
        return true;
      }
      if (probePauseWorld.x === x && probePauseWorld.y === y) {
        return true;
      }
      probeScrubPaused = false;
      probePauseWorld = null;
    }
    // Same world coords → no sticky/score/circle work (mousemove + rAF churn).
    if (
      hoverProbeWorld &&
      hoverProbeWorld.x === x &&
      hoverProbeWorld.y === y
    ) {
      return true;
    }
    let changed = false;
    let scoresChanged = false;
    if (isRasterMode()) {
      if (!hasRasterFeatures()) return false;
      // Sticky nearest bin — hysteresis avoids Voronoi-edge score thrash.
      const bin = stickyHoverBin(x, y);
      if (bin !== hoverBinIndex) {
        hoverBinIndex = bin;
        changed = true;
        scoresChanged = true;
      }
      if (hoverPointIndex >= 0) {
        hoverPointIndex = -1;
        changed = true;
      }
    } else if (binBackedPointsProbeOn()) {
      // Points: same sticky bin query as raster; circle still follows cursor.
      const bin = stickyHoverBin(x, y);
      if (bin !== hoverBinIndex) {
        hoverBinIndex = bin;
        changed = true;
        scoresChanged = true;
      }
      if (hoverPointIndex >= 0) {
        hoverPointIndex = -1;
        changed = true;
      }
    } else {
      // Fallback: no packed bins — quantized disk query on points.
      if (hoverBinIndex >= 0) {
        hoverBinIndex = -1;
        changed = true;
        scoresChanged = true;
      }
      if (hoverPointIndex >= 0) {
        hoverPointIndex = -1;
        changed = true;
      }
      const q = quantizeProbeWorld(x, y);
      if (
        !hoverProbeWorld ||
        quantizeProbeWorld(hoverProbeWorld.x, hoverProbeWorld.y).x !== q.x ||
        quantizeProbeWorld(hoverProbeWorld.x, hoverProbeWorld.y).y !== q.y
      ) {
        // Off tissue the window holds no cells and the field stays empty: after
        // the first empty rebuild (which clears the colors), skip rebuilding the
        // whole point layer until the window reaches cells again.
        const empty = !probeDiskHasPoints(q.x, q.y);
        scoresChanged = !(empty && probeDiskWasEmpty);
        probeDiskWasEmpty = empty;
      }
    }
    // Cursor-aligned window disk (both views): radius = raster_window_radius.
    if (
      !hoverProbeWorld ||
      hoverProbeWorld.x !== x ||
      hoverProbeWorld.y !== y
    ) {
      hoverProbeWorld = { x, y };
      if (scoresChanged) probeScrubSeq = (probeScrubSeq + 1) | 0;
      changed = true;
      if (prefersReducedMotion() || !probeDisplayWorld) {
        probeDisplayWorld = { x, y };
      }
    }
    if (scoresChanged) {
      // Full rebuild for similarity field; circle keeps gliding separately.
      scheduleProbeRedraw({ circleOnly: false });
    }
    if (changed) {
      startProbeSmooth();
    }
    return true;
  }

  function clearProbeHover() {
    let changed = false;
    if (hoverBinIndex >= 0) {
      hoverBinIndex = -1;
      changed = true;
    }
    if (hoverPointIndex >= 0) {
      hoverPointIndex = -1;
      changed = true;
    }
    if (hoverProbeWorld || probeDisplayWorld) {
      hoverProbeWorld = null;
      probeDisplayWorld = null;
      stopProbeSmooth();
      changed = true;
    }
    probeDiskWasEmpty = false;
    if (changed) setDeckLayers();
  }

  let pointBinCache = { key: "", bins: null };

  /** Compact bin index per point; rebuilt only when grid or points change. */
  function pointBinIndices() {
    const cache = refreshRasterArrays();
    const pts = getPointsData();
    const key = `${cache.key}:${pointsCache.key}:${pts.length}`;
    if (pointBinCache.key === key && pointBinCache.bins && pointBinCache.bins.length === pts.length) {
      return pointBinCache.bins;
    }
    const bins = new Int32Array(pts.length);
    bins.fill(-1);
    if ((cache.nBins | 0) > 0) {
      for (let i = 0; i < pts.length; i++) {
        bins[i] = pickBinAtWorld(pts[i].x, pts[i].y);
      }
    }
    pointBinCache = { key, bins };
    return bins;
  }

  /**
   * Point→score vector for the active probe query. Computed once per scrub /
   * pin — never from inside per-point getFillColor (that was O(n²) on fallback).
   */
  function activePointProbeScores() {
    if (binBackedPointsProbeOn() || rasterSimilarityOn()) {
      const queryIdx = activeQueryBin();
      if (queryIdx < 0) return null;
      const scores = cosineScoresForQuery(queryIdx);
      if (!scores) return null;
      return { mode: "bin", scores, bins: pointBinIndices() };
    }
    if (pointSimilarityOn()) {
      const world = activeProbeWorld();
      if (!world) return null;
      const q = quantizeProbeWorld(world.x, world.y);
      const mean = meanRawFeaturesInDisk(q.x, q.y);
      if (!mean) return null;
      const scores = cosineScoresForFeatureVector(mean.vector, mean.dim, q.x, q.y);
      if (!scores) return null;
      return { mode: "point", scores, bins: null };
    }
    return null;
  }

  function similarityRgbaForPoint(i, opacity, probeField) {
    // Only an absent field is computed here. A hoisted `null` means "no probe
    // scores" (e.g. the window holds no cells) and must not re-query per point.
    const field = probeField === undefined ? activePointProbeScores() : probeField;
    if (!field || !field.scores) return null;
    let t;
    if (field.mode === "bin") {
      const bin = field.bins[i] | 0;
      if (bin < 0 || bin >= field.scores.length) return null;
      t = field.scores[bin];
    } else {
      if (i < 0 || i >= field.scores.length) return null;
      t = field.scores[i];
    }
    const [r, g, b] = sampleSimilarityColor(t);
    return [r, g, b, Math.round(Math.max(0, Math.min(1, opacity)) * 255)];
  }

  function binPolygon(compactIdx) {
    const cache = refreshRasterArrays();
    if (compactIdx < 0 || compactIdx >= (cache.nBins | 0)) return null;
    const size = Number(model.get("raster_bin_size")) || 0;
    const ox = Number(model.get("raster_origin_x")) || 0;
    const oy = Number(model.get("raster_origin_y")) || 0;
    const col = cache.cols[compactIdx] | 0;
    const row = cache.rows[compactIdx] | 0;
    const x0 = ox + col * size;
    const y0 = oy + row * size;
    const x1 = x0 + size;
    const y1 = y0 + size;
    return [
      [x0, y0],
      [x1, y0],
      [x1, y1],
      [x0, y1],
      [x0, y0],
    ];
  }

  function buildRasterTexture() {
    const cache = refreshRasterArrays();
    const nBins = cache.nBins | 0;
    const nCols = model.get("raster_n_cols") | 0;
    const nRows = model.get("raster_n_rows") | 0;
    const size = Number(model.get("raster_bin_size")) || 0;
    if (!nBins || !nCols || !nRows || !(size > 0)) {
      return null;
    }
    const queryIdx = rasterSimilarityOn() ? activeQueryBin() : -1;
    const scores =
      queryIdx >= 0 && (cache.dim | 0) > 0 ? cosineScoresForQuery(queryIdx) : null;
    const threshold = Number(model.get("raster_threshold")) || 0;
    const basis = model.get("raster_basis") || "composition";
    const dimsKey = (model.get("raster_embedding_dims") || []).join(",");
    const texKey = [
      cache.key,
      queryIdx,
      scores ? rasterScoreKey : "observation",
      threshold,
      model.get("raster_query_bin"),
      basis,
      dimsKey,
      (model.get("point_palette") || []).join(","),
      (model.get("active_genes") || []).join(","),
      // Low stop tracks plot background (dark/light).
      resolvePlotBackground(),
    ].join("|");
    if (rasterImageCache.key === texKey && rasterImageCache.image) {
      return rasterImageCache;
    }

    let tw = nCols;
    let th = nRows;
    const maxDim = RASTER_TEXTURE_MAX;
    if (tw > maxDim || th > maxDim) {
      const scale = maxDim / Math.max(tw, th);
      tw = Math.max(1, Math.round(tw * scale));
      th = Math.max(1, Math.round(th * scale));
    }
    const canvas = document.createElement("canvas");
    canvas.width = tw;
    canvas.height = th;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const img = ctx.createImageData(tw, th);
    const data = img.data;
    data.fill(0);

    const ox = Number(model.get("raster_origin_x")) || 0;
    const oy = Number(model.get("raster_origin_y")) || 0;
    const sx = tw / nCols;
    const sy = th / nRows;
    const dim = cache.dim | 0;
    const colStats = [];
    if (!scores && dim > 0 && cache.features) {
      for (let d = 0; d < dim; d++) {
        colStats[d] = columnMinMax(cache.features, nBins, dim, d);
      }
    }

    for (let i = 0; i < nBins; i++) {
      const col = cache.cols[i] | 0;
      const row = cache.rows[i] | 0;
      let alpha = RASTER_DENSITY_ALPHA;
      let r;
      let g;
      let b;
      if (scores) {
        const t = Math.max(0, Math.min(1, scores[i]));
        if (t < threshold) alpha = RASTER_DIM_ALPHA;
        [r, g, b] = sampleSimilarityColor(t);
      } else {
        [r, g, b] = observationColorForBin(i, cache, colStats);
      }
      const px0 = Math.floor(col * sx);
      const px1 = Math.max(px0 + 1, Math.floor((col + 1) * sx));
      const py0 = Math.floor((nRows - 1 - row) * sy);
      const py1 = Math.max(py0 + 1, Math.floor((nRows - row) * sy));
      const a = Math.round(alpha * 255);
      for (let y = py0; y < py1; y++) {
        for (let x = px0; x < px1; x++) {
          if (x < 0 || y < 0 || x >= tw || y >= th) continue;
          const o = (y * tw + x) * 4;
          data[o] = r;
          data[o + 1] = g;
          data[o + 2] = b;
          data[o + 3] = a;
        }
      }
    }
    ctx.putImageData(img, 0, 0);
    const bounds = [
      ox,
      oy,
      ox + nCols * size,
      oy + nRows * size,
    ];
    rasterImageCache = { key: texKey, image: canvas, bounds };
    return rasterImageCache;
  }

  function binWindowCenter(compactIdx) {
    const cache = refreshRasterArrays();
    if (compactIdx < 0 || compactIdx >= (cache.nBins | 0)) return null;
    const size = Number(model.get("raster_bin_size")) || 0;
    if (!(size > 0)) return null;
    const ox = Number(model.get("raster_origin_x")) || 0;
    const oy = Number(model.get("raster_origin_y")) || 0;
    const col = cache.cols[compactIdx] | 0;
    const row = cache.rows[compactIdx] | 0;
    return {
      x: ox + (col + 0.5) * size,
      y: oy + (row + 0.5) * size,
    };
  }

  function mapMosaicUrl() {
    return String(model.get("map_mosaic_url") || "").trim();
  }

  function mapMosaicBounds() {
    const b = model.get("map_mosaic_bounds");
    if (!Array.isArray(b) || b.length < 4) return null;
    const left = Number(b[0]);
    const bottom = Number(b[1]);
    const right = Number(b[2]);
    const top = Number(b[3]);
    if (![left, bottom, right, top].every((v) => Number.isFinite(v))) return null;
    if (right <= left || top <= bottom) return null;
    return [left, bottom, right, top];
  }

  function scaleAlphaForMapMosaic(alpha) {
    if (!mapMosaicUrl()) return alpha;
    return Math.round(alpha * MAP_MOSAIC_POINT_ALPHA_SCALE);
  }

  function ensureMapMosaicImage() {
    const url = mapMosaicUrl();
    if (!url) {
      mapMosaicCache = { url: "", image: null, bounds: null, loading: false };
      return null;
    }
    const bounds = mapMosaicBounds();
    if (!bounds) return null;
    if (mapMosaicCache.url === url && mapMosaicCache.image) {
      return { image: mapMosaicCache.image, bounds: mapMosaicCache.bounds || bounds };
    }
    if (mapMosaicCache.url === url && mapMosaicCache.loading) return null;
    mapMosaicCache = { url, image: null, bounds, loading: true };
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      mapMosaicCache = { url, image: img, bounds, loading: false };
      invalidatePointColorBuffers();
      schedulePointFillColorsBuild();
      setDeckLayers();
    };
    img.onerror = () => {
      mapMosaicCache = { url: "", image: null, bounds: null, loading: false };
    };
    img.src = url;
    return null;
  }

  function buildMapMosaicLayer() {
    if (!deckModules || isRasterMode()) return [];
    const baked = ensureMapMosaicImage();
    if (!baked?.image || !baked.bounds) return [];
    const { BitmapLayer } = deckModules;
    return [
      new BitmapLayer({
        id: "map-mosaic",
        image: baked.image,
        bounds: baked.bounds,
        pickable: false,
        textureParameters: {
          minFilter: "linear",
          magFilter: "linear",
        },
        parameters: OVERLAY_GL,
        updateTriggers: {
          image: mapMosaicCache.url,
          bounds: baked.bounds.join(","),
        },
      }),
    ];
  }

  function buildRasterLayers() {
    if (!deckModules || !isRasterMode()) return [];
    if ((model.get("raster_status") || "") === "computing") return [];
    const baked = buildRasterTexture();
    if (!baked?.image) return [];
    const { BitmapLayer } = deckModules;
    // No aggregation-window circle at bin center during scrub — that snapped
    // the visual to the query cell and caused hover flash. Legend is enough.
    return [
      new BitmapLayer({
        id: "raster-bins",
        image: baked.image,
        bounds: baked.bounds,
        // Probe click pins via unproject, not GPU pick.
        pickable: false,
        textureParameters: {
          minFilter: "nearest",
          magFilter: "nearest",
        },
        parameters: OVERLAY_GL,
        updateTriggers: {
          image: baked.key,
          // Rebake when live / pinned query changes.
          _probe: [hoverBinIndex, model.get("raster_query_bin"), probeScrubSeq],
        },
      }),
    ];
  }

  /** True once raster mode has a drawable bitmap (not computing / empty grid). */
  function rasterBitmapReady() {
    if (!isRasterMode()) return false;
    if ((model.get("raster_status") || "") === "computing") return false;
    // Bins alone are enough — empty-gene raster is a grey field and must still
    // hide the point layer.
    if ((model.get("raster_n_bins") | 0) <= 0) return false;
    return !!buildRasterTexture()?.image;
  }

  function activeCategoryIndex() {
    const cols = model.get("category_columns") || [];
    const active = model.get("active_category") || "";
    return cols.findIndex((c) => c.name === active);
  }

  function categoryCodeAt(i) {
    const cols = model.get("category_columns") || [];
    const ci = activeCategoryIndex();
    const pts = getPointsData();
    if (ci < 0 || !categoryCodes || !pts.length) {
      return Math.round(pts[i]?.valueA || 0);
    }
    return categoryCodes[ci * pts.length + i];
  }

  /** Additive channels (keep in sync with helpers GENE_COLORS): magenta / lime / azure. */
  const GENE_COLORS = ["#ff0099", "#5cbf00", "#0088cc"];

  function geneMeta(geneName) {
    const genes = model.get("gene_columns") || [];
    return genes.find((g) => g.name === geneName) || null;
  }

  function geneColumnIndex(geneName) {
    const genes = model.get("gene_columns") || [];
    return genes.findIndex((g) => g.name === geneName);
  }

  /** Dense [0,1] value for point i, catalog gene column gi. */
  function genePackedAt(i, gi) {
    const pts = getPointsData();
    const n = pts.length;
    if (gi < 0 || i < 0 || i >= n) return null;
    if (geneCsc) {
      const dense = ensureGeneDenseFromCsc();
      if (!dense) return 0;
      const nGenes = Math.max(0, (geneCsc.indptr.length | 0) - 1);
      if (gi >= nGenes) return null;
      return dense[gi * n + i] || 0;
    }
    if (!geneValues || !geneValues.length) return null;
    const nGenes = (model.get("gene_columns") || []).length || 0;
    if (!nGenes || geneValues.length < n * nGenes) {
      // Legacy layout: columns = active_genes only.
      const active = model.get("active_genes") || [];
      if (geneValues.length === n * active.length) {
        const ai = active.indexOf((model.get("gene_columns") || [])[gi]?.name);
        if (ai < 0) return null;
        return geneValues[ai * n + i];
      }
    }
    return geneValues[gi * n + i];
  }

  function geneValueAt(i, geneName) {
    const gi = geneColumnIndex(geneName);
    if (gi < 0) return null;
    return genePackedAt(i, gi);
  }

  /** Data-space gene value (pre-log1p) from packed [0, 1]. */
  function geneRawAt(i, geneName) {
    const t01 = geneValueAt(i, geneName);
    if (t01 == null || !Number.isFinite(t01)) return null;
    const meta = geneMeta(geneName);
    const lo = Number.isFinite(meta?.vmin) ? meta.vmin : 0;
    const hi = Number.isFinite(meta?.vmax) && meta.vmax > lo ? meta.vmax : lo + 1;
    const t = Math.max(0, Math.min(1, t01));
    return Math.max(0, lo + t * (hi - lo));
  }

  function geneUsesLog1p() {
    return !!model.get("gene_log1p") && !model.get("gene_expression_logged");
  }

  function blendGeneColors(i, opacity) {
    const active = model.get("active_genes") || [];
    const pts = getPointsData();
    if (!active.length || !pts.length) return null;
    const rgb = blendGeneSrgb({
      activeGenes: active,
      pointIndex: i,
      scaleMode: model.get("gene_scale_mode") || "independent",
      log1p: geneUsesLog1p(),
      valueAt: (pi, name) => geneValueAt(pi, name),
      metaAt: (name) => geneMeta(name),
    });
    if (
      rgb[0] === LOW_EXPR_SRGB[0] &&
      rgb[1] === LOW_EXPR_SRGB[1] &&
      rgb[2] === LOW_EXPR_SRGB[2]
    ) {
      return hexToRgbaBytes("#6b7280", opacity * 0.35);
    }
    return [
      rgb[0],
      rgb[1],
      rgb[2],
      Math.round(Math.max(0, Math.min(1, opacity)) * 255),
    ];
  }

  function blendEmbeddingColors(i, opacity) {
    const pts = getPointsData();
    const labels = model.get("embedding_channel_labels") || [];
    const nChan = labels.length | 0;
    if (!nChan || !embeddingValues || !pts.length) return null;
    const n = pts.length;
    if (embeddingValues.length < n * nChan) return null;
    let r = 0;
    let g = 0;
    let b = 0;
    let w = 0;
    const nUse = Math.min(nChan, GENE_COLORS.length);
    for (let c = 0; c < nUse; c++) {
      const t = Math.max(0, Math.min(1, embeddingValues[c * n + i] || 0));
      if (!(t > 0)) continue;
      const rgb = hexToRgbaBytes(GENE_COLORS[c % GENE_COLORS.length], 1);
      r += rgb[0] * t;
      g += rgb[1] * t;
      b += rgb[2] * t;
      w += t;
    }
    if (w < 1e-6) {
      return hexToRgbaBytes("#6b7280", opacity * 0.35);
    }
    return [
      Math.min(255, Math.round(r)),
      Math.min(255, Math.round(g)),
      Math.min(255, Math.round(b)),
      Math.round(Math.max(0, Math.min(1, opacity)) * 255),
    ];
  }

  let draft = [];
  let suppressClick = false;
  let isDragging = false;
  let dragStart = null;
  let dragKind = "";
  let dragIndex = -1;
  let didDrag = false;
  /** World/pixel cursor for rubber-band draft preview (line/spline/shape/polygon). */
  let draftCursor = null;
  /** True while button is held after placing the first line vertex (drag-to-end). */
  let lineStrokeActive = false;
  /** Pixel-distance² below this on mouseup → click, not drag (line authoring). */
  const LINE_CLICK_PX2 = 25;
  let vertexDragIndex = -1;
  let vertexDragLandmarkIndex = -1;
  /** Vertex index selected within the focused landmark (node mode); -1 = none. */
  let activeVertexIndex = -1;
  /** Hovered existing vertex of the focused landmark (node mode); -1 = none. */
  let hoverVertexIndex = -1;
  /** Hover-ghost insertion point on the focused landmark's nearest edge, or null. */
  let hoverInsert = null;
  /** Snapshots of `landmarks` for Mod+Z; capped so memory stays bounded. */
  let landmarkUndoStack = [];
  const LANDMARK_UNDO_MAX = 40;
  let isLassoing = false;
  let lassoPath = [];
  let isBoxing = false;
  let boxStart = null;
  let boxCurrent = null;

  function nextNumberedId(prefix, items) {
    const used = new Set((items || []).map((x) => String(x.id)));
    for (let i = 1; ; i++) {
      const id = `${prefix} ${i}`;
      if (!used.has(id)) return id;
    }
  }
  function nextLandmarkId(items) {
    return nextNumberedId("landmark", items);
  }
  /** A selection's default name: its top category and size, e.g. "Epithelial · 214"; else "<prefix> <n>". */
  function selectionName(indices, prefix, items) {
    const cols = model.get("category_columns") || [];
    const active = model.get("active_category");
    const colIdx = cols.findIndex((c) => c.name === active);
    const labels = colIdx >= 0 ? cols[colIdx].labels || [] : [];
    const n = getPointsData().length;
    if (categoryCodes && labels.length && n && indices && indices.length) {
      const counts = new Map();
      for (const i of indices) {
        const c = categoryCodes[colIdx * n + i];
        if (c >= 0 && c < labels.length) counts.set(c, (counts.get(c) || 0) + 1);
      }
      let best = -1;
      let bestN = 0;
      for (const [c, k] of counts) {
        if (k > bestN) {
          best = c;
          bestN = k;
        }
      }
      if (best >= 0) {
        const base = `${labels[best]} · ${indices.length}`;
        const used = new Set((items || []).map((x) => String(x.id)));
        if (!used.has(base)) return base;
        for (let i = 2; ; i++) if (!used.has(`${base} (${i})`)) return `${base} (${i})`;
      }
    }
    return nextNumberedId(prefix, items);
  }

  function resetDraft() {
    draft = [];
    draftCursor = null;
    lineStrokeActive = false;
    lassoPath = [];
    isLassoing = false;
    isBoxing = false;
    boxStart = null;
    boxCurrent = null;
  }

  function eventPoint(event) {
    const rect = webglCanvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const px = event.clientX - rect.left;
    const py = event.clientY - rect.top;
    const viewport = deckgl?.isInitialized ? deckgl.getViewports()[0] : null;
    if (!viewport) return null;
    const [x, y] = viewport.unproject([px, py]);
    return { x, y, px, py };
  }

  /** Space held: pan like Move in any tool, without changing the synced mode. */
  let spacePan = false;

  function panActive() {
    return currentMode === "move" || spacePan;
  }

  function setSpacePan(on) {
    if (spacePan === on) return;
    spacePan = on;
    webglCanvas.style.cursor = defaultCursor();
    if (deckgl) deckgl.setProps({ controller: controllerProps() });
  }

  function controllerProps() {
    const pan = panActive();
    return {
      dragPan: pan,
      scrollZoom: true,
      doubleClickZoom: false,
      touchRotate: false,
    };
  }

  function defaultCursor() {
    if (panActive()) return "grab";
    if (currentMode === "select") return "default";
    if (currentMode === "node") return "default";
    if (currentMode === "probe") return "crosshair";
    if (currentMode === "inspect") return "crosshair";
    return "crosshair";
  }

  function syncInteractionMode() {
    if (currentMode !== "select" && currentMode !== "probe") hoverTarget = null;
    if (currentMode !== "probe" && (hoverBinIndex >= 0 || hoverProbeWorld || pinnedProbeWorld)) {
      hoverBinIndex = -1;
      hoverPointIndex = -1;
      pinnedPointIndex = -1;
      hoverProbeWorld = null;
      probeDisplayWorld = null;
      stopProbeSmooth();
      pinnedProbeWorld = null;
    }
    webglCanvas.style.cursor = defaultCursor();
    if (deckgl) deckgl.setProps({ controller: controllerProps() });
  }

  function syncCanvasBuffer() {
    const w = Math.max(1, Math.round(main.clientWidth || 1));
    const h = Math.max(1, Math.round(main.clientHeight || 1));
    plotW = w;
    plotH = h;
    if (deckgl) deckgl.setProps({ width: w, height: h, useDevicePixels: true });
    return { w, h };
  }

  function formatLegendValue(v) {
    if (!Number.isFinite(v)) return "";
    const a = Math.abs(v);
    if (a !== 0 && (a >= 1000 || a < 0.01)) return v.toExponential(1);
    if (a >= 100) return v.toFixed(0);
    if (a >= 10) return v.toFixed(1);
    return v.toFixed(2);
  }

  function updatePointLegend() {
    if (!legend) return;
    if (isRasterMode()) {
      // Continuous bar lives in the Layers → Raster panel.
      legend.innerHTML = "";
      legend.hidden = true;
      return;
    }
    const mode = model.get("color_by") || "categorical";
    const title = model.get("legend_title") || "";

    legend.innerHTML = "";
    if (title) {
      const t = document.createElement("div");
      t.className = "landmarks__legend-title";
      t.textContent = title;
      legend.appendChild(t);
    }

    // Gene / embedding legends render in Explore chrome under the combobox.
    if (mode === "embedding" || mode === "continuous") {
      legend.hidden = true;
      return;
    }

    if (mode === "categorical") {
      legend.hidden = true;
      return;
    }

    legend.hidden = !title;
  }

  function hexToRgbaBytes(hex, alpha) {
    const h = String(hex || FALLBACK_POINT).replace("#", "");
    const full =
      h.length === 3
        ? h
          .split("")
          .map((c) => c + c)
          .join("")
        : h.padEnd(6, "0").slice(0, 6);
    const n = Number.parseInt(full, 16);
    return [
      (n >> 16) & 255,
      (n >> 8) & 255,
      n & 255,
      Math.round(Math.max(0, Math.min(1, alpha)) * 255),
    ];
  }

  /** Readable text on a solid landmark-colored chip (WCAG-ish luminance). */
  function contrastOnHex(hex) {
    const [r, g, b] = hexToRgbaBytes(hex, 1);
    const lin = (c) => {
      const x = c / 255;
      return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
    };
    const L = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    return L > 0.45 ? [15, 15, 15, 245] : [255, 255, 255, 250];
  }

  function landmarkLabelStyle(hex) {
    return {
      color: contrastOnHex(hex),
      // Solid tinted chip (ChromeTooltip-like padding via TextLayer background).
      background: hexToRgbaBytes(hex, 0.92),
    };
  }

  function fillColorForPoint(d, probeField) {
    const opacity = POINT_OPACITY;
    const sim = similarityRgbaForPoint(d.i, opacity, probeField);
    if (sim) {
      if (!pointRoleMode || !pointRoles) return sim;
      const role = pointRoles[d.i] || 0;
      if (role === SEED_ROLE || role === NEIGH_ROLE) {
        sim[3] = 255;
        return sim;
      }
      sim[3] = Math.round((sim[3] || 255) * OTHER_ALPHA_SCALE);
      return sim;
    }
    const mode = model.get("color_by") || "categorical";
    let rgba;
    if (mode === "embedding") {
      rgba =
        blendEmbeddingColors(d.i, opacity) ||
        hexToRgbaBytes("#6b7280", opacity * 0.35);
    } else if (mode === "continuous") {
      const activeGenes = model.get("active_genes") || [];
      if (activeGenes.length > 0) {
        rgba =
          blendGeneColors(d.i, opacity) ||
          hexToRgbaBytes("#6b7280", opacity * 0.35);
      } else {
        // Genes mode at rest (none selected): uniform neutral grey.
        rgba = hexToRgbaBytes("#6b7280", opacity);
      }
    } else {
      const cols = model.get("category_columns") || [];
      const ci = activeCategoryIndex();
      const col = ci >= 0 ? cols[ci] : null;
      const palette = (col && col.palette) || model.get("point_palette") || [FALLBACK_POINT];
      const code = col ? categoryCodeAt(d.i) : Math.round(d.valueA);
      rgba = hexToRgbaBytes(palette[((code % palette.length) + palette.length) % palette.length], opacity);
    }
    if (!pointRoleMode || !pointRoles) return rgba;
    const role = pointRoles[d.i] || 0;
    if (role === SEED_ROLE || role === NEIGH_ROLE) {
      rgba[3] = 255;
      return rgba;
    }
    rgba[3] = Math.round((rgba[3] || 255) * OTHER_ALPHA_SCALE);
    return rgba;
  }

  function radiusForPoint(d) {
    const size = model.get("point_size") ?? 2;
    if (!pointRoleMode || !pointRoles) return size;
    const role = pointRoles[d.i] || 0;
    if (role === SEED_ROLE) return size * SELECTED_SIZE_SCALE;
    if (role === NEIGH_ROLE) return size;
    return size * OTHER_SIZE_SCALE;
  }

  function asPath(points) {
    return points.map((p) => [p.x, p.y]);
  }

  function asClosedPath(points) {
    const pts = asPath(points);
    if (!pts.length) return pts;
    const first = pts[0];
    const last = pts[pts.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) pts.push(first);
    return pts;
  }

  function boxPolygon(a, b) {
    if (currentMode === "ellipse") {
      const cx = (a.x + b.x) / 2;
      const cy = (a.y + b.y) / 2;
      const rx = Math.abs(b.x - a.x) / 2;
      const ry = Math.abs(b.y - a.y) / 2;
      const pts = [];
      for (let i = 0; i < 64; i++) {
        const t = (i / 64) * Math.PI * 2;
        pts.push([cx + rx * Math.cos(t), cy + ry * Math.sin(t)]);
      }
      return pts;
    }
    return [
      [a.x, a.y],
      [b.x, a.y],
      [b.x, b.y],
      [a.x, b.y],
    ];
  }

  function selectionPolygonData(sel) {
    if (sel.type === "polygon" || sel.type === "lasso") {
      return (sel.vertices || []).map(([x, y]) => [x, y]);
    }
    const a = -(sel.angle || 0);
    if (sel.type === "rectangle") {
      const cx = sel.cx;
      const cy = sel.cy;
      const w = sel.width;
      const h = sel.height;
      const origin = { x: cx, y: cy };
      return [
        { x: cx - w / 2, y: cy - h / 2 },
        { x: cx + w / 2, y: cy - h / 2 },
        { x: cx + w / 2, y: cy + h / 2 },
        { x: cx - w / 2, y: cy + h / 2 },
      ].map((p) => {
        const r = rotatePt(p, origin, a);
        return [r.x, r.y];
      });
    }
    if (sel.type === "ellipse") {
      const cx = sel.cx;
      const cy = sel.cy;
      const rx = sel.rx;
      const ry = sel.ry;
      const origin = { x: cx, y: cy };
      const pts = [];
      for (let i = 0; i < 64; i++) {
        const t = (i / 64) * Math.PI * 2;
        const r = rotatePt(
          { x: cx + rx * Math.cos(t), y: cy + ry * Math.sin(t) },
          origin,
          a
        );
        pts.push([r.x, r.y]);
      }
      return pts;
    }
    return [];
  }

  function getPointsData() {
    const b64 = model.get("points_data") || "";
    const xBounds = model.get("x_bounds");
    const yBounds = model.get("y_bounds");
    // Hot path: called per point by color accessors. Same model values (by
    // reference) mean the same points, with no string work on a multi-MB pack.
    if (b64 === pointsCache.b64 && xBounds === pointsCache.xBounds && yBounds === pointsCache.yBounds) {
      return pointsCache.data;
    }
    if (!Array.isArray(xBounds) || xBounds.length < 2 || !Array.isArray(yBounds) || yBounds.length < 2) {
      return [];
    }
    const [xMin, xMax] = xBounds;
    const [yMin, yMax] = yBounds;
    const key = `${b64.length}:${xMin}:${xMax}:${yMin}:${yMax}:${b64.slice(0, 32)}:${b64.slice(-32)}`;
    if (key === pointsCache.key) {
      pointsCache = { ...pointsCache, b64, xBounds, yBounds };
      return pointsCache.data;
    }
    const raw = decodeF32Base64(b64);
    const n = Math.floor(raw.length / 4);
    const data = new Array(n);
    for (let i = 0; i < n; i++) {
      const o = i * 4;
      const zUm = raw[o + 3];
      data[i] = {
        i,
        x: xMin + ((raw[o] + 1) / 2) * (xMax - xMin),
        y: yMin + ((raw[o + 1] + 1) / 2) * (yMax - yMin),
        valueA: raw[o + 2],
        z: Number.isFinite(zUm) ? zUm : undefined,
      };
    }
    pointsCache = { key, data, b64, xBounds, yBounds };
    invalidatePointGeometryBuffers();
    spatialIndex = null;
    spatialIndexPointCount = 0;
    scheduleSpatialIndexBuild();
    schedulePointFillColorsBuild();
    return data;
  }

  function buildPointsLayer() {
    if (!deckModules) return [];
    // Hold points until the raster bitmap is ready — avoids a blank clear frame
    // while Python rebuilds bins / texture on points → raster.
    if (rasterBitmapReady()) return [];
    const { ScatterplotLayer } = deckModules;
    const data = getPointsData();
    if (!data.length) return [];
    ensurePointPositionBuffer(data);
    // point_size is radius in the same units as x/y (µm for micron data).
    const size = model.get("point_size") ?? 2;
    const probeField =
      pointSimilarityOn() || rasterSimilarityOn()
        ? activePointProbeScores()
        : null;
    const fillKey = pointColorCacheKey(probeField);
    const colorTriggers = [fillKey, pointRoleMode ? "hood-dim" : "rest"];
    const layers = [];
    const scatterData = {
      length: data.length,
      attributes: {
        getPosition: { value: pointPositionBuffer, size: 3 },
      },
    };

    syncScatterRoleAttributes();
    scatterData.attributes.getFillColor = {
      value: scatterDisplayColors,
      size: 4,
      normalized: true,
    };
    scatterData.attributes.getRadius = { value: scatterDisplayRadii, size: 1 };
    layers.push(
      new ScatterplotLayer({
        id: "landmarks-points",
        data: scatterData,
        radiusUnits: "common",
        radiusMinPixels: 1.5,
        stroked: false,
        filled: true,
        pickable: false,
        updateTriggers: {
          getFillColor: [fillKey, scatterRoleRevision],
          getRadius: [size, scatterRoleRevision],
        },
      }),
    );
    return layers;
  }

  function landmarkLabelAnchor(lm, pathPts) {
    const name = String(lm.id || "").trim();
    if (!name) return null;
    if (lm.type === "point") {
      const v = (lm.vertices || [])[0];
      if (!v) return null;
      return {
        text: name,
        position: [v[0], v[1], 0],
        angle: 0,
        pixelOffset: [16, -16],
        textAnchor: "start",
        alignmentBaseline: "bottom",
      };
    }
    const pts = pathPts && pathPts.length ? pathPts : landmarkPathData(lm);
    if (!pts.length) return null;
    // Prefer near the end, stepped back slightly; larger offset from the tip.
    const endIdx = Math.max(0, pts.length - 1);
    const tipIdx = Math.max(0, Math.floor(endIdx * 0.92));
    const p = pts[tipIdx] || pts[endIdx];
    return {
      text: name,
      position: [p.x, p.y, 0],
      angle: 0,
      pixelOffset: lm.type === "shape" ? [0, -16] : [0, -18],
      textAnchor: "middle",
      alignmentBaseline: "bottom",
    };
  }

  function scaleRgbaAlpha(rgba, scale) {
    if (scale >= 0.999) return rgba;
    const out = rgba.slice();
    out[3] = Math.round((out[3] ?? 255) * scale);
    return out;
  }

  function buildLandmarkLayers() {
    if (!deckModules) return [];
    const { PathLayer, PolygonLayer, ScatterplotLayer, TextLayer, PathStyleExtension } = deckModules;
    const kind = model.get("selected_kind");
    const selectedIdx = model.get("selected_index");
    const stroke = STROKE_WIDTH;
    const opacity = LANDMARK_OPACITY;
    const dimOthers = kind === "landmark" && selectedIdx >= 0;
    const polys = [];
    const paths = [];
    const markers = [];
    const arrows = [];
    const labels = [];
    const arrowWorld = pixelsToWorld(14);
    (model.get("landmarks") || []).forEach((lm, i) => {
      if (lm.hidden) return;
      const rawHex =
        (typeof lm.color === "string" && lm.color) || COLORS[i % COLORS.length];
      const hex = isRasterMode() ? RASTER_LANDMARK_GRAY : rawHex;
      const dashed = String(lm.line_style || "solid") === "dashed";
      const selected = kind === "landmark" && i === selectedIdx;
      const alphaScale = dimOthers && !selected ? 0.62 : 1;
      const lw = selected ? stroke + 1 : stroke;
      const line = scaleRgbaAlpha(hexToRgbaBytes(hex, 1), alphaScale);
      const fill = scaleRgbaAlpha(hexToRgbaBytes(hex, opacity), alphaScale);
      const pick = { kind: "landmark", index: i };
      if (lm.type === "point") {
        const v = (lm.vertices || [])[0];
        if (!v) return;
        const buffer = bufferPolygonData(lm);
        pushBufferPolys(
          polys,
          buffer,
          scaleRgbaAlpha(hexToRgbaBytes(NEIGH_COLOR, NEIGH_FILL_ALPHA), alphaScale),
          scaleRgbaAlpha(hexToRgbaBytes(NEIGH_COLOR, NEIGH_LINE_ALPHA), alphaScale),
          1.5,
          pick,
        );
        markers.push({
          position: [v[0], v[1], 0],
          fill,
          line,
          lineWidth: selected ? 2 : 1.5,
          radius: selected ? 7 : 6,
          ...pick,
        });
        const anchor = landmarkLabelAnchor(lm);
        if (anchor) {
          const style = landmarkLabelStyle(hex);
          labels.push({
            ...anchor,
            color: scaleRgbaAlpha(style.color, alphaScale),
            background: scaleRgbaAlpha(style.background, alphaScale),
            ...pick,
          });
        }
        return;
      }
      const pathPts = landmarkPathData(lm);
      if (lm.type === "shape" && pathPts.length >= 3) {
        polys.push({
          polygon: asPath(pathPts),
          fill,
          line,
          width: lw,
          ...pick,
        });
        const shapeBuffer = bufferPolygonData(lm);
        pushBufferPolys(
          polys,
          shapeBuffer,
          scaleRgbaAlpha(hexToRgbaBytes(NEIGH_COLOR, NEIGH_FILL_ALPHA), alphaScale),
          scaleRgbaAlpha(hexToRgbaBytes(NEIGH_COLOR, NEIGH_LINE_ALPHA), alphaScale),
          1.5,
          pick,
        );
        (lm.vertices || []).forEach(([x, y], vidx) => {
          if (currentMode !== "node") return;
          const hoveredVertex = selected && vidx === hoverVertexIndex;
          const activeVertex =
            selected && vidx === activeVertexIndex && activeVertexIndex >= 0;
          markers.push({
            position: [x, y, 0],
            fill: line,
            line,
            lineWidth: hoveredVertex || activeVertex ? 1.5 : 0,
            radius: activeVertex
              ? 8
              : hoveredVertex
                ? selected
                  ? 7
                  : 5
                : selected
                  ? 5
                  : 4,
            ...pick,
          });
        });
        if (
          currentMode === "node" &&
          selected &&
          hoverInsert &&
          hoverInsert.landmarkIdx === i
        ) {
          markers.push({
            position: [hoverInsert.x, hoverInsert.y, 0],
            fill: scaleRgbaAlpha(hexToRgbaBytes(hex, 0.55), alphaScale),
            line,
            lineWidth: 1,
            radius: 3,
            ...pick,
          });
        }
        const anchor = landmarkLabelAnchor(lm, pathPts);
        if (anchor) {
          const style = landmarkLabelStyle(hex);
          labels.push({
            ...anchor,
            color: scaleRgbaAlpha(style.color, alphaScale),
            background: scaleRgbaAlpha(style.background, alphaScale),
            ...pick,
          });
        }
        return;
      }
      const buffer = bufferPolygonData(lm);
      pushBufferPolys(
        polys,
        buffer,
        scaleRgbaAlpha(hexToRgbaBytes(NEIGH_COLOR, NEIGH_FILL_ALPHA), alphaScale),
        scaleRgbaAlpha(hexToRgbaBytes(NEIGH_COLOR, NEIGH_LINE_ALPHA), alphaScale),
        1.5,
        pick,
      );
      if (pathPts.length >= 2) {
        const path = asPath(pathPts);
        paths.push({
          path,
          color: line,
          width: lw,
          dashed,
          ...pick,
        });
        if (["line", "spline", "gradient"].includes(lm.type)) {
          const head = arrowHeadPolygon(path, arrowWorld);
          if (head) arrows.push({ polygon: head, fill: line, line, width: 1, ...pick });
        }
        (lm.vertices || []).forEach(([x, y], vidx) => {
          if (currentMode !== "node") return;
          const hoveredVertex = selected && vidx === hoverVertexIndex;
          const activeVertex =
            selected && vidx === activeVertexIndex && activeVertexIndex >= 0;
          markers.push({
            position: [x, y, 0],
            fill: line,
            line,
            lineWidth: hoveredVertex || activeVertex ? 1.5 : 0,
            radius: activeVertex
              ? 8
              : hoveredVertex
                ? selected
                  ? 7
                  : 5
                : selected
                  ? 5
                  : 4,
            ...pick,
          });
        });
        if (
          currentMode === "node" &&
          selected &&
          hoverInsert &&
          hoverInsert.landmarkIdx === i
        ) {
          markers.push({
            position: [hoverInsert.x, hoverInsert.y, 0],
            fill: scaleRgbaAlpha(hexToRgbaBytes(hex, 0.55), alphaScale),
            line,
            lineWidth: 1,
            radius: 3,
            ...pick,
          });
        }
        const anchor = landmarkLabelAnchor(lm, pathPts);
        if (anchor) {
          const style = landmarkLabelStyle(hex);
          labels.push({
            ...anchor,
            color: scaleRgbaAlpha(style.color, alphaScale),
            background: scaleRgbaAlpha(style.background, alphaScale),
            ...pick,
          });
        }
      }
    });
    const layers = [];
    if (polys.length || arrows.length) {
      layers.push(
        new PolygonLayer({
          id: "landmark-polygons",
          data: [...polys, ...arrows],
          getPolygon: (d) => d.polygon,
          getFillColor: (d) => d.fill,
          getLineColor: (d) => d.line,
          getLineWidth: (d) => d.width,
          lineWidthUnits: "pixels",
          stroked: true,
          filled: true,
          pickable: true,
          parameters: OVERLAY_GL,
        })
      );
    }
    if (paths.length) {
      layers.push(
        new PathLayer({
          id: "landmark-paths",
          data: paths,
          getPath: (d) => d.path,
          getColor: (d) => d.color,
          getWidth: (d) => d.width,
          getDashArray: (d) => (d.dashed ? LANDMARK_DASH : [0, 0]),
          extensions: [new PathStyleExtension({ dash: true, highPrecisionDash: true })],
          widthUnits: "pixels",
          jointRounded: true,
          capRounded: true,
          pickable: true,
          widthMinPixels: 1,
          parameters: OVERLAY_GL,
        })
      );
    }
    if (markers.length) {
      layers.push(
        new ScatterplotLayer({
          id: "landmark-markers",
          data: markers,
          getPosition: (d) => d.position,
          getFillColor: (d) => d.fill,
          getLineColor: (d) => d.line,
          getRadius: (d) => d.radius,
          getLineWidth: (d) => d.lineWidth ?? 0,
          radiusUnits: "pixels",
          lineWidthUnits: "pixels",
          filled: true,
          stroked: true,
          pickable: true,
          radiusMinPixels: 2,
          parameters: OVERLAY_GL,
        })
      );
    }
    if (labels.length) {
      layers.push(
        new TextLayer({
          id: "landmark-labels",
          data: labels,
          getText: (d) => d.text,
          getPosition: (d) => d.position,
          getColor: (d) => d.color,
          getAngle: 0,
          getPixelOffset: (d) => d.pixelOffset || [0, 0],
          getTextAnchor: (d) => d.textAnchor || "middle",
          getAlignmentBaseline: (d) => d.alignmentBaseline || "center",
          getSize: 11,
          sizeUnits: "pixels",
          fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
          fontWeight: 500,
          billboard: true,
          background: true,
          backgroundPadding: [8, 4],
          backgroundBorderRadius: 6,
          getBackgroundColor: (d) => d.background,
          outlineWidth: 0,
          pickable: false,
          parameters: OVERLAY_GL,
          updateTriggers: {
            getText: [model.get("landmarks")],
            getColor: [model.get("landmarks"), kind, selectedIdx],
            getBackgroundColor: [model.get("landmarks")],
            getPosition: [model.get("landmarks")],
          },
        })
      );
    }
    return layers;
  }

  const landmarkListeners = new Set();

  /**
   * The landmarks as the map draws them, for the Inspect cube: map (µm)
   * coordinates, splines and shapes sampled as on the map, each in its
   * landmark's colour. Hidden landmarks are left out.
   */
  function landmarkGeometry() {
    const out = [];
    (model.get("landmarks") || []).forEach((lm, i) => {
      if (lm.hidden) return;
      const hex = (typeof lm.color === "string" && lm.color) || COLORS[i % COLORS.length];
      const color = hexToRgbaBytes(hex, 1);
      if (lm.type === "point") {
        const v = (lm.vertices || [])[0];
        if (v) out.push({ kind: "point", coords: [[v[0], v[1]]], closed: false, color });
        return;
      }
      const closed = lm.type === "shape";
      const pts = landmarkPathData(lm);
      if (pts.length >= (closed ? 3 : 2)) out.push({ kind: "path", coords: asPath(pts), closed, color });
    });
    return out;
  }

  function buildDraftLayers() {
    if (!deckModules) return [];
    const { PathLayer, PolygonLayer, ScatterplotLayer, PathStyleExtension } = deckModules;
    const isSel = ["lasso", "polygon", "rectangle", "ellipse"].includes(currentMode);
    // Preview color matches the next committed entity color.
    const hex = isSel
      ? SEL_COLORS[(model.get("selections") || []).length % SEL_COLORS.length]
      : COLORS[(model.get("landmarks") || []).length % COLORS.length];
    const line = hexToRgbaBytes(hex, 1);
    const fill = hexToRgbaBytes(hex, 0.15);
    const stroke = STROKE_WIDTH;
    const layers = [];
    let path = null;
    let polygon = null;
    let markers = [];

    if (isLassoing && lassoPath.length >= 2) {
      path = asPath(lassoPath);
    } else if (isBoxing && boxStart && boxCurrent) {
      polygon = boxPolygon(boxStart, boxCurrent);
    } else if (draft.length) {
      // Rubber-band: append live cursor after the last committed vertex.
      const preview =
        draftCursor &&
        ["line", "spline", "shape", "polygon"].includes(currentMode)
          ? [...draft, draftCursor]
          : draft;
      const sampled =
        currentMode === "spline"
          ? cardinalSample(preview, DEFAULT_TENSION, 20, false)
          : currentMode === "shape"
            ? cardinalSample(preview, DEFAULT_TENSION, 20, true)
            : preview;
      if (currentMode === "polygon" || currentMode === "shape") {
        polygon = asPath(sampled);
        path = asClosedPath(sampled);
      } else {
        path = asPath(sampled);
      }
      markers = draft.map((p) => ({ position: [p.x, p.y, 0], fill: line }));
      if (
        draftCursor &&
        ["line", "spline", "shape", "polygon"].includes(currentMode)
      ) {
        markers.push({
          position: [draftCursor.x, draftCursor.y, 0],
          fill: hexToRgbaBytes(hex, 0.55),
        });
      }
    }

    if (polygon && polygon.length >= 3) {
      // Fill without stroke; dashed outline via PathLayer when selection.
      layers.push(
        new PolygonLayer({
          id: "draft-polygon",
          data: [{ polygon, fill }],
          getPolygon: (d) => d.polygon,
          getFillColor: (d) => d.fill,
          stroked: false,
          filled: true,
          pickable: false,
          parameters: OVERLAY_GL,
        })
      );
      const outline = asClosedPath(polygon.map((pt) => ({ x: pt[0], y: pt[1] })));
      layers.push(
        new PathLayer({
          id: "draft-polygon-outline",
          data: [{ path: outline, color: line, width: isSel ? 2 : stroke }],
          getPath: (d) => d.path,
          getColor: (d) => d.color,
          getWidth: (d) => d.width,
          widthUnits: "pixels",
          jointRounded: true,
          capRounded: true,
          pickable: false,
          parameters: OVERLAY_GL,
          ...(isSel
            ? {
                getDashArray: SELECTION_DOT,
                dashJustified: true,
                extensions: [new PathStyleExtension({ dash: true, highPrecisionDash: true })],
              }
            : {}),
        })
      );
    } else if (path && path.length >= 2) {
      layers.push(
        new PathLayer({
          id: "draft-path",
          data: [{ path, color: line, width: isSel ? 2 : stroke }],
          getPath: (d) => d.path,
          getColor: (d) => d.color,
          getWidth: (d) => d.width,
          widthUnits: "pixels",
          jointRounded: true,
          capRounded: true,
          pickable: false,
          parameters: OVERLAY_GL,
          ...(isSel
            ? {
                getDashArray: SELECTION_DOT,
                dashJustified: true,
                extensions: [new PathStyleExtension({ dash: true, highPrecisionDash: true })],
              }
            : {}),
        })
      );
    }
    if (markers.length) {
      layers.push(
        new ScatterplotLayer({
          id: "draft-markers",
          data: markers,
          getPosition: (d) => d.position,
          getFillColor: (d) => d.fill,
          getRadius: 4,
          radiusUnits: "pixels",
          filled: true,
          stroked: false,
          pickable: false,
          parameters: OVERLAY_GL,
        })
      );
    }
    return layers;
  }

  function pixelsToWorld(px) {
    const vp = deckgl?.isInitialized ? deckgl.getViewports()?.[0] : null;
    if (!vp?.unproject) return px;
    const [x0] = vp.unproject([0, 0]);
    const [x1] = vp.unproject([px, 0]);
    return Math.max(Math.abs(x1 - x0), 1e-9);
  }

  function arrowHeadPolygon(path, size) {
    if (!path || path.length < 2 || !(size > 0)) return null;
    const a = path[path.length - 2];
    const b = path[path.length - 1];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const ux = (b[0] - a[0]) / len;
    const uy = (b[1] - a[1]) / len;
    const px = -uy;
    const py = ux;
    const tip = [b[0] + ux * size * 0.15, b[1] + uy * size * 0.15];
    const base = [b[0] - ux * size, b[1] - uy * size];
    return [
      tip,
      [base[0] + px * size * 0.55, base[1] + py * size * 0.55],
      [base[0] - px * size * 0.55, base[1] - py * size * 0.55],
    ];
  }

  function lookupGraphNeighbors(graph, pts, seedIdxs, opts) {
    // graph unused — client KD-tree replaces CSR sync.
    const tree = ensureSpatialIndexForQuery();
    return queryNeighbors(tree, pts, seedIdxs, opts);
  }

  function buildNeighborhoodLayers() {
    if (!deckModules) return [];
    if (isRasterMode()) return [];
    const focus = cellLayerFocus();
    const hood = neighborhoodFor(focus);
    if (!focus || !hood || hood.neighborhood === "off") return [];
    const layers = [];
    const { PathLayer, BitmapLayer } = deckModules;
    const pick = { kind: focus.kind, index: focus.index };
    // Radius: soft gradient field baked in world/common units (µm); no per-seed disks.
    if (hood.neighborhood === "radius" && hoodRadiusGradient?.image) {
      layers.push(
        new BitmapLayer({
          id: "neighborhood-radius-gradient",
          image: hoodRadiusGradient.image,
          bounds: hoodRadiusGradient.bounds,
          pickable: false,
          textureParameters: {
            minFilter: "linear",
            magFilter: "linear",
          },
          parameters: OVERLAY_GL,
          updateTriggers: {
            image: hoodRadiusGradient.key,
          },
        })
      );
    }
    // kNN: restyled seed→neighbor edges (thin, low-opacity design-token teal).
    if (hood.neighborhood === "knn" && hoodKnnEdgeLinesDrawn && hoodEdges.length) {
      layers.push(
        new PathLayer({
          id: "neighborhood-knn",
          data: hoodEdges.map((e) => ({ ...e, ...pick })),
          getPath: (d) => d.path,
          getColor: hexToRgbaBytes(NEIGH_COLOR, NEIGH_EDGE_ALPHA),
          getWidth: NEIGH_EDGE_WIDTH,
          widthUnits: "pixels",
          pickable: false,
          parameters: OVERLAY_GL,
        })
      );
    }
    return layers;
  }

  function resolvePointerTarget(info) {
    if (!info) return null;
    // Prefer multi-pick stack: landmark only (points are not selectable).
    if (deckgl?.isInitialized && info.x != null && info.y != null) {
      const stack = deckgl.pickObjects({
        x: info.x,
        y: info.y,
        radius: 8,
        depth: 12,
      }) || [];
      const objs = stack.map((s) => s.object).filter(Boolean);
      const landmark = objs.find((o) => o.kind === "landmark");
      if (landmark) return { kind: "landmark", index: landmark.index };
    }
    const obj = info.object;
    if (obj?.kind === "landmark") {
      return { kind: "landmark", index: obj.index };
    }
    return null;
  }

  /** Hover pick: landmarks only (cells are not pickable). */
  function resolveHoverTarget(info) {
    if (!info) return null;
    if (deckgl?.isInitialized && info.x != null && info.y != null) {
      const stack = deckgl.pickObjects({
        x: info.x,
        y: info.y,
        radius: 8,
        depth: 12,
      }) || [];
      const objs = stack.map((s) => s.object).filter(Boolean);
      const landmark = objs.find((o) => o.kind === "landmark");
      if (landmark) return { kind: "landmark", index: landmark.index };
    }
    const obj = info.object;
    if (obj?.kind === "landmark") return { kind: obj.kind, index: obj.index };
    return null;
  }

  function buildProbeOutlineLayers() {
    if (!deckModules || !probeModeOn()) return [];
    const { ScatterplotLayer } = deckModules;
    const R = probeWindowRadius();
    const disks = [];

    const pinnedBin = model.get("raster_query_bin");
    if (isRasterMode() && pinnedBin != null && (pinnedBin | 0) >= 0) {
      const c = binWindowCenter(pinnedBin | 0);
      if (c) disks.push({ position: [c.x, c.y, 0], pinned: true, key: `bin${pinnedBin}` });
    } else if (!isRasterMode() && pinnedProbeWorld) {
      disks.push({
        position: [pinnedProbeWorld.x, pinnedProbeWorld.y, 0],
        pinned: true,
        key: `pin${pinnedProbeWorld.x},${pinnedProbeWorld.y}`,
      });
    }

    if ((hoverProbeWorld || probeDisplayWorld) && !genesProbeHoverInert()) {
      const circle = probeCircleWorld();
      const hx = circle.x;
      const hy = circle.y;
      const onPinnedPoints =
        !isRasterMode() &&
        pinnedProbeWorld &&
        pinnedProbeWorld.x === hoverProbeWorld?.x &&
        pinnedProbeWorld.y === hoverProbeWorld?.y;
      if (!onPinnedPoints) {
        disks.push({ position: [hx, hy, 0], pinned: false, key: "hover" });
      }
    }

    if (!disks.length) return [];
    return disks.map((disk) =>
      new ScatterplotLayer({
        id: disk.pinned ? "probe-window-pinned" : "probe-window-hover",
        data: [disk],
        getPosition: (d) => d.position,
        getRadius: R,
        radiusUnits: "common",
        stroked: true,
        filled: true,
        getFillColor: [0, 0, 0, 0],
        getLineColor: hexToRgbaBytes(
          disk.pinned ? PROBE_PINNED_STROKE : PROBE_HOVER_STROKE,
          disk.pinned ? 0.95 : 0.72,
        ),
        getLineWidth: disk.pinned ? PROBE_PINNED_WIDTH : PROBE_HOVER_WIDTH,
        lineWidthUnits: "pixels",
        pickable: false,
        parameters: OVERLAY_GL,
        updateTriggers: {
          getPosition: [
            hoverProbeWorld,
            probeDisplayWorld,
            pinnedProbeWorld,
            model.get("raster_query_bin"),
            probeScrubSeq,
          ],
          getRadius: [model.get("raster_window_radius"), model.get("raster_bin_size")],
        },
      }),
    );
  }

  let lastDeckBuildProfile = {
    prepareFocusGeomMs: 0,
    buildLayersMs: 0,
    neighborQueryMs: 0,
    roleScatterSyncMs: 0,
  };

  function buildDeckLayers() {
    const tPrep = performance.now();
    prepareFocusGeom();
    lastDeckBuildProfile.prepareFocusGeomMs = performance.now() - tPrep;
    const tLay = performance.now();
    const layers = [
      ...buildMapMosaicLayer(),
      ...buildRasterLayers(),
      ...buildProbeOutlineLayers(),
      ...buildNeighborhoodLayers(),
      ...buildPointsLayer(),
      ...buildLandmarkLayers(),
      ...buildDraftLayers(),
      ...buildVolumeWindowLayers(),
    ].filter(Boolean);
    lastDeckBuildProfile.buildLayersMs = performance.now() - tLay;
    return layers;
  }

  /** The placed window `{ x, y, size }` (µm); the hover square is `{ x, y, px, py }`. */
  let volumeWindow = null;
  let volumeWindowSavedAt = 0;
  let volumeHover = null;
  let volumeWindowVisible = false;
  /** The press in Inspect: it places the live window and drags it until release. */
  let inspectGesture = null;
  /** Aborts the press's window `mousemove` / `mouseup` / `blur` listeners (dragged and released anywhere). */
  let inspectGestureAbort = null;
  const inspectListeners = new Set();

  function emitInspect(evt) {
    for (const fn of inspectListeners) fn(evt);
  }

  /** The square's current on-screen side (px): the fixed window at this zoom. */
  function inspectSquarePx() {
    const z = currentViewState?.zoom;
    const zoom = Array.isArray(z) ? z[0] : z;
    return inspectWindowUm * Math.pow(2, zoom ?? 0);
  }

  function emitInspectHover() {
    if (!volumeHover) return;
    const { x, y, px, py } = volumeHover;
    emitInspect({ type: "hover", x, y, sizeUm: inspectWindowUm, sizePx: inspectSquarePx(), px, py });
  }

  function clearInspectHover() {
    if (!volumeHover) return false;
    volumeHover = null;
    emitInspect({ type: "hover-end" });
    return true;
  }

  /** On zoom the hover square keeps its µm size: re-announce its screen size (the preview sits beside it). */
  function inspectHoverOnView() {
    if (currentMode !== "inspect" || !volumeHover) return;
    emitInspectHover();
  }

  function setVolumeWindow(x, y, size, flush) {
    volumeWindow = { x, y, size };
    model.set("inspect_cx", x);
    model.set("inspect_cy", y);
    model.set("inspect_size_um", size);
    const now = performance.now();
    if (flush || now - volumeWindowSavedAt > 40) {
      volumeWindowSavedAt = now;
      model.save_changes();
    }
    setDeckLayers();
  }

  /** Whether there is a 3D image: without one, Inspect only places the square (nothing is saved). */
  function inspectHasVolume() {
    return Boolean(model.get("volume")?.image_url);
  }

  /**
   * Start an Inspect press. Its drag and release are heard on `window` (like
   * pointer capture), so the square follows over the dock or chrome and the
   * release flushes the final position wherever it lands.
   */
  function beginInspectGesture() {
    endInspectGesture();
    inspectGesture = {};
    inspectGestureAbort = new AbortController();
    const opts = { signal: inspectGestureAbort.signal };
    window.addEventListener("mousemove", handleInspectDrag, opts);
    window.addEventListener("mouseup", handleInspectRelease, opts);
    // A lost release (focus left the page mid-press) ends the press too.
    window.addEventListener("blur", endInspectPress, opts);
  }

  function handleInspectDrag(event) {
    if (!inspectGesture) return;
    // No button held: the release was lost (outside the page). End the press.
    if (!(event.buttons & 1)) {
      endInspectPress();
      return;
    }
    const pt = eventPoint(event);
    if (!pt) return;
    setVolumeWindow(pt.x, pt.y, inspectWindowUm, false);
    emitInspect({ type: "place", x: pt.x, y: pt.y });
  }

  /** Drop the press (Esc, mode change, teardown) without flushing. */
  function endInspectGesture() {
    inspectGesture = null;
    inspectGestureAbort?.abort();
    inspectGestureAbort = null;
  }

  /** End the press and save the window where it is (drag moves save at most every 40 ms). */
  function endInspectPress() {
    if (!inspectGesture) return;
    endInspectGesture();
    if (!volumeWindow) return;
    volumeWindowSavedAt = performance.now();
    model.save_changes();
  }

  function handleInspectRelease(event) {
    if (event.button !== 0) return;
    endInspectPress();
    // A release (not Esc, blur or a lost release) is what opens the cube.
    emitInspect({ type: "release" });
  }

  /** Points inside the axis-aligned square (every depth; the cut never changes membership). */
  function inspectMemberIndices(cx, cy, size) {
    const pts = getPointsData();
    const half = size / 2;
    const out = [];
    for (let i = 0; i < pts.length; i++) {
      if (Math.abs(pts[i].x - cx) <= half && Math.abs(pts[i].y - cy) <= half) out.push(i);
    }
    return out;
  }

  /**
   * Save the placed window as a new inspect Selection (a fixed snapshot of the
   * window, its cut and the points in the square) and focus it. Returns its
   * index, or null without a placed window or a 3D image.
   */
  function saveInspect() {
    if (!volumeWindow || !inspectHasVolume()) return null;
    const { x: cx, y: cy, size } = volumeWindow;
    const raw = model.get("volume_cut");
    const cut =
      Array.isArray(raw) && raw.length === 6 && raw.every((v) => typeof v === "number") ? [...raw] : [];
    const selections = [...(model.get("selections") || [])];
    const members = inspectMemberIndices(cx, cy, size);
    selections.push(
      withHood({
        id: selectionName(members, "inspect", selections),
        type: "inspect",
        point_indices: members,
        window: { cx, cy, size_um: size, cut },
      }),
    );
    const index = selections.length - 1;
    model.set("selections", selections);
    model.set("selected_kind", "selection");
    model.set("selected_index", index);
    model.save_changes();
    emitInspect({ type: "commit", index });
    return index;
  }

  function windowRing(x, y, size) {
    const half = size / 2;
    return [
      [x - half, y - half],
      [x + half, y - half],
      [x + half, y + half],
      [x - half, y + half],
    ];
  }

  function buildVolumeWindowLayers() {
    if (!deckModules) return [];
    const { PolygonLayer } = deckModules;
    const layers = [];
    if (volumeWindow && (currentMode === "inspect" || volumeWindowVisible)) {
      layers.push(
        new PolygonLayer({
          id: "volume-inspect-window",
          data: [{ polygon: windowRing(volumeWindow.x, volumeWindow.y, volumeWindow.size) }],
          getPolygon: (d) => d.polygon,
          filled: true,
          stroked: true,
          // Saturated blue reads at a glance over any categorical palette (white vanished on pale clusters).
          getFillColor: [37, 99, 235, 46],
          getLineColor: [37, 99, 235, 255],
          getLineWidth: 2.5,
          lineWidthUnits: "pixels",
          pickable: false,
        }),
      );
    }
    if (currentMode === "inspect" && volumeHover) {
      layers.push(
        new PolygonLayer({
          id: "volume-inspect-hover",
          data: [{ polygon: windowRing(volumeHover.x, volumeHover.y, inspectWindowUm) }],
          getPolygon: (d) => d.polygon,
          filled: true,
          stroked: true,
          getFillColor: [37, 99, 235, 20],
          getLineColor: [37, 99, 235, 160],
          getLineWidth: 1.5,
          lineWidthUnits: "pixels",
          pickable: false,
        }),
      );
    }
    return layers;
  }

  function computeDeckViewState(w, h) {
    const [xMin, xMax] = model.get("x_bounds");
    const [yMin, yMax] = model.get("y_bounds");
    const cx = (xMin + xMax) / 2;
    const cy = (yMin + yMax) / 2;
    const spanX = Math.max(xMax - xMin, 1e-6);
    const spanY = Math.max(yMax - yMin, 1e-6);
    const pad = 40;
    const zoom = Math.log2(
      Math.min((w - pad * 2) / spanX, (h - pad * 2) / spanY)
    );
    // Clamp scroll/button zoom relative to fit (±log2: −1 ≈ 2× out, +6 ≈ 64× in).
    return {
      target: [cx, cy, 0],
      zoom,
      minZoom: zoom - 1,
      maxZoom: zoom + 6,
    };
  }

  function fitDeckToBounds() {
    if (!deckgl) return;
    const w = Math.max(1, webglCanvas.clientWidth || webglCanvas.width);
    const h = Math.max(1, webglCanvas.clientHeight || webglCanvas.height);
    if (w <= 1 || h <= 1) return;
    currentViewState = computeDeckViewState(w, h);
    fitZoom = currentViewState.zoom;
    deckgl.setProps({
      viewState: currentViewState,
      initialViewState: currentViewState,
      width: w,
      height: h,
    });
    if (resetWidget) resetWidget.setProps({ initialViewState: currentViewState });
    fittedOnce = true;
    if (plotBootstrap.state === "loading") {
      setPlotBootstrap({ state: "ready" });
    }
    for (const fn of viewStateListeners) {
      try {
        fn(currentViewState);
      } catch {
        /* ignore */
      }
    }
  }

  function syncFitAsInitialViewState(vs) {
    if (!deckgl || !vs) return;
    deckgl.setProps({ initialViewState: vs });
    if (resetWidget) resetWidget.setProps({ initialViewState: vs });
  }

  /**
   * Stock ZoomWidget spreads Viewport instances ({position}) into viewState.
   * OrthographicView expects {target, zoom}, so the widget bridge cannot drive
   * this camera correctly. Keep widgets mounted (DOM hidden) for compatibility,
   * but implement zoom/reset via EngineHandle viewState updates.
   */
  function setViewState(next, { animate = false, duration = 200 } = {}) {
    if (!deckgl || !currentViewState) return;
    const vs = {
      ...currentViewState,
      ...next,
      transitionDuration: animate ? duration : 0,
    };
    if (animate) {
      if (!zoomInterpolator && deckModules?.LinearInterpolator) {
        zoomInterpolator = new deckModules.LinearInterpolator({
          transitionProps: ["target", "zoom"],
        });
      }
      if (zoomInterpolator) vs.transitionInterpolator = zoomInterpolator;
      vs.transitionEasing = easeOutQuart;
    }
    currentViewState = vs;
    deckgl.setProps({ viewState: vs });
    inspectHoverOnView();
    for (const fn of viewStateListeners) {
      try {
        fn(vs);
      } catch {
        /* ignore listener errors */
      }
    }
  }

  /** React chrome zoom buttons → orthographic viewState. */
  zoomBy = (delta, opts = {}) => {
    if (!deckgl || !currentViewState || !delta) return;
    const fit = fitZoom ?? currentViewState.zoom ?? 0;
    const minZ = currentViewState.minZoom ?? fit - 1;
    const maxZ = currentViewState.maxZoom ?? fit + 6;
    const zoom = Math.max(
      minZ,
      Math.min(maxZ, (currentViewState.zoom ?? 0) + delta)
    );
    const animate = opts.animate !== false && opts.animate !== 0;
    setViewState({ zoom }, {
      animate,
      duration: opts.duration ?? (animate ? 200 : 0),
    });
  };

  /** React chrome reset → fit bounds. */
  resetZoom = () => {
    if (!deckgl) return;
    const w = Math.max(1, webglCanvas.clientWidth || webglCanvas.width);
    const h = Math.max(1, webglCanvas.clientHeight || webglCanvas.height);
    if (w <= 1 || h <= 1) return;
    const fitted = computeDeckViewState(w, h);
    fitZoom = fitted.zoom;
    fittedOnce = true;
    syncFitAsInitialViewState(fitted);
    setViewState(
      {
        target: fitted.target,
        zoom: fitted.zoom,
        minZoom: fitted.minZoom,
        maxZoom: fitted.maxZoom,
      },
      { animate: true, duration: 320 }
    );
    // Recalibrate common-space point radius for the new fit zoom.
    setDeckLayers();
  };

  function resolvePlotBackground() {
    if (cachedPlotBackground != null) return cachedPlotBackground;
    // Prefer a resolved used color (custom props may still be `var(...)`).
    for (const el of [body, container, plotStack]) {
      if (!el) continue;
      const used = getComputedStyle(el).backgroundColor;
      if (used && used !== "rgba(0, 0, 0, 0)" && used !== "transparent") {
        cachedPlotBackground = used;
        return used;
      }
    }
    const token = getComputedStyle(container).getPropertyValue("--background").trim();
    if (token && !token.startsWith("var(")) {
      cachedPlotBackground = token;
      return token;
    }
    cachedPlotBackground = container.classList.contains("landmarks--dark")
      ? "#000000"
      : "#ffffff";
    return cachedPlotBackground;
  }

  applyPlotBackground = () => {
    cachedPlotBackground = null;
    cachedPlotClearColor = null;
    const bg = resolvePlotBackground();
    cachedPlotClearColor = cssColorToClear(bg);
    plotStack.style.background = bg;
    webglCanvas.style.background = bg;
    if (!deckgl) return;
    deckgl.setProps({
      parameters: { clearColor: cachedPlotClearColor,  },
      ...(currentViewState ? { viewState: currentViewState } : {}),
    });
    if (typeof deckgl.redraw === "function") deckgl.redraw(true);
  };

  function applyDeckProps(props) {
    if (!deckgl) return;
    if (cachedPlotClearColor == null) {
      cachedPlotClearColor = cssColorToClear(resolvePlotBackground());
    }
    deckgl.setProps({
      parameters: { clearColor: cachedPlotClearColor,  },
      ...props,
      ...(currentViewState ? { viewState: currentViewState } : {}),
    });
  }

  function setDeckLayers() {
    if (!deckgl || !deckModules) return;
    if (layerRaf) return;
    layerRaf = requestAnimationFrame(() => {
      layerRaf = 0;
      publishDeckLayers(buildDeckLayers());
      maybePulsePendingViewTransition();
    });
  }

  async function loadDeckModules() {
    if (deckModules) return deckModules;
    deckModules = DECK_MODULES;
    return deckModules;
  }

  async function initDeck() {
    if (deckgl) return;
    const { w, h } = syncCanvasBuffer();
    webglCanvas.style.display = "block";
    applyPlotBackground();
    try {
      const hook =
        typeof window !== "undefined" ? window.__landmarksPlotBootstrapHook : null;
      if (hook?.fail) {
        throw new Error(
          typeof hook.fail === "string" ? hook.fail : "Map failed to load (test)",
        );
      }
      if (hook?.delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, hook.delayMs));
      }
      const {
        Deck,
        OrthographicView,
        ZoomWidget: ZoomWidgetCtor,
        ResetViewWidget: ResetViewWidgetCtor,
      } = await loadDeckModules();
      const layers = buildDeckLayers();
      if (!layers.length) {
        console.warn("landmarks deck: no points_data yet");
        return;
      }
      const vs = computeDeckViewState(w, h);
      currentViewState = vs;
      fitZoom = vs.zoom;
      const bg = resolvePlotBackground();
      if (cachedPlotClearColor == null) {
        cachedPlotClearColor = cssColorToClear(bg);
      }
      zoomWidget = new ZoomWidgetCtor({
        id: "landmarks-zoom",
        style: HIDDEN_WIDGET_STYLE,
        transitionDuration: 200,
      });
      resetWidget = new ResetViewWidgetCtor({
        id: "landmarks-reset-view",
        style: HIDDEN_WIDGET_STYLE,
        initialViewState: vs,
      });
      deckgl = new Deck({
        canvas: webglCanvas,
        width: w,
        height: h,
        useDevicePixels: true,
        parent: host,
        views: new OrthographicView(),
        controller: controllerProps(),
        initialViewState: vs,
        widgets: [zoomWidget, resetWidget],
        parameters: { clearColor: cachedPlotClearColor },
        layers,
        pickingRadius: 8,
        getTooltip: deckTooltip,
        getCursor: ({ isDragging, isHovering }) => {
          if (isDragging) return "grabbing";
          if (spacePan) return "grab";
          if (currentMode === "select" && isHovering) return "pointer";
          if (isLandmarkDrawMode(currentMode) && isHovering) return "pointer";
          return defaultCursor();
        },
        onViewStateChange: ({ viewState }) => {
          const fit = fitZoom ?? viewState.zoom ?? 0;
          const vs = {
            ...viewState,
            minZoom: viewState.minZoom ?? currentViewState?.minZoom ?? fit - 1,
            maxZoom: viewState.maxZoom ?? currentViewState?.maxZoom ?? fit + 6,
          };
          currentViewState = vs;
          deckgl.setProps({ viewState: vs });
          inspectHoverOnView();
          for (const fn of viewStateListeners) {
            try {
              fn(vs);
            } catch {
              /* ignore listener errors */
            }
          }
        },
        onClick: (info) => {
          if (probeModeOn()) {
            if (suppressClick) {
              suppressClick = false;
              return;
            }
            const world = worldFromDeckInfo(info);
            if (!world) return;
            if (isRasterMode()) {
              if (!hasRasterFeatures()) return;
              const bin = nearestNonemptyBinWithinRadius(world[0], world[1]);
              if (bin >= 0) {
                model.set("raster_query_bin", bin);
                model.save_changes();
                hoverBinIndex = -1;
                setDeckLayers();
              }
            } else if (hasRasterFeatures()) {
              // Points bin-backed pin: same query bin as raster probe.
              const bin = nearestNonemptyBinWithinRadius(world[0], world[1]);
              if (bin >= 0) {
                model.set("raster_query_bin", bin);
                model.save_changes();
                pinnedProbeWorld = { x: world[0], y: world[1] };
                hoverProbeWorld = null;
                probeDisplayWorld = null;
                stopProbeSmooth();
                hoverBinIndex = -1;
                pinnedPointIndex = -1;
                hoverPointIndex = -1;
                probeScrubSeq = (probeScrubSeq + 1) | 0;
                setDeckLayers();
              }
            } else {
              const q = quantizeProbeWorld(world[0], world[1]);
              const mean = meanRawFeaturesInDisk(q.x, q.y);
              if (mean) {
                pinnedProbeWorld = { x: world[0], y: world[1] };
                hoverProbeWorld = null;
                probeDisplayWorld = null;
                stopProbeSmooth();
                pinnedPointIndex = -1;
                hoverPointIndex = -1;
                probeScrubSeq = (probeScrubSeq + 1) | 0;
                setDeckLayers();
              }
            }
            return;
          }
          if (currentMode !== "select") return;
          if (suppressClick) {
            suppressClick = false;
            return;
          }
          const hit = resolvePointerTarget(info);
          if (hit) {
            setSelected(hit.kind, hit.index);
            return;
          }
          setSelected("", -1);
        },
        onHover: (info) => {
          if (probeModeOn()) {
            // Probe scrub owns world coords via mousemove (eventPoint) —
            // Deck onHover would double-run stickyHoverBin / score rebuilds.
            webglCanvas.style.cursor = "crosshair";
            return;
          }
          if (currentMode === "select") {
            const hit = resolveHoverTarget(info);
            if (hoverBinIndex >= 0) {
              hoverBinIndex = -1;
              setDeckLayers();
            }
            webglCanvas.style.cursor =
              hit?.kind === "landmark" ? "pointer" : "default";
            if (sameTarget(hoverTarget, hit)) return;
            hoverTarget = hit;
            for (const fn of hoverListeners) {
              try {
                fn(hoverTarget ? { ...hoverTarget } : null);
              } catch {
                /* ignore */
              }
            }
            if (hoverRaf) cancelAnimationFrame(hoverRaf);
            hoverRaf = requestAnimationFrame(() => {
              hoverRaf = 0;
              setDeckLayers();
            });
            return;
          }
          if (hoverTarget) {
            hoverTarget = null;
            for (const fn of hoverListeners) {
              try {
                fn(null);
              } catch {
                /* ignore */
              }
            }
            setDeckLayers();
          }
          if (hoverBinIndex >= 0) {
            hoverBinIndex = -1;
            setDeckLayers();
          }
          if (isLandmarkDrawMode(currentMode)) {
            const hit = resolvePointerTarget(info);
            webglCanvas.style.cursor =
              hit?.kind === "landmark" ? "pointer" : defaultCursor();
            return;
          }
          webglCanvas.style.cursor = defaultCursor();
        },
        onLoad: () => {
          updatePointLegend();
          requestAnimationFrame(() => {
            syncCanvasBuffer();
            fitDeckToBounds();
            publishDeckLayers(buildDeckLayers());
            if (typeof deckgl.redraw === "function") deckgl.redraw(true);
          });
        },
      });
      syncInteractionMode();
      requestAnimationFrame(() => {
        if (!deckgl) return;
        syncCanvasBuffer();
        fitDeckToBounds();
        publishDeckLayers(buildDeckLayers());
        if (typeof deckgl.redraw === "function") deckgl.redraw(true);
      });
    } catch (err) {
      console.error("landmarks deck init failed", err);
      setPlotBootstrap({
        state: "error",
        message: `Deck renderer failed: ${err?.message || err}`,
      });
    }
  }

  function resizeDeck() {
    if (!deckgl) return;
    const { w, h } = syncCanvasBuffer();
    applyDeckProps({ width: w, height: h });
    if (!fittedOnce && w > 1 && h > 1) {
      fitDeckToBounds();
    } else if (typeof deckgl.redraw === "function") {
      deckgl.redraw(true);
    }
  }

  function cardinalSample(points, tension, nPerSeg, closed) {
    const n = nPerSeg || 20;
    const t = Math.max(0, Math.min(1, tension == null ? 0 : tension));
    const s = (1 - t) / 2;
    let pts = points.slice();
    let nSeg;
    let at;
    if (closed) {
      if (pts.length >= 2) {
        const a = pts[0], b = pts[pts.length - 1];
        if (a.x === b.x && a.y === b.y) pts = pts.slice(0, -1);
      }
      if (pts.length < 3) return pts.slice();
      const m = pts.length;
      at = (i) => pts[((i % m) + m) % m];
      nSeg = m;
    } else {
      if (pts.length < 2) return pts.slice();
      if (pts.length === 2) return pts.slice();
      const ext = [
        { x: 2 * pts[0].x - pts[1].x, y: 2 * pts[0].y - pts[1].y },
        ...pts,
        {
          x: 2 * pts[pts.length - 1].x - pts[pts.length - 2].x,
          y: 2 * pts[pts.length - 1].y - pts[pts.length - 2].y,
        },
      ];
      at = (i) => ext[i + 1];
      nSeg = pts.length - 1;
    }
    const out = [];
    for (let i = 0; i < nSeg; i++) {
      const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
      const m1x = s * (p2.x - p0.x), m1y = s * (p2.y - p0.y);
      const m2x = s * (p3.x - p1.x), m2y = s * (p3.y - p1.y);
      for (let j = 0; j < n; j++) {
        const u = j / n, u2 = u * u, u3 = u2 * u;
        const h00 = 2 * u3 - 3 * u2 + 1;
        const h10 = u3 - 2 * u2 + u;
        const h01 = -2 * u3 + 3 * u2;
        const h11 = u3 - u2;
        out.push({
          x: h00 * p1.x + h10 * m1x + h01 * p2.x + h11 * m2x,
          y: h00 * p1.y + h10 * m1y + h01 * p2.y + h11 * m2y,
        });
      }
    }
    out.push({ ...at(closed ? nSeg : pts.length - 1) });
    return out;
  }

  function rotatePt(p, origin, angle) {
    const c = Math.cos(angle), s = Math.sin(angle);
    const dx = p.x - origin.x, dy = p.y - origin.y;
    return { x: origin.x + dx * c - dy * s, y: origin.y + dx * s + dy * c };
  }

  function landmarkPathData(lm) {
    const verts = (lm.vertices || []).map(([x, y]) => ({ x, y }));
    if (lm.type === "spline" || lm.type === "gradient") return cardinalSample(verts, lm.tension ?? 0, 20, false);
    if (lm.type === "shape") return cardinalSample(verts, lm.tension ?? 0, 20, true);
    return verts;
  }

  function maxBufferWidth() {
    const [xMin, xMax] = model.get("x_bounds");
    const [yMin, yMax] = model.get("y_bounds");
    return 0.25 * Math.min(Math.abs(xMax - xMin), Math.abs(yMax - yMin));
  }

  function maxNeighborhoodK() {
    return Math.max(1, model.get("neighbor_k_max") || 64);
  }

  function maxNeighborhoodRadius() {
    const t = Number(model.get("neighbor_radius_max") || 0);
    return t > 0 ? t : maxBufferWidth();
  }

  /**
   * Buffer polygon for a landmark, by type:
   * - point: disk of radius buffer_width (`{x,y}[]`).
   * - line/spline: round join/cap buffer along the (possibly
   *   tension-sampled) path, matching Shapely
   *   `buffer(distance, join_style="round", cap_style="round")` (`{x,y}[]`).
   * - shape: Shapely-clean corridor (`{ outer, holes }[]`) via
   *   `shapeBufferCorridor` — dissolves fold-ins, collapses deep inward
   *   buffers to empty (never inverts through the boundary).
   */
  function bufferPolygonData(lm) {
    const width = Number(lm.buffer_width || 0);
    if (!(width > 0) || !BUFFERABLE.includes(lm.type)) return null;
    if (lm.type === "point") {
      const v = (lm.vertices || [])[0];
      if (!v) return null;
      return circlePolygon(v[0], v[1], width);
    }
    const points = landmarkPathData(lm);
    if (lm.type === "shape") {
      if (points.length < 3) return null;
      let side = lm.buffer_side || "both";
      if (side === "in") side = "left";
      else if (side === "out") side = "right";
      const polys = shapeBufferCorridor(points, width, side);
      return polys.length ? polys : null;
    }
    if (points.length < 2) return null;
    const side = lm.buffer_side || "both";
    return bufferPolylineRound(points, width, side);
  }

  /** Push buffer fill(s) into `polys` for PolygonLayer (handles shape holes). */
  function pushBufferPolys(polys, buffer, fill, line, width, pick) {
    if (!buffer) return;
    if (Array.isArray(buffer) && buffer[0] && buffer[0].outer) {
      for (const deckPoly of bufferPolysToDeck(buffer)) {
        polys.push({ polygon: deckPoly, fill, line, width, ...pick });
      }
      return;
    }
    polys.push({ polygon: asPath(buffer), fill, line, width, ...pick });
  }

  function cellLayerFocus() {
    const kind = model.get("selected_kind");
    const index = model.get("selected_index");
    if (kind === "type" || kind === "selection") return { kind, index };
    return null;
  }

  function landmarkFocus() {
    if (model.get("selected_kind") === "landmark") {
      return { kind: "landmark", index: model.get("selected_index") };
    }
    return null;
  }

  function neighborhoodFor(focus) {
    if (!focus) return null;
    return neighborhoodForArgs(
      focus.kind,
      focus.index,
      model.get("selections") || [],
      model.get("type_neighborhoods") || [],
      model.get("legend_labels") || [],
      model.get("active_category") || "",
    );
  }

  function activeNeighborhood() {
    return neighborhoodFor(cellLayerFocus());
  }

  function focusedLandmark() {
    const focus = landmarkFocus();
    if (!focus) return null;
    const landmarks = model.get("landmarks") || [];
    return focus.index >= 0 && focus.index < landmarks.length ? landmarks[focus.index] : null;
  }

  function updateActiveNeighborhood(patch) {
    const focus = cellLayerFocus();
    if (!focus) return;
    patchNeighborhood(
      model,
      focus.kind,
      focus.index,
      patch,
      model.get("selections") || [],
      model.get("type_neighborhoods") || [],
      model.get("legend_labels") || [],
      model.get("active_category") || "",
    );
    setDeckLayers();
  }

  function selectionMemberIndices(sel, pts) {
    if (sel?.hidden) return [];
    const raw = sel?.point_indices;
    if (Array.isArray(raw) && raw.length) {
      const n = pts.length;
      const out = [];
      for (let i = 0; i < raw.length; i++) {
        const idx = Number(raw[i]);
        if (Number.isInteger(idx) && idx >= 0 && idx < n) out.push(idx);
      }
      return out;
    }
    const poly = selectionPolygonData(sel || {});
    if (poly.length < 3) return [];
    const out = [];
    for (let i = 0; i < pts.length; i++) {
      if (pointInRing(pts[i], poly)) out.push(i);
    }
    return out;
  }

  /** Commit a drawn region as indices-only (no durable geometry). */
  function commitPointSelection(tempGeom) {
    const pts = getPointsData();
    const indices = selectionMemberIndices(
      { ...tempGeom, point_indices: undefined, hidden: false },
      pts,
    );
    if (!indices.length) return false;
    const selections = [...(model.get("selections") || [])];
    selections.push(
      withHood({
        id: selectionName(indices, "selection", selections),
        type: "points",
        point_indices: indices,
      }),
    );
    model.set("selections", selections);
    model.set("selected_kind", "selection");
    model.set("selected_index", selections.length - 1);
    resetToSelectMode();
    model.save_changes();
    return true;
  }

  function seedIndicesFor(focus) {
    const pts = getPointsData();
    if (!focus) return [];
    if (focus.kind === "type") {
      const typeIx = typeFocusIndices(model);
      const codes =
        typeIx.length > 0 ? typeIx : focus.index >= 0 ? [focus.index] : [];
      if (!codes.length) return [];
      const want = new Set(codes);
      return pts.reduce((acc, _p, i) => {
        if (want.has(categoryCodeAt(i))) acc.push(i);
        return acc;
      }, []);
    }
    if (focus.kind === "selection") {
      const sel = (model.get("selections") || [])[focus.index];
      return selectionMemberIndices(sel || {}, pts);
    }
    return [];
  }

  /** Client-side promote: freeze seed∪neighbors into a points selection. */
  function promoteNeighborhoodClient() {
    const focus = cellLayerFocus();
    if (!focus) return;
    const hood = neighborhoodFor(focus);
    if (!hood || hood.neighborhood === "off") return;
    const pts = getPointsData();
    const seeds = seedIndicesFor(focus);
    if (!seeds.length) return;
    if (!spatialIndex) refreshSpatialIndex();
    const k = Math.min(Number(hood.neighborhood_k) || 12, maxNeighborhoodK());
    let r = Number(hood.neighborhood_radius) || 0;
    const rMax = maxNeighborhoodRadius();
    if (rMax > 0) r = Math.min(r, rMax);
    const result = queryNeighbors(spatialIndex, pts, seeds, {
      mode: hood.neighborhood,
      k,
      radius: r,
      edges: false,
    });
    const seen = new Set(seeds);
    for (const j of result.neighbors) seen.add(j);
    const point_indices = Array.from(seen).sort((a, b) => a - b);
    if (!point_indices.length) return;
    const selections = [...(model.get("selections") || [])];
    let label;
    if (focus.kind === "type") {
      const labels = model.get("legend_labels") || [];
      const typeIx = typeFocusIndices(model);
      const names = (typeIx.length ? typeIx : [focus.index])
        .map((ti) => String(labels[ti] || ""))
        .filter(Boolean);
      label = names.length > 1 ? names.join("+") : names[0] || "type";
    } else {
      label = String(selections[focus.index]?.id || "selection");
    }
    selections.push(
      withHood({
        id: selectionName(point_indices, "selection", selections),
        type: "points",
        point_indices,
        neighborhood: "off",
        label: `neighborhood:${label}`,
      }),
    );
    model.set("selections", selections);
    model.set("selected_kind", "selection");
    model.set("selected_index", selections.length - 1);
    model.save_changes();
    setDeckLayers();
  }

  /** Client-side promote: points inside the focused landmark's buffer → selection. */
  function promoteBufferClient() {
    const focus = landmarkFocus();
    if (!focus) return;
    const landmarks = model.get("landmarks") || [];
    const lm = landmarks[focus.index];
    if (!lm) return;
    const width = Number(lm.buffer_width || 0);
    if (!(width > 0)) return;
    const pts = getPointsData();
    const point_indices = [];
    if (lm.type === "point") {
      const v = (lm.vertices || [])[0];
      if (!v) return;
      const r2 = width * width;
      for (let i = 0; i < pts.length; i++) {
        const dx = pts[i].x - v[0];
        const dy = pts[i].y - v[1];
        if (dx * dx + dy * dy <= r2) point_indices.push(i);
      }
    } else {
      const poly = bufferPolygonData(lm);
      if (!poly) return;
      if (Array.isArray(poly) && poly[0] && poly[0].outer) {
        for (let i = 0; i < pts.length; i++) {
          if (pointInBufferPolys(pts[i], poly)) point_indices.push(i);
        }
      } else if (poly.length >= 3) {
        const ring = poly.map((p) => [p.x, p.y]);
        for (let i = 0; i < pts.length; i++) {
          if (pointInRing(pts[i], ring)) point_indices.push(i);
        }
      }
    }
    if (!point_indices.length) return;
    pushLandmarkUndo();
    const selections = [...(model.get("selections") || [])];
    selections.push(
      withHood({
        id: selectionName(point_indices, "selection", selections),
        type: "points",
        point_indices,
        neighborhood: "off",
        label: `buffer:${String(lm.id || "landmark")}`,
      }),
    );
    model.set("selections", selections);
    // The buffer has been promoted to a selection; reset it so the source
    // landmark's corridor doesn't linger as a duplicate visual.
    setLandmarks(
      model,
      landmarks.map((item, i) => (i === focus.index ? { ...item, buffer_width: 0 } : item)),
    );
    model.set("selected_kind", "selection");
    model.set("selected_index", selections.length - 1);
    model.save_changes();
    setDeckLayers();
  }

  /**
   * Remap a baked distance field to the visible soft-gradient canvas for current r.
   * O(texture) — no per-seed restamp. Min-distance + monotonic falloff ≡ max-blend
   * of per-seed kernels. Peak alpha clamped so unions do not overwhelm.
   */
  function remapRadiusGradientFromDist(bake, radius) {
    if (!bake || !(radius > 0)) return null;
    const { dist, w, h, bounds, seedCount, textureSize, rMax } = bake;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const img = ctx.createImageData(w, h);
    const data = img.data;
    const [cr, cg, cb] = hexToRgbaBytes(NEIGH_GRADIENT_COLOR, 1);
    const peak = Math.round(255 * NEIGH_GRADIENT_PEAK_ALPHA);
    const r = Math.min(radius, rMax);
    for (let i = 0; i < dist.length; i++) {
      const d = dist[i];
      if (!(d < r)) continue;
      // Soft smoothstep falloff in world units relative to current r.
      const t = 1 - d / r;
      const a = t * t * (3 - 2 * t);
      const o = i * 4;
      data[o] = cr;
      data[o + 1] = cg;
      data[o + 2] = cb;
      data[o + 3] = Math.min(255, Math.round(a * peak));
    }
    ctx.putImageData(img, 0, 0);
    return {
      image: canvas,
      bounds,
      seedCount,
      textureSize,
      radius: r,
      bakeRMax: rMax,
    };
  }

  /** Bake at r_max on seed/r_max change; remap only when current r changes. */
  function ensureRadiusGradient(pts, seeds, radius, rMax) {
    if (!seeds.length || !(radius > 0) || !(rMax > 0)) {
      hoodRadiusBake = null;
      hoodRadiusGradient = null;
      return;
    }
    const bakeKey = `${rMax.toFixed(5)}:${hashSeedIndices(seeds)}:${seeds.length}`;
    if (!hoodRadiusBake || hoodRadiusBake.key !== bakeKey) {
      const baked = bakeRadiusDistanceField(pts, seeds, rMax);
      hoodRadiusBake = baked ? { ...baked, key: bakeKey } : null;
    }
    if (!hoodRadiusBake) {
      hoodRadiusGradient = null;
      return;
    }
    const r = Math.min(radius, rMax);
    const viewKey = `${bakeKey}:${r.toFixed(5)}`;
    if (!hoodRadiusGradient || hoodRadiusGradient.key !== viewKey) {
      const remapped = remapRadiusGradientFromDist(hoodRadiusBake, r);
      hoodRadiusGradient = remapped ? { ...remapped, key: viewKey } : null;
    }
  }

  function prepareFocusGeom() {
    const pts = getPointsData();
    const focus = cellLayerFocus();
    if (!focus) {
      focusGeomCache = { key: "", pointRoles: null, hoodEdges: [], knnEdgeLinesDrawn: false };
      pointRoles = null;
      pointRoleMode = false;
      hoodEdges = [];
      hoodKnnEdgeLinesDrawn = false;
      hoodRadiusBake = null;
      hoodRadiusGradient = null;
      syncScatterRoleAttributes();
      return;
    }
    const seeds = seedIndicesFor(focus);
    if (!seeds.length) {
      focusGeomCache = { key: "", pointRoles: null, hoodEdges: [], knnEdgeLinesDrawn: false };
      pointRoles = null;
      pointRoleMode = false;
      hoodEdges = [];
      hoodKnnEdgeLinesDrawn = false;
      hoodRadiusBake = null;
      hoodRadiusGradient = null;
      syncScatterRoleAttributes();
      return;
    }
    const hood = neighborhoodFor(focus);
    if (!hood || hood.neighborhood === "off") {
      // Hide neighborhood chrome but keep focusGeomCache so hood off→on with the same
      // seeds reuses neighbor indices / edge geometry instead of rebuilding PathLayer data.
      pointRoles = null;
      pointRoleMode = false;
      hoodEdges = [];
      hoodKnnEdgeLinesDrawn = false;
      hoodRadiusBake = null;
      hoodRadiusGradient = null;
      syncScatterRoleAttributes();
      return;
    }
    const k = Math.min(Number(hood.neighborhood_k) || 12, maxNeighborhoodK());
    let r = Number(hood.neighborhood_radius) || 0;
    const rMax = maxNeighborhoodRadius();
    if (rMax > 0) r = Math.min(r, rMax);
    const pointsKey = pointsCache.key || `${pts.length}`;
    const typeIx = focus.kind === "type" ? typeFocusIndices(model) : [];
    const focusIndexKey =
      focus.kind === "type"
        ? hashSeedIndices(typeIx.length ? typeIx : [focus.index])
        : focus.index;
    const cacheKey = neighborGeomCacheKey({
      pointsKey,
      focusKind: focus.kind,
      focusIndex: focusIndexKey,
      hoodMode: hood.neighborhood,
      hoodK: k,
      hoodRadius: r,
      seedCount: seeds.length,
      seedHash: hashSeedIndices(seeds),
    });
    if (focusGeomCache.key === cacheKey && focusGeomCache.pointRoles) {
      pointRoles = focusGeomCache.pointRoles;
      pointRoleMode = true;
      hoodEdges = focusGeomCache.hoodEdges;
      hoodKnnEdgeLinesDrawn = focusGeomCache.knnEdgeLinesDrawn;
      if (hood.neighborhood === "radius" && r > 0 && rMax > 0) {
        ensureRadiusGradient(pts, seeds, r, rMax);
      }
      const tSync = performance.now();
      syncScatterRoleAttributes();
      lastDeckBuildProfile.roleScatterSyncMs = performance.now() - tSync;
      return;
    }

    const tRoles = performance.now();
    pointRoles = new Uint8Array(pts.length);
    pointRoleMode = true;
    hoodEdges = [];
    hoodKnnEdgeLinesDrawn = false;
    for (const i of seeds) pointRoles[i] = SEED_ROLE;
    lastDeckBuildProfile.roleAllocMs = performance.now() - tRoles;

    if (hood.neighborhood === "radius" || hood.neighborhood === "knn") {
      const tIndex = performance.now();
      ensureSpatialIndexForQuery();
      lastDeckBuildProfile.spatialEnsureMs = performance.now() - tIndex;
      const predictedEdges =
        hood.neighborhood === "knn" ? (seeds.length | 0) * (k | 0) : 0;
      const wantEdges =
        hood.neighborhood === "knn" &&
        (benchForceKnnEdges ||
          shouldDrawKnnEdgeLines(pts.length, seeds.length, predictedEdges));
      const tQuery = performance.now();
      const result = lookupGraphNeighbors(null, pts, seeds, {
        mode: hood.neighborhood,
        k,
        radius: r,
        edges: wantEdges,
      });
      lastDeckBuildProfile.neighborQueryMs = performance.now() - tQuery;
      hoodEdges = wantEdges ? result.edges : [];
      hoodKnnEdgeLinesDrawn = wantEdges && hoodEdges.length > 0;
      for (const i of result.neighbors) {
        if (pointRoles[i] !== SEED_ROLE) pointRoles[i] = NEIGH_ROLE;
      }
      if (hood.neighborhood === "radius" && r > 0 && rMax > 0) {
        ensureRadiusGradient(pts, seeds, r, rMax);
      } else {
        hoodRadiusBake = null;
        hoodRadiusGradient = null;
      }
    } else {
      hoodRadiusBake = null;
      hoodRadiusGradient = null;
    }

    focusGeomCache = {
      key: cacheKey,
      pointRoles,
      hoodEdges,
      knnEdgeLinesDrawn: hoodKnnEdgeLinesDrawn,
    };
    const tSync = performance.now();
    syncScatterRoleAttributes();
    lastDeckBuildProfile.roleScatterSyncMs = performance.now() - tSync;
  }

  function updateSelectedLandmark(patch) {
    const focus = landmarkFocus();
    if (!focus) return;
    patchLandmark(model, focus.index, patch, model.get("landmarks") || []);
    setDeckLayers();
  }

  function findHit(pt, radius = 8) {
    if (!deckgl?.isInitialized || !pt) return null;
    const stack =
      deckgl.pickObjects({ x: pt.px, y: pt.py, radius, depth: 12 }) || [];
    const objs = stack.map((s) => s.object).filter(Boolean);
    const landmark = objs.find((o) => o.kind === "landmark");
    if (landmark) return { kind: "landmark", index: landmark.index };
    const obj = objs[0];
    if (!obj?.kind) return null;
    return { kind: obj.kind, index: obj.index };
  }

  function resetNeighborhoodsOff() {
    const selections = (model.get("selections") || []).map((s) => ({
      ...s,
      neighborhood: "off",
    }));
    const types = (model.get("type_neighborhoods") || []).map((t) => ({
      ...t,
      neighborhood: "off",
    }));
    model.set("selections", selections);
    model.set("type_neighborhoods", types);
    model.save_changes();
  }

  function setSelected(kind, index) {
    if (!kind || index < 0) {
      resetNeighborhoodsOff();
      setSelectedTrait(model, "", -1);
      setDeckLayers();
      return;
    }
    setSelectedTrait(model, kind, index);
    setDeckLayers();
  }

  function updateUI() {
    updatePointLegend();
  }

  function resetToSelectMode() {
    if ((model.get("mode") || "select") === "select") return;
    model.set("mode", "select");
  }

  function finishVertexDraft() {
    const vertexModes = ["polygon", "line", "spline", "shape"];
    if (!vertexModes.includes(currentMode)) return;
    const minVerts = currentMode === "line" || currentMode === "spline" ? 2 : 3;
    if (draft.length < minVerts) {
      draft = [];
      draftCursor = null;
      lineStrokeActive = false;
      setDeckLayers();
      return;
    }
    if (currentMode === "polygon") {
      commitPointSelection({
        type: "polygon",
        vertices: draft.map((p) => [p.x, p.y]),
      });
      draft = [];
      draftCursor = null;
      lineStrokeActive = false;
      updateUI();
      setDeckLayers();
      return;
    }
    const landmarks = [...(model.get("landmarks") || [])];
    const item = {
      id: nextLandmarkId(landmarks),
      type: currentMode,
      vertices: draft.map((p) => [p.x, p.y]),
      line_style: "solid",
      color: COLORS[landmarks.length % COLORS.length],
    };
    if (TENSION_TYPES.includes(currentMode)) {
      item.tension = DEFAULT_TENSION;
    }
    if (BUFFERABLE.includes(currentMode)) {
      item.buffer_width = model.get("default_buffer_width") ?? 0;
      item.buffer_side = DEFAULT_BUFFER_SIDE;
    }
    landmarks.push(item);
    draft = [];
    draftCursor = null;
    lineStrokeActive = false;
    setLandmarks(model, landmarks);
    model.set("selected_kind", "landmark");
    model.set("selected_index", landmarks.length - 1);
    resetToSelectMode();
    model.save_changes();
    updateUI();
    setDeckLayers();
  }

  function pixelDeltaToData(dx, dy) {
    if (deckgl?.isInitialized) {
      const viewport = deckgl.getViewports()[0];
      if (viewport) {
        const origin = viewport.unproject([0, 0]);
        const moved = viewport.unproject([dx, dy]);
        return { dx: moved[0] - origin[0], dy: moved[1] - origin[1] };
      }
    }
    return { dx: 0, dy: 0 };
  }

  function moveItem(kind, index, pixelDx, pixelDy, { persist = true } = {}) {
    const { dx, dy } = pixelDeltaToData(pixelDx, pixelDy);
    if (kind === "landmark") {
      const landmarks = model.get("landmarks") || [];
      model.set(
        "landmarks",
        landmarks.map((item, i) =>
          i !== index
            ? item
            : { ...item, vertices: (item.vertices || []).map(([x, y]) => [x + dx, y + dy]) }
        )
      );
    } else {
      const selections = model.get("selections") || [];
      model.set(
        "selections",
        selections.map((item, i) => {
          if (i !== index) return item;
          if (item.vertices) {
            return { ...item, vertices: item.vertices.map(([x, y]) => [x + dx, y + dy]) };
          }
          if (item.cx != null && item.cy != null) {
            return { ...item, cx: item.cx + dx, cy: item.cy + dy };
          }
          // Indices-only selections have no spatial handle to drag.
          return item;
        })
      );
    }
    if (persist) model.save_changes();
    setDeckLayers();
  }

  /** Nudge the selected landmark (or its active vertex) by ~4px via arrow keys. */
  function nudgeSelectedLandmark(key) {
    const focus = landmarkFocus();
    if (!focus) return false;
    const landmarks = model.get("landmarks") || [];
    const lm = landmarks[focus.index];
    if (!lm) return false;
    const step = 4;
    let pdx = 0;
    let pdy = 0;
    if (key === "ArrowUp") pdy = -step;
    else if (key === "ArrowDown") pdy = step;
    else if (key === "ArrowLeft") pdx = -step;
    else if (key === "ArrowRight") pdx = step;
    else return false;
    const { dx, dy } = pixelDeltaToData(pdx, pdy);
    pushLandmarkUndo();
    if (activeVertexIndex >= 0 && Array.isArray(lm.vertices) && activeVertexIndex < lm.vertices.length) {
      const verts = lm.vertices.slice();
      const [vx, vy] = verts[activeVertexIndex];
      verts[activeVertexIndex] = [vx + dx, vy + dy];
      setLandmarks(model, landmarks.map((item, i) => (i === focus.index ? { ...item, vertices: verts } : item)));
    } else {
      setLandmarks(
        model,
        landmarks.map((item, i) =>
          i !== focus.index
            ? item
            : { ...item, vertices: (item.vertices || []).map(([x, y]) => [x + dx, y + dy]) },
        ),
      );
    }
    model.save_changes();
    setDeckLayers();
    return true;
  }

  function hitTestVertex(pt) {
    const focus = landmarkFocus();
    if (!focus) return null;
    const landmarks = model.get("landmarks") || [];
    const lm = focus.index >= 0 && focus.index < landmarks.length ? landmarks[focus.index] : null;
    if (!lm || !lm.vertices) return null;
    const viewport = deckgl?.isInitialized ? deckgl.getViewports()[0] : null;
    for (let i = 0; i < lm.vertices.length; i++) {
      const v = lm.vertices[i];
      if (viewport) {
        const [sx, sy] = viewport.project([v[0], v[1]]);
        if (Math.hypot(pt.px - sx, pt.py - sy) <= 10) {
          return { index: i, landmarkIdx: focus.index };
        }
      } else {
        const dx = pt.x - v[0];
        const dy = pt.y - v[1];
        if (Math.hypot(dx, dy) < 6) return { index: i, landmarkIdx: focus.index };
      }
    }
    return null;
  }

  function startVertexDrag(vertexIndex, landmarkIndex) {
    // Track vertex drag state
    vertexDragIndex = vertexIndex;
    vertexDragLandmarkIndex = landmarkIndex;
  }

  /** Snapshot `landmarks` before a destructive geometry edit, for Mod+Z. */
  function pushLandmarkUndo() {
    landmarkUndoStack.push(cloneJson(model.get("landmarks") || []));
    if (landmarkUndoStack.length > LANDMARK_UNDO_MAX) landmarkUndoStack.shift();
  }

  function undoLandmarkEdit() {
    if (!landmarkUndoStack.length) return false;
    const prev = landmarkUndoStack.pop();
    setLandmarks(model, prev);
    model.save_changes();
    setDeckLayers();
    return true;
  }

  /**
   * Nearest-edge insertion point of the focused landmark, within ~10px
   * screen distance of `pt`. Unlike a fixed midpoint, this tracks the
   * cursor continuously along the segment (hover-ghost insert).
   *
   * - "line": projects onto the straight control-vertex segments directly;
   *   `afterIndex` is the control vertex to insert after.
   * - "spline"/"shape": projects onto the *densified* rendered curve/ring
   *   (`landmarkPathData(lm)` — the same points `cardinalSample` produces
   *   with `nPerSeg` samples per control-vertex segment), so the ghost sits
   *   on the actual curve rather than a straight chord between control
   *   vertices. The densified sample index is mapped back to the
   *   control-vertex segment it belongs to (`floor(sampleIndex / nPerSeg)`)
   *   to derive `afterIndex`.
   */
  function hitTestNearestEdge(pt) {
    const focus = landmarkFocus();
    if (!focus) return null;
    const landmarks = model.get("landmarks") || [];
    const lm = focus.index >= 0 && focus.index < landmarks.length ? landmarks[focus.index] : null;
    if (!lm || !NODE_EDITABLE.includes(lm.type)) return null;
    const verts = lm.vertices || [];
    const n = verts.length;
    if (n < 2) return null;
    const viewport = deckgl?.isInitialized ? deckgl.getViewports()[0] : null;
    const threshold = viewport ? 10 : 6;

    function evalSeg(ax, ay, bx, by) {
      if (viewport) {
        const [px, py] = viewport.project([ax, ay]);
        const [qx, qy] = viewport.project([bx, by]);
        const r = distPointToSeg(pt.px, pt.py, px, py, qx, qy);
        const [wx, wy] = viewport.unproject([r.qx, r.qy]);
        return { dist: r.dist, x: wx, y: wy };
      }
      const r = distPointToSeg(pt.x, pt.y, ax, ay, bx, by);
      return { dist: r.dist, x: r.qx, y: r.qy };
    }

    let best = null;
    if (lm.type === "line") {
      for (let i = 0; i < n - 1; i++) {
        const a = verts[i];
        const b = verts[i + 1];
        const r = evalSeg(a[0], a[1], b[0], b[1]);
        if (r.dist <= threshold && (!best || r.dist < best.dist)) {
          best = { dist: r.dist, afterIndex: i + 1, x: r.x, y: r.y };
        }
      }
    } else {
      // spline / shape: densify via the same nPerSeg used by cardinalSample
      // (through landmarkPathData) and map the hit sample back to the
      // control-vertex segment it was generated from.
      const nPerSeg = 20;
      const closed = lm.type === "shape";
      const segCount = closed ? n : n - 1;
      const dense = landmarkPathData(lm);
      if (!dense || dense.length < 2) return null;
      for (let k = 0; k < dense.length - 1; k++) {
        const a = dense[k];
        const b = dense[k + 1];
        const r = evalSeg(a.x, a.y, b.x, b.y);
        if (r.dist <= threshold && (!best || r.dist < best.dist)) {
          const segIdx = Math.min(segCount - 1, Math.floor(k / nPerSeg));
          best = { dist: r.dist, afterIndex: segIdx + 1, x: r.x, y: r.y };
        }
      }
    }
    if (!best) return null;
    return { landmarkIdx: focus.index, afterIndex: best.afterIndex, x: best.x, y: best.y };
  }

  function handleMouseDown(event) {
    if (panActive()) return;
    if (currentMode === "inspect") {
      if (event.button !== 0) return;
      event.preventDefault();
      webglCanvas.focus();
      const pt = eventPoint(event);
      if (!pt) return;
      // A press places the live window under the pointer and drags it; saved
      // inspect Selections are snapshots and never move (Save adds one).
      beginInspectGesture();
      setVolumeWindow(pt.x, pt.y, inspectWindowUm, true);
      emitInspect({ type: "place", x: pt.x, y: pt.y });
      return;
    }
    // Right/middle clicks must not preventDefault — that blocks contextmenu.
    if (event.button !== 0) return;
    // Select: landmark pick / whole-landmark drag only (no vertex hit-test).
    if (currentMode === "select") {
      event.preventDefault();
      webglCanvas.focus();
      const pt = eventPoint(event);
      if (!pt) return;
      didDrag = false;
      const hit = findHit(pt);
      if (hit?.kind === "landmark") {
        setSelected("landmark", hit.index);
        activeVertexIndex = -1;
        isDragging = true;
        dragStart = pt;
        dragKind = "landmark";
        dragIndex = hit.index;
        webglCanvas.style.cursor = "grabbing";
        return;
      }
      activeVertexIndex = -1;
      return;
    }
    // Node: vertex select/drag + optional edge insert; no whole-landmark drag.
    if (currentMode === "node") {
      event.preventDefault();
      webglCanvas.focus();
      const pt = eventPoint(event);
      if (!pt) return;
      didDrag = false;
      const focus = landmarkFocus();
      if (focus) {
        const landmarks = model.get("landmarks") || [];
        const focusedLm = landmarks[focus.index];
        if (focusedLm && NODE_EDITABLE.includes(focusedLm.type)) {
          const vertexHit = hitTestVertex(pt);
          if (vertexHit) {
            activeVertexIndex = vertexHit.index;
            startVertexDrag(vertexHit.index, vertexHit.landmarkIdx);
            setDeckLayers();
            return;
          }
          if (
            nodeInsertArmed &&
            hoverInsert &&
            hoverInsert.landmarkIdx === focus.index
          ) {
            pushLandmarkUndo();
            insertLandmarkVertex(
              model,
              hoverInsert.landmarkIdx,
              landmarks,
              hoverInsert.afterIndex,
              [hoverInsert.x, hoverInsert.y],
            );
            activeVertexIndex = hoverInsert.afterIndex;
            hoverInsert = null;
            suppressClick = true;
            setDeckLayers();
            return;
          }
        }
      }
      // Clicking another landmark focuses it for node editing.
      const hit = findHit(pt);
      if (hit?.kind === "landmark") {
        setSelected("landmark", hit.index);
        activeVertexIndex = -1;
        hoverInsert = null;
        hoverVertexIndex = -1;
        setDeckLayers();
      }
      return;
    }
    event.preventDefault();
    webglCanvas.focus();
    const pt = eventPoint(event);
    if (!pt) return;
    didDrag = false;

    const hit = findHit(pt);

    if (currentMode === "lasso") {
      if (hit && hit.kind === "selection" && hit.kind === model.get("selected_kind") && hit.index === model.get("selected_index")) {
        isDragging = true; dragStart = pt; dragKind = hit.kind; dragIndex = hit.index;
        return;
      }
      // Selection mode: no inspect-pin; only activate existing selection regions.
      if (hit?.kind === "selection") { setSelected(hit.kind, hit.index); suppressClick = true; return; }
      isLassoing = true; lassoPath = [pt]; setDeckLayers(); return;
    }

    if (currentMode === "rectangle" || currentMode === "ellipse") {
      if (hit && hit.kind === "selection" && hit.kind === model.get("selected_kind") && hit.index === model.get("selected_index")) {
        isDragging = true; dragStart = pt; dragKind = hit.kind; dragIndex = hit.index;
        return;
      }
      if (hit?.kind === "selection") { setSelected(hit.kind, hit.index); suppressClick = true; return; }
      isBoxing = true; boxStart = pt; boxCurrent = pt; setDeckLayers(); return;
    }

    if (draft.length === 0) {
      const kind = model.get("selected_kind");
      const selectedIdx = model.get("selected_index");
      if (hit && hit.kind === kind && hit.index === selectedIdx) {
        isDragging = true; dragStart = pt; dragKind = hit.kind; dragIndex = hit.index;
        webglCanvas.style.cursor = "grabbing";
        return;
      }
      if (hit) { setSelected(hit.kind, hit.index); suppressClick = true; return; }
      if (selectedIdx >= 0) setSelected("", -1);
    }

    const vertexHit = hitTestVertex(pt);
    if (
      vertexHit &&
      currentMode !== "select" &&
      currentMode !== "node" &&
      currentMode !== "move" &&
      currentMode !== "probe"
    ) {
      startVertexDrag(vertexHit.index, vertexHit.landmarkIdx);
      activeVertexIndex = vertexHit.index;
      return;
    }

    // Line: mousedown places start; rubber-band until mouseup (or click-then-click).
    // Spline/shape/polygon: click-to-add only (no drag stroke). Point: mouseup only.
    if (currentMode === "line" && draft.length === 0 && !hit) {
      draft = [pt];
      draftCursor = pt;
      lineStrokeActive = true;
      setDeckLayers();
    }
  }

  function handleMouseMove(event) {
    if (spacePan) return;
    const pt = eventPoint(event);
    if (!pt) return;
    if (isDragging && dragStart && dragIndex >= 0) {
      const dx = pt.px - dragStart.px;
      const dy = pt.py - dragStart.py;
      if (dx || dy) didDrag = true;
      moveItem(dragKind, dragIndex, dx, dy, {
        persist: currentMode !== "select",
      });
      dragStart = pt;
      return;
    }
    if (isLassoing) { lassoPath.push(pt); setDeckLayers(); return; }
    if (isBoxing) { boxCurrent = pt; setDeckLayers(); return; }

    if (currentMode === "inspect") {
      webglCanvas.style.cursor = "crosshair";
      // A press's drag is handled on `window` (handleInspectDrag).
      if (event.buttons === 0) {
        volumeHover = pt;
        setDeckLayers();
        emitInspectHover();
      }
      return;
    }

    if (probeModeOn()) {
      scrubProbeAtWorld(pt.x, pt.y);
      webglCanvas.style.cursor = "crosshair";
      return;
    }

    // Draft / landmark hover tips: Deck getTooltip (deckTooltip).

    if (vertexDragIndex >= 0 && vertexDragLandmarkIndex >= 0) {
      const landmarks = [...(model.get("landmarks") || [])];
      const lm = landmarks[vertexDragLandmarkIndex];
      if (lm && lm.vertices && vertexDragIndex < lm.vertices.length) {
        const vertices = lm.vertices.slice();
        vertices[vertexDragIndex] = [pt.x, pt.y];
        landmarks[vertexDragLandmarkIndex] = { ...lm, vertices };
        setLandmarks(model, landmarks);
        setDeckLayers();
      }
      return;
    }

    // Node hover ghosts: node mode + a node-editable landmark focused.
    if (currentMode === "node") {
      const focus = landmarkFocus();
      const landmarks = focus ? model.get("landmarks") || [] : [];
      const focusedLm = focus ? landmarks[focus.index] : null;
      if (focusedLm && NODE_EDITABLE.includes(focusedLm.type)) {
        const vertexHit = hitTestVertex(pt);
        if (vertexHit) {
          if (hoverVertexIndex !== vertexHit.index || hoverInsert) {
            hoverVertexIndex = vertexHit.index;
            hoverInsert = null;
            webglCanvas.style.cursor = "grab";
            setDeckLayers();
          }
        } else if (nodeInsertArmed) {
          const edgeHit = hitTestNearestEdge(pt);
          if (edgeHit) {
            hoverVertexIndex = -1;
            hoverInsert = edgeHit;
            webglCanvas.style.cursor = "copy";
            setDeckLayers();
          } else if (hoverVertexIndex >= 0 || hoverInsert) {
            hoverVertexIndex = -1;
            hoverInsert = null;
            webglCanvas.style.cursor = "default";
            setDeckLayers();
          }
        } else if (hoverVertexIndex >= 0 || hoverInsert) {
          hoverVertexIndex = -1;
          hoverInsert = null;
          webglCanvas.style.cursor = "default";
          setDeckLayers();
        }
      } else if (hoverVertexIndex >= 0 || hoverInsert) {
        hoverVertexIndex = -1;
        hoverInsert = null;
        setDeckLayers();
      }
    } else if (hoverVertexIndex >= 0 || hoverInsert) {
      hoverVertexIndex = -1;
      hoverInsert = null;
    }

    // Rubber-band draft preview from last vertex → cursor (line/spline/shape/polygon).
    if (
      draft.length > 0 &&
      ["line", "spline", "shape", "polygon"].includes(currentMode)
    ) {
      draftCursor = pt;
      setDeckLayers();
    }
  }

  function handleMouseUp(event) {
    if (spacePan) return;
    // An Inspect release is handled on `window` (handleInspectRelease).
    const vertexDragActive = vertexDragIndex >= 0 || vertexDragLandmarkIndex >= 0;
    if ((currentMode === "select" || currentMode === "node" || currentMode === "move" || currentMode === "probe" || currentMode === "inspect") && !isDragging && !vertexDragActive) return;
    const pt = eventPoint(event);
    if (isDragging && currentMode === "select") {
      isDragging = false;
      dragStart = null;
      dragKind = "";
      dragIndex = -1;
      webglCanvas.style.cursor = "default";
      if (didDrag) {
        model.save_changes();
        suppressClick = true;
        didDrag = false;
      }
      return;
    }
    if (isLassoing) {
      isLassoing = false;
      if (lassoPath.length >= 3) {
        commitPointSelection({
          type: "lasso",
          vertices: lassoPath.map((p) => [p.x, p.y]),
        });
      }
      lassoPath = []; updateUI(); setDeckLayers(); return;
    }
    if (isBoxing) {
      isBoxing = false;
      if (boxStart && boxCurrent) {
        const a = boxStart;
        const b = boxCurrent;
        const cx = (a.x + b.x) / 2;
        const cy = (a.y + b.y) / 2;
        const width = Math.abs(b.x - a.x);
        const height = Math.abs(b.y - a.y);
        if (width > 1e-6 && height > 1e-6) {
          if (currentMode === "rectangle") {
            commitPointSelection({
              type: "rectangle",
              cx,
              cy,
              width,
              height,
              angle: 0,
            });
          } else {
            commitPointSelection({
              type: "ellipse",
              cx,
              cy,
              rx: width / 2,
              ry: height / 2,
              angle: 0,
            });
          }
        }
      }
      boxStart = null; boxCurrent = null; updateUI(); setDeckLayers(); return;
    }
    if (vertexDragIndex >= 0 || vertexDragLandmarkIndex >= 0) {
      vertexDragIndex = -1;
      vertexDragLandmarkIndex = -1;
      model.save_changes();
      return;
    }
    if (isDragging) {
      isDragging = false; dragStart = null; dragKind = ""; dragIndex = -1;
      webglCanvas.style.cursor = "crosshair";
      if (didDrag) { suppressClick = true; didDrag = false; return; }
    }
    if (suppressClick) { suppressClick = false; return; }
    if (!pt) return;
    // Geometry modes: lasso/rect/ellipse finish above; polygon vertices below.
    if (currentMode === "select" || currentMode === "node" || currentMode === "move" || currentMode === "probe") return;
    if (isGeometryMode(currentMode) && currentMode !== "polygon") return;

    // Point: place at mouseup position (not mousedown).
    if (currentMode === "point") {
      const landmarks = [...(model.get("landmarks") || [])];
      const item = {
        id: nextLandmarkId(landmarks),
        type: "point",
        vertices: [[pt.x, pt.y]],
        line_style: "solid",
        color: COLORS[landmarks.length % COLORS.length],
      };
      if (BUFFERABLE.includes("point")) {
        item.buffer_width = model.get("default_buffer_width") ?? 0;
        item.buffer_side = DEFAULT_BUFFER_SIDE;
      }
      landmarks.push(item);
      setLandmarks(model, landmarks);
      model.set("selected_kind", "landmark");
      model.set("selected_index", landmarks.length - 1);
      resetToSelectMode();
      model.save_changes(); updateUI(); setDeckLayers(); return;
    }

    // Line: mousedown=start; mouseup=end with rubber-band. Near-zero drag → wait for 2nd click.
    if (currentMode === "line") {
      if (lineStrokeActive) {
        lineStrokeActive = false;
        const start = draft[0];
        if (!start) {
          draft = [];
          draftCursor = null;
          setDeckLayers();
          return;
        }
        const dx = pt.px - start.px;
        const dy = pt.py - start.py;
        if (dx * dx + dy * dy > LINE_CLICK_PX2) {
          draft = [start, pt];
          draftCursor = null;
          finishVertexDraft();
        } else {
          // Click-like: keep first point only; second click sets the end.
          draftCursor = pt;
          setDeckLayers();
        }
        return;
      }
      if (draft.length === 1) {
        draft = [draft[0], pt];
        draftCursor = null;
        finishVertexDraft();
        return;
      }
      // Fallback: treat this click as the start if somehow empty.
      draft = [pt];
      draftCursor = pt;
      setDeckLayers();
      return;
    }

    // Spline / shape / polygon: click-to-add vertices only (no click-drag stroke).
    if (["spline", "shape", "polygon"].includes(currentMode)) {
      draft.push(pt);
      draftCursor = pt;
      setDeckLayers();
      return;
    }
  }

  function handleMouseLeave(event) {
    // Deck picking-canvas swaps fire mouseleave while the pointer is still
    // on the plot. Only drop hover when the pointer is actually outside.
    if (probeModeOn()) {
      // Synthetic picking-canvas leaves have relatedTarget=null and often
      // clientX/Y of 0,0 — those must not drop the hover field. Only clear
      // when the pointer actually entered another widget node.
      const into = event?.relatedTarget;
      const stillOnPlot =
        !into ||
        (into instanceof Node &&
          (host.contains(into) ||
            main.contains(into) ||
            plotStack.contains(into) ||
            container.contains(into)));
      if (!stillOnPlot) clearProbeHover();
    }
    if (clearInspectHover()) setDeckLayers();
    if (isDragging) { isDragging = false; dragStart = null; }
    if (vertexDragIndex >= 0 || vertexDragLandmarkIndex >= 0) {
      vertexDragIndex = -1;
      vertexDragLandmarkIndex = -1;
      model.save_changes();
    }
    if (lineStrokeActive) {
      // Keep first line vertex; end line-drag so a later click can finish.
      lineStrokeActive = false;
    }
    draftCursor = null;
    if (hoverVertexIndex >= 0 || hoverInsert) {
      hoverVertexIndex = -1;
      hoverInsert = null;
      setDeckLayers();
    }
    if (isLassoing) { isLassoing = false; lassoPath = []; setDeckLayers(); }
    if (isBoxing) { isBoxing = false; boxStart = null; boxCurrent = null; setDeckLayers(); }
    else if (draft.length) setDeckLayers();
  }
  function handleDblClick(e) {
    e.preventDefault();
    if (draft.length) draft.pop();
    finishVertexDraft();
  }

  function isTypingTarget(event) {
    const path =
      typeof event.composedPath === "function" ? event.composedPath() : null;
    const nodes = path && path.length ? path : [event.target];
    for (const node of nodes) {
      if (!node || !(node instanceof Element)) continue;
      const tag = node.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
      if (node.isContentEditable) return true;
      if (
        node.closest?.(
          'input, textarea, select, [contenteditable="true"], [role="textbox"], [role="combobox"], [role="searchbox"]',
        )
      ) {
        return true;
      }
    }
    return false;
  }

  /** True if the event comes from inside an open menu (focus moves into it). */
  function eventInMenu(event) {
    const path =
      typeof event.composedPath === "function" ? event.composedPath() : [event.target];
    return path.some((node) => node instanceof Element && node.getAttribute("role") === "menu");
  }

  /** True if the event originated under this widget (works across shadow DOM). */
  function eventInWidget(event) {
    const path =
      typeof event.composedPath === "function" ? event.composedPath() : null;
    if (path && path.length) {
      for (let i = 0; i < path.length; i++) {
        if (path[i] === container || path[i] === webglCanvas) return true;
      }
      return false;
    }
    const t = event.target;
    return t instanceof Node && (container.contains(t) || webglCanvas.contains(t));
  }

  function cloneJson(value) {
    try {
      return structuredClone(value);
    } catch {
      return JSON.parse(JSON.stringify(value));
    }
  }

  function switchMode(mode) {
    if (!modes.includes(mode)) return false;
    if ((model.get("mode") || "select") === mode) return true;
    setModeTrait(model, mode);
    return true;
  }

  function copySelectedToClipboard() {
    const kind = model.get("selected_kind") || "";
    const index = Number(model.get("selected_index"));
    if (kind === "landmark" && index >= 0) {
      const item = (model.get("landmarks") || [])[index];
      if (!item) return false;
      editClipboard = { kind: "landmark", item: cloneJson(item) };
      return true;
    }
    if (kind === "selection" && index >= 0) {
      const item = (model.get("selections") || [])[index];
      if (!item) return false;
      editClipboard = { kind: "selection", item: cloneJson(item) };
      return true;
    }
    return false;
  }

  function pasteFromClipboard() {
    if (!editClipboard?.item) return false;
    const [xMin, xMax] = model.get("x_bounds") || [0, 1];
    const [yMin, yMax] = model.get("y_bounds") || [0, 1];
    const span = Math.max(
      Math.abs(xMax - xMin),
      Math.abs(yMax - yMin),
      1,
    );
    const dx = 0.02 * span;
    const dy = 0.02 * span;

    if (editClipboard.kind === "landmark") {
      const landmarks = [...(model.get("landmarks") || [])];
      const item = cloneJson(editClipboard.item);
      item.id = nextLandmarkId(landmarks);
      if (Array.isArray(item.vertices)) {
        item.vertices = item.vertices.map((v) => {
          if (!Array.isArray(v) || v.length < 2) return v;
          return [Number(v[0]) + dx, Number(v[1]) + dy, ...v.slice(2)];
        });
      }
      landmarks.push(item);
      setLandmarks(model, landmarks);
      setSelected("landmark", landmarks.length - 1);
      return true;
    }

    if (editClipboard.kind === "selection") {
      const selections = [...(model.get("selections") || [])];
      const item = withHood(cloneJson(editClipboard.item));
      item.id = selectionName(item.point_indices, item.type === "inspect" ? "inspect" : "selection", selections);
      selections.push(item);
      model.set("selections", selections);
      setSelected("selection", selections.length - 1);
      return true;
    }
    return false;
  }

  function deleteSelectedOrDraftVertex() {
    if (draft.length) {
      draft.pop();
      setDeckLayers();
      return true;
    }
    const kind = model.get("selected_kind") || "";
    const index = Number(model.get("selected_index"));
    if (kind === "landmark" && index >= 0) {
      const landmarks = model.get("landmarks") || [];
      const lm = landmarks[index];
      if (lm && activeVertexIndex >= 0) {
        pushLandmarkUndo();
        if (deleteLandmarkVertex(model, index, landmarks, activeVertexIndex)) {
          activeVertexIndex = -1;
          setDeckLayers();
          return true;
        }
        // Min-vertex floor: keep landmark; do not fall through to whole delete.
        if (landmarkUndoStack.length) landmarkUndoStack.pop();
        return true;
      }
      // Whole-landmark delete only outside node mode (node mode requires an active vertex).
      if (currentMode === "node") return false;
      pushLandmarkUndo();
      deleteLandmarkTrait(
        model,
        index,
        model.get("landmarks") || [],
        kind,
        index,
      );
      activeVertexIndex = -1;
      setDeckLayers();
      return true;
    }
    if (kind === "selection" && index >= 0) {
      deleteSelectionTrait(
        model,
        index,
        model.get("selections") || [],
        kind,
        index,
      );
      setDeckLayers();
      return true;
    }
    return false;
  }

  /** Deep focus inside this widget (shadow-DOM aware). */
  function widgetHasFocus() {
    const root = container.getRootNode();
    if (root instanceof ShadowRoot) {
      const deep = root.activeElement;
      if (deep && (deep === webglCanvas || container.contains(deep))) return true;
    }
    const ae = document.activeElement;
    if (!ae) return false;
    if (ae === webglCanvas || container.contains(ae)) return true;
    return false;
  }

  let pointerInWidget = false;
  /** `performance.now()` of the last pointer move over the map, and of the last key typed into an editable outside the widget. */
  let pointerMovedAt = 0;
  let typedOutsideAt = 0;

  /**
   * Whether the pointer is over the map itself (the plot host), not the side
   * panels, the Cube dock or other chrome floating over it. `:hover` holds
   * before any pointer event reaches us (a fresh load, or a re-render under a
   * still mouse).
   */
  function pointerOverMap() {
    try {
      return host.matches(":hover");
    } catch {
      return false;
    }
  }

  /**
   * Whether a Space press arms the pan. Hovering the map is enough, with focus
   * anywhere: a notebook often keeps it in a cell editor. From an editor outside
   * the widget it pans only once the pointer has moved over the map since the
   * last key typed there, so typing with the mouse parked on the map keeps its spaces.
   */
  function spaceArmsPan(typing, inWidget) {
    if (!typing) return inWidget || pointerOverMap();
    return pointerOverMap() && pointerMovedAt > typedOutsideAt;
  }

  // The control that took focus from the keyboard (Tab, or a keyboard-driven
  // focus move), not from a click: Space and Enter then press it instead of
  // panning or finishing a draft. A clicked control keeps Space for panning.
  const CONTROL_SELECTOR =
    'button, a[href], [role="button"], [role="radio"], [role="switch"], [role="checkbox"], [role="tab"], [role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"]';
  let lastInput = "key";
  let keyFocused = null;
  function eventOrigin(event) {
    const path = typeof event.composedPath === "function" ? event.composedPath() : null;
    return (path && path[0]) || event.target;
  }
  function pressesFocusedControl(event) {
    const el = eventOrigin(event);
    return el instanceof Element && el === keyFocused && el.matches(CONTROL_SELECTOR);
  }

  function handleKeyDown(event) {
    lastInput = "key";
    if ((event.key === " " || event.key === "Enter") && pressesFocusedControl(event)) return;
    // Marimo often keeps focus in the cell editor after clicking the widget.
    // Only treat typing as blocking when the editable is *inside* our chrome
    // (gene combobox, etc.); otherwise pointerInWidget / deep focus still win.
    const typing = isTypingTarget(event);
    const inChrome = eventInWidget(event);
    if (typing && inChrome) return;
    const inWidget = inChrome || widgetHasFocus() || pointerInWidget;

    const mod = event.metaKey || event.ctrlKey;
    const key = event.key;
    const lower = key.length === 1 ? key.toLowerCase() : key;

    // Hold Space to pan in any tool (never while typing inside our own chrome).
    if (key === " " && !mod && !event.altKey && (spacePan || spaceArmsPan(typing, inWidget))) {
      event.preventDefault();
      event.stopPropagation();
      if (!event.repeat) setSpacePan(true);
      return;
    }
    if (typing) typedOutsideAt = performance.now();
    if (!inWidget) return;

    if (key === "Enter") {
      event.preventDefault();
      event.stopPropagation();
      finishVertexDraft();
      return;
    }
    // Esc in an open menu belongs to the menu (it closes itself): in Inspect
    // it never closes the cube or leaves the mode.
    if (key === "Escape" && currentMode === "inspect" && eventInMenu(event)) return;
    if (key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      // Esc stack: clear active node → leave node mode → deselect / clear probe.
      if (activeVertexIndex >= 0 || hoverInsert || hoverVertexIndex >= 0) {
        activeVertexIndex = -1;
        hoverVertexIndex = -1;
        hoverInsert = null;
        setDeckLayers();
        return;
      }
      if (currentMode === "node") {
        resetDraft();
        model.set("mode", "select");
        model.save_changes();
        return;
      }
      if (currentMode === "inspect") {
        // An open panel of the Inspect bar (Adjust, Cross-section) owns Esc
        // (closes only itself, never the cube): this handler runs on `window`
        // before the panel's own React handler ever would, so it must defer
        // explicitly.
        const panelTrigger = container.querySelector(
          '[data-inspect-panel-group] [aria-haspopup="dialog"][aria-expanded="true"]',
        );
        if (panelTrigger instanceof HTMLElement) {
          panelTrigger.click();
          return;
        }
        // Esc ends a press where it is: later moves drag nothing. React
        // closes the cube on `close`, or exits Inspect when none is open and
        // no press was ended.
        const press = Boolean(inspectGesture);
        endInspectPress();
        clearInspectHover();
        emitInspect({ type: "close", press });
        setDeckLayers();
        return;
      }
      resetDraft();
      activeVertexIndex = -1;
      hoverVertexIndex = -1;
      hoverInsert = null;
      setSelected("", -1);
      // Reset similarity to observation colors (pin + hover scrub).
      const hadQuery = (model.get("raster_query_bin") ?? -1) >= 0;
      if (hadQuery) {
        model.set("raster_query_bin", -1);
        model.save_changes();
      }
      hoverBinIndex = -1;
      hoverPointIndex = -1;
      pinnedPointIndex = -1;
      hoverProbeWorld = null;
      probeDisplayWorld = null;
      stopProbeSmooth();
      pinnedProbeWorld = null;
      probeScrubPaused = probeModeOn();
      probePauseWorld = null;
      probeScrubSeq = (probeScrubSeq + 1) | 0;
      setDeckLayers();
      return;
    }

    if (mod && !event.altKey) {
      if (lower === "z") {
        if (undoLandmarkEdit()) {
          event.preventDefault();
          event.stopPropagation();
        }
        return;
      }
      if (lower === "c") {
        if (copySelectedToClipboard()) {
          event.preventDefault();
          event.stopPropagation();
        }
        return;
      }
      if (lower === "x") {
        if (draft.length) return;
        if (!copySelectedToClipboard()) return;
        deleteSelectedOrDraftVertex();
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (lower === "v") {
        if (pasteFromClipboard()) {
          event.preventDefault();
          event.stopPropagation();
        }
        return;
      }
    }

    if (key === "Backspace" || key === "Delete") {
      if (deleteSelectedOrDraftVertex()) {
        event.preventDefault();
        event.stopPropagation();
      }
      return;
    }

    if (!mod && !event.altKey && key.startsWith("Arrow")) {
      if (nudgeSelectedLandmark(key)) {
        event.preventDefault();
        event.stopPropagation();
      }
      return;
    }

    // Mode / zoom shortcuts ignore modifiers (except Shift on +).
    if (event.altKey || event.metaKey || event.ctrlKey) return;

    if (lower in MODE_BY_KEY) {
      if (switchMode(MODE_BY_KEY[lower])) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
      }
      return;
    }
    if (key === "=" || key === "+") {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      zoomBy(1);
      return;
    }
    if (key === "-" || key === "_") {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      zoomBy(-1);
      return;
    }
    if (key === "0") {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      resetZoom();
      return;
    }
    if (lower === "f") {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      container.dispatchEvent(new CustomEvent("landmarks-toggle-fullscreen"));
    }
  }

  const abort = new AbortController();
  const { signal } = abort;

  // deck.gl zoom is linear in wheel delta (speed 0.01), so a trackpad gesture
  // (deltas of 1–5 px at the start) crawls before it ramps. Boost small deltas;
  // mouse notches (~100) keep deck's stock step.
  webglCanvas.addEventListener(
    "wheel",
    (e) => {
      if (e.shiftKey || !deckgl || !currentViewState) return;
      // Deck may report zoom as a scalar or an [x, y] pair; zoom stays uniform.
      const zRaw = currentViewState.zoom;
      const z0 = Array.isArray(zRaw) ? zRaw[0] : zRaw;
      if (typeof z0 !== "number") return;
      const scalar = (v, d) => (Array.isArray(v) ? v[0] : v) ?? d;
      let dy = e.deltaY || 0;
      if (!dy) return;
      if (e.deltaMode === 1) dy *= 40;
      const boosted = dy * (1 + WHEEL_ZOOM_BOOST / (1 + (dy / WHEEL_ZOOM_KNEE) ** 2));
      const mag = Math.log2(2 / (1 + Math.exp(-Math.abs(boosted) * WHEEL_ZOOM_SPEED)));
      const fit = scalar(fitZoom, z0);
      const zoom = Math.max(
        scalar(currentViewState.minZoom, fit - 1),
        Math.min(scalar(currentViewState.maxZoom, fit + 6), z0 + (dy < 0 ? mag : -mag))
      );
      e.preventDefault();
      e.stopImmediatePropagation();
      if (zoom === z0) return;
      // Keep the world point under the cursor fixed.
      const rect = webglCanvas.getBoundingClientRect();
      const vp = deckgl.getViewports()?.[0];
      const world = vp?.unproject([e.clientX - rect.left, e.clientY - rect.top]);
      const next = { zoom: Array.isArray(zRaw) ? [zoom, zoom] : zoom };
      if (world) {
        const t = currentViewState.target || [0, 0, 0];
        const k = Math.pow(2, z0 - zoom);
        next.target = [world[0] - (world[0] - t[0]) * k, world[1] - (world[1] - t[1]) * k, 0];
      }
      setViewState(next);
    },
    { signal, capture: true, passive: false }
  );

  webglCanvas.addEventListener(
    "wheel",
    (e) => {
      if (!e.shiftKey) return;
      const lm = focusedLandmark();
      if (lm && BUFFERABLE.includes(lm.type)) {
        e.preventDefault();
        e.stopImmediatePropagation();
        const max = maxBufferWidth();
        const step = max / 40;
        const delta = wheelDelta(e);
        if (!delta) return;
        const w = Math.max(
          0,
          Math.min(max, (Number(lm.buffer_width) || 0) + (delta > 0 ? -step : step))
        );
        updateSelectedLandmark({ buffer_width: w });
        return;
      }
      const hood = activeNeighborhood();
      if (!hood || hood.neighborhood === "off") return;
      e.preventDefault();
      e.stopImmediatePropagation();
      const delta = wheelDelta(e);
      if (!delta) return;
      if (hood.neighborhood === "knn") {
        const kMax = maxNeighborhoodK();
        const k = Math.max(
          1,
          Math.min(kMax, (Number(hood.neighborhood_k) || 12) + (delta > 0 ? -1 : 1))
        );
        updateActiveNeighborhood({ neighborhood: "knn", neighborhood_k: k });
        return;
      }
      if (hood.neighborhood === "radius") {
        const max = maxNeighborhoodRadius();
        const step = max / 40;
        const r = Math.max(
          0,
          Math.min(max, (Number(hood.neighborhood_radius) || 0) + (delta > 0 ? -step : step))
        );
        updateActiveNeighborhood({ neighborhood: "radius", neighborhood_radius: r });
      }
    },
    { capture: true, passive: false, signal }
  );

  function handleContextMenu(event) {
    // Only the WebGL canvas — chrome right-clicks (e.g. lasso shape menu) own themselves.
    const path =
      typeof event.composedPath === "function" ? event.composedPath() : null;
    let onCanvas = false;
    if (path && path.length) {
      for (let i = 0; i < path.length; i++) {
        if (path[i] === webglCanvas) {
          onCanvas = true;
          break;
        }
      }
    } else {
      onCanvas =
        event.target instanceof Node && webglCanvas.contains(event.target);
    }
    if (!onCanvas) return;
    event.preventDefault();
    event.stopPropagation();
    // Landmark context menu in select or node mode (node adds vertex/edge actions).
    if (currentMode !== "select" && currentMode !== "node") return;
    const pt = eventPoint(event);
    if (!pt) return;
    const hit = findHit(pt, 14);
    if (hit?.kind !== "landmark") return;
    setSelected("landmark", hit.index);
    let hitKind = "body";
    let vertexIndex = -1;
    let afterIndex = -1;
    let insertX = null;
    let insertY = null;
    if (currentMode === "node") {
      const vertexHit = hitTestVertex(pt);
      if (vertexHit && vertexHit.landmarkIdx === hit.index) {
        hitKind = "vertex";
        vertexIndex = vertexHit.index;
        activeVertexIndex = vertexHit.index;
      } else {
        const edgeHit = hitTestNearestEdge(pt);
        if (edgeHit && edgeHit.landmarkIdx === hit.index) {
          hitKind = "edge";
          afterIndex = edgeHit.afterIndex;
          insertX = edgeHit.x;
          insertY = edgeHit.y;
        }
      }
    }
    const payload = {
      kind: "landmark",
      index: hit.index,
      clientX: event.clientX,
      clientY: event.clientY,
      mode: currentMode,
      hit: hitKind,
      vertexIndex,
      afterIndex,
      insertX,
      insertY,
    };
    for (const fn of landmarkMenuListeners) {
      try {
        fn(payload);
      } catch {
        /* ignore */
      }
    }
  }

  webglCanvas.addEventListener("mousedown", handleMouseDown, { signal });
  webglCanvas.addEventListener("mousemove", handleMouseMove, { signal });
  webglCanvas.addEventListener("mouseup", handleMouseUp, { signal });
  webglCanvas.addEventListener("mouseleave", handleMouseLeave, { signal });
  webglCanvas.addEventListener("dblclick", handleDblClick, { signal });
  webglCanvas.addEventListener(
    "pointerdown",
    () => {
      pointerInWidget = true;
      try {
        webglCanvas.focus({ preventScroll: true });
      } catch {
        webglCanvas.focus();
      }
    },
    { signal },
  );
  container.addEventListener(
    "pointerdown",
    () => {
      pointerInWidget = true;
    },
    { signal },
  );
  host.addEventListener(
    "pointermove",
    () => {
      pointerMovedAt = performance.now();
    },
    { signal, passive: true },
  );
  // Document listeners see retargeted shadow hosts — use composedPath.
  document.addEventListener(
    "pointerdown",
    (e) => {
      pointerInWidget = eventInWidget(e);
    },
    { signal },
  );
  window.addEventListener(
    "pointerdown",
    () => {
      lastInput = "pointer";
    },
    { capture: true, signal },
  );
  window.addEventListener(
    "focusin",
    (e) => {
      keyFocused = lastInput === "key" ? eventOrigin(e) : null;
    },
    { capture: true, signal },
  );
  // Capture on window so we run before notebook hosts; composedPath keeps
  // shadow-DOM focus checks correct for marimo anywidget.
  window.addEventListener("keydown", handleKeyDown, {
    capture: true,
    signal,
  });
  window.addEventListener(
    "keyup",
    (event) => {
      if (event.key === " " && spacePan) {
        event.preventDefault();
        setSpacePan(false);
      }
    },
    { capture: true, signal },
  );
  window.addEventListener("blur", () => setSpacePan(false), { signal });
  document.addEventListener("contextmenu", handleContextMenu, {
    capture: true,
    signal,
  });

  const unsubs = [];
  function onChange(key, fn) {
    const event = `change:${key}`;
    model.on(event, fn);
    unsubs.push(() => model.off?.(event, fn));
  }

  ["landmarks", "selections", "type_neighborhoods"].forEach((k) => {
    onChange(k, () => {
      setDeckLayers();
      updateUI();
      if (k === "landmarks") for (const fn of landmarkListeners) fn();
    });
  });
  ["selected_index", "selected_kind", "selected_type_indices"].forEach((k) => {
    onChange(k, () => {
      activeVertexIndex = -1;
      hoverVertexIndex = -1;
      hoverInsert = null;
      setDeckLayers();
      updateUI();
    });
  });
  onChange("mode", () => {
    currentMode = model.get("mode");
    if (currentMode === "pointer") currentMode = "select";
    endInspectGesture();
    clearInspectHover();
    if (currentMode === "node") nodeInsertArmed = true;
    else {
      activeVertexIndex = -1;
      nodeInsertArmed = true;
    }
    hoverTarget = null;
    hoverVertexIndex = -1;
    hoverInsert = null;
    if (currentMode !== "probe") {
      hoverBinIndex = -1;
      hoverPointIndex = -1;
      pinnedPointIndex = -1;
    }
    clientRasterKey = "";
    resetDraft();
    syncInteractionMode();
    setDeckLayers();
  });
  onChange("points_data", () => {
    pointsCache = { key: "", data: [] };
    focusGeomCache = { key: "", pointRoles: null, hoodEdges: [], knnEdgeLinesDrawn: false };
    hoodHighlightData = [];
    hoodHighlightKey = "";
    invalidatePointGeometryBuffers();
    geneDenseFromCsc = null;
    spatialIndex = null;
    spatialIndexPointCount = 0;
    scheduleSpatialIndexBuild();
    schedulePointFillColorsBuild();
    clientRasterKey = "";
    if (!deckgl) {
      initDeck();
    } else {
      setDeckLayers();
    }
    updatePointLegend();
  });
  ["map_mosaic_url", "map_mosaic_bounds"].forEach((k) => {
    onChange(k, () => {
      mapMosaicCache = { url: "", image: null, bounds: null, loading: false };
      invalidatePointColorBuffers();
      schedulePointFillColorsBuild();
      setDeckLayers();
    });
  });
  ["point_palette", "point_size", "color_by", "legend_labels", "legend_title", "color_vmin", "color_vmax"].forEach((k) => {
    onChange(k, () => {
      if (k === "color_by") {
        pendingViewPulse = true;
        if (genesProbeHoverInert()) clearProbeHover();
      }
      if (deckgl) setDeckLayers();
      updatePointLegend();
    });
  });
  onChange("category_codes", () => {
    refreshCategoryCodes();
    clientRasterKey = "";
    invalidatePointColorBuffers();
    schedulePointFillColorsBuild();
    setDeckLayers();
  });
  onChange("gene_values", () => {
    refreshGeneValues();
    clientRasterKey = "";
    setDeckLayers();
  });
  ["gene_format", "gene_csc_indptr", "gene_csc_indices", "gene_csc_data"].forEach((k) => {
    onChange(k, () => {
      refreshGeneValues();
      clientRasterKey = "";
      setDeckLayers();
    });
  });
  onChange("embedding_values", () => {
    refreshEmbeddingValues();
    setDeckLayers();
    updatePointLegend();
  });
  onChange("embedding_channel_labels", () => {
    setDeckLayers();
    updatePointLegend();
  });
  onChange("embedding_matrix", () => {
    refreshEmbeddingMatrix();
    clientRasterKey = "";
    setDeckLayers();
  });
  onChange("embedding_matrix_dim", () => {
    refreshEmbeddingMatrix();
    clientRasterKey = "";
    setDeckLayers();
  });
  onChange("promote_tick", () => {
    promoteNeighborhoodClient();
  });
  onChange("promote_buffer_tick", () => {
    promoteBufferClient();
  });
  ["category_columns", "active_category"].forEach((k) => {
    onChange(k, () => {
      clientRasterKey = "";
      updateUI();
      setDeckLayers();
    });
  });
  ["gene_columns", "active_genes", "gene_scale_mode", "gene_log1p", "gene_expression_logged"].forEach((k) => {
    onChange(k, () => {
      if (k === "active_genes") {
        clientRasterKey = "";
        if (genesProbeHoverInert()) clearProbeHover();
      }
      updateUI();
      updatePointLegend();
      setDeckLayers();
    });
  });
  [
    "render_mode",
    "raster_feature_dim",
    "raster_n_bins",
    "raster_n_cols",
    "raster_n_rows",
    "raster_origin_x",
    "raster_origin_y",
    "raster_bin_size",
    "raster_window_radius",
    "raster_status",
    "raster_query_bin",
    "raster_threshold",
    "raster_similarity_enabled",
    "raster_basis",
    "raster_embedding_dims",
    "raster_embedding_key",
    "raster_feature_labels",
  ].forEach((k) => {
    onChange(k, () => {
      // Ignore meta writes from ensureClientRaster (depth > 0); those must not
      // wipe clientRasterKey or we rebuild on every layer pass.
      if (
        !rasterRebuildDepth &&
        (k === "render_mode" ||
          k === "raster_bin_size" ||
          k === "raster_window_radius" ||
          k === "raster_basis" ||
          k === "raster_embedding_key" ||
          k === "raster_similarity_enabled")
      ) {
        clientRasterKey = "";
        rasterScores = null;
        rasterScoreKey = "";
        rasterImageCache = { key: "", image: null, bounds: null };
      }
      if (k === "render_mode" && !isRasterMode()) {
        hoverBinIndex = -1;
      }
      if (k === "render_mode" || k === "raster_basis") {
        pendingViewPulse = true;
        if (genesProbeHoverInert()) clearProbeHover();
      }
      if (rasterRebuildDepth) return;
      if (deckgl) setDeckLayers();
      updatePointLegend();
    });
  });

  updateUI();
  let resizeObserver = null;
  let startRaf = 0;
  let destroyed = false;
  const start = () => {
    if (destroyed) return;
    const w = main.clientWidth;
    const h = main.clientHeight;
    if (w <= 1 || h <= 1) {
      startRaf = requestAnimationFrame(start);
      return;
    }
    startRaf = requestAnimationFrame(async () => {
      await initDeck();
      if (destroyed) {
        if (deckgl && typeof deckgl.finalize === "function") deckgl.finalize();
        deckgl = null;
        return;
      }
      setDeckLayers();
      scheduleSpatialIndexBuild();
      schedulePointFillColorsBuild();
      resizeObserver = new ResizeObserver(() => resizeDeck());
      resizeObserver.observe(main);
    });
  };
  startRaf = requestAnimationFrame(start);

  function destroy() {
    destroyed = true;
    if (plotBootstrapTimer) clearTimeout(plotBootstrapTimer);
    plotBootstrapTimer = 0;
    plotBootstrapListeners = [];
    abort.abort();
    endInspectGesture();
    unsubs.forEach((fn) => fn());
    themeObserver.disconnect();
    resizeObserver?.disconnect();
    if (startRaf) cancelAnimationFrame(startRaf);
    if (layerRaf) cancelAnimationFrame(layerRaf);
    if (deckgl && typeof deckgl.finalize === "function") deckgl.finalize();
    deckgl = null;
    zoomWidget = null;
    resetWidget = null;
    if (typeof window !== "undefined" && window.__landmarksEngine) {
      delete window.__landmarksEngine;
      delete window.__landmarksModel;
    }
    host.replaceChildren();
  }

  const handle = {
    zoomBy: (d, opts) => zoomBy(d, opts),
    resetZoom: () => resetZoom(),
    resize: () => resizeDeck(),
    undoLandmarkEdit: () => undoLandmarkEdit(),
    reverseSelectedLandmark: () => {
      const focus = landmarkFocus();
      if (!focus) return;
      pushLandmarkUndo();
      reverseLandmark(model, focus.index, model.get("landmarks") || []);
      activeVertexIndex = -1;
      setDeckLayers();
    },
    convertSelectedLandmark: (type) => {
      const focus = landmarkFocus();
      if (!focus) return;
      pushLandmarkUndo();
      convertLandmarkType(model, focus.index, model.get("landmarks") || [], type);
      activeVertexIndex = -1;
      setDeckLayers();
    },
    deleteActiveVertex: () => {
      const focus = landmarkFocus();
      if (!focus || activeVertexIndex < 0) return false;
      const landmarks = model.get("landmarks") || [];
      const lm = landmarks[focus.index];
      if (!lm) return false;
      pushLandmarkUndo();
      const ok = deleteLandmarkVertex(model, focus.index, landmarks, activeVertexIndex);
      if (ok) {
        activeVertexIndex = -1;
        setDeckLayers();
        return true;
      }
      if (landmarkUndoStack.length) landmarkUndoStack.pop();
      return false;
    },
    insertVertexAt: (landmarkIdx, afterIndex, xy) => {
      const landmarks = model.get("landmarks") || [];
      if (landmarkIdx < 0 || landmarkIdx >= landmarks.length) return false;
      pushLandmarkUndo();
      insertLandmarkVertex(model, landmarkIdx, landmarks, afterIndex, xy);
      activeVertexIndex = afterIndex;
      hoverInsert = null;
      setDeckLayers();
      return true;
    },
    setNodeInsertArmed: (armed) => {
      nodeInsertArmed = !!armed;
      if (!nodeInsertArmed) {
        hoverInsert = null;
        setDeckLayers();
      }
    },
    getNodeInsertArmed: () => nodeInsertArmed,
    getActiveVertexIndex: () => activeVertexIndex,
    getViewState: () => (currentViewState ? { ...currentViewState } : null),
    setViewState: (partial, opts) => setViewState(partial, opts),
    subscribeViewState: (fn) => {
      if (typeof fn !== "function") return () => {};
      viewStateListeners.push(fn);
      return () => {
        viewStateListeners = viewStateListeners.filter((f) => f !== fn);
      };
    },
    getPlotBootstrap: () => ({ ...plotBootstrap }),
    subscribePlotBootstrap: (fn) => {
      if (typeof fn !== "function") return () => {};
      plotBootstrapListeners.push(fn);
      return () => {
        plotBootstrapListeners = plotBootstrapListeners.filter((f) => f !== fn);
      };
    },
    getViewportWorldBounds: () => {
      if (!deckgl?.isInitialized) return null;
      const vp = deckgl.getViewports()?.[0];
      if (vp && vp.width > 0 && vp.height > 0) {
        const a = vp.unproject([0, vp.height]);
        const b = vp.unproject([vp.width, 0]);
        return [
          Math.min(a[0], b[0]),
          Math.min(a[1], b[1]),
          Math.max(a[0], b[0]),
          Math.max(a[1], b[1]),
        ];
      }
      // Fallback from orthographic viewState (common-space target + zoom).
      const vs = currentViewState;
      if (!vs?.target) return null;
      const w = Math.max(1, webglCanvas.clientWidth || webglCanvas.width || 1);
      const h = Math.max(1, webglCanvas.clientHeight || webglCanvas.height || 1);
      const scale = Math.pow(2, vs.zoom ?? 0);
      const halfW = w / (2 * scale);
      const halfH = h / (2 * scale);
      const cx = vs.target[0];
      const cy = vs.target[1];
      return [cx - halfW, cy - halfH, cx + halfW, cy + halfH];
    },
    panTo: (x, y, opts = {}) => {
      const animate = opts.animate !== false && opts.animate !== 0;
      setViewState(
        { target: [x, y, currentViewState?.target?.[2] ?? 0] },
        {
          animate,
          duration: opts.duration ?? (animate ? 220 : 0),
        },
      );
    },
    getSelectionOverlay: () => {
      const kind = model.get("selected_kind");
      const selectedIdx = model.get("selected_index");
      const pts = getPointsData();
      const out = [];
      (model.get("selections") || []).forEach((sel, i) => {
        const selected = kind === "selection" && i === selectedIdx;
        const members = selectionMemberIndices(sel, pts);
        out.push({
          index: i,
          selected,
          pointCount: members.length,
          // No stroke overlay — emphasis is size + dimming on the points layer.
          lineWidth: 0,
          lineAlpha: 0,
        });
      });
      return out;
    },
    getNeighborhoodOverlay: () => {
      const focus = cellLayerFocus();
      const hood = neighborhoodFor(focus);
      const mode = hood?.neighborhood || "off";
      let radius = Number(hood?.neighborhood_radius) || 0;
      const rMax = maxNeighborhoodRadius();
      if (rMax > 0) radius = Math.min(radius, rMax);
      const gradient = mode === "radius" && hoodRadiusGradient?.image
        ? hoodRadiusGradient
        : null;
      let neighborRoleCount = 0;
      let seedRoleCount = 0;
      if (pointRoles) {
        for (let i = 0; i < pointRoles.length; i++) {
          if (pointRoles[i] === NEIGH_ROLE) neighborRoleCount++;
          else if (pointRoles[i] === SEED_ROLE) seedRoleCount++;
        }
      }
      return {
        mode,
        edgeCount: hoodEdges.length,
        knnEdgeLinesDrawn: hoodKnnEdgeLinesDrawn,
        neighborRoleCount,
        seedRoleCount,
        // Legacy: stroked per-seed disks removed; always 0 in radius gradient mode.
        radiusDiskCount: 0,
        radiusGradient: Boolean(gradient),
        gradientKind: gradient ? "bitmap" : null,
        gradientSeedCount: gradient ? gradient.seedCount : 0,
        gradientTextureSize: gradient ? gradient.textureSize : null,
        gradientBounds: gradient ? gradient.bounds : null,
        /** r_max used for the distance-field bake (remap uses current radius). */
        gradientBakeRadius: gradient ? gradient.bakeRMax : null,
        radius,
        k: Number(hood?.neighborhood_k) || 0,
      };
    },
    /**
     * End-to-end neighborhood toggle timing (harness / profiling).
     * @param {{ seedCount: number, mode?: 'knn'|'radius'|'off', k?: number, offFirst?: boolean }} opts
     */
    benchNeighborhoodToggle(opts = {}) {
      const seedCount = Math.max(0, opts.seedCount | 0);
      const mode = opts.mode || "knn";
      const offFirst = opts.offFirst !== false;
      benchForceKnnEdges = !!opts.forceKnnEdges;
      if (opts.freshSelection) {
        focusGeomCache = { key: "", pointRoles: null, hoodEdges: [], knnEdgeLinesDrawn: false };
      }
      const pts = getPointsData();
      const seeds =
        Array.isArray(opts.seedIndices) && opts.seedIndices.length
          ? opts.seedIndices.map((i) => i | 0).filter((i) => i >= 0 && i < pts.length)
          : Array.from(
              { length: Math.min(seedCount, pts.length) },
              (_, i) => i,
            );
      const rMax = maxNeighborhoodRadius();
      const radius = rMax > 0 ? rMax * 0.35 : 0;
      const apply = (hood) => {
        model.set("selections", [
          {
            id: opts.freshSelection ? `bench-hood-${opts.seedCount}-${performance.now()}` : "bench-hood",
            type: "points",
            point_indices: seeds,
            neighborhood: hood,
            neighborhood_k: opts.k ?? 12,
            neighborhood_radius: radius,
          },
        ]);
        model.set("selected_kind", "selection");
        model.set("selected_index", 0);
      };
      if (offFirst) apply("off");
      const t0 = performance.now();
      apply(mode);
      setDeckLayers();
      return new Promise((resolve) => {
        const finish = () => {
          benchForceKnnEdges = false;
          const overlay = handle.getNeighborhoodOverlay();
          resolve({
            ms: performance.now() - t0,
            mode,
            seedCount: seeds.length,
            spatialIndexBuilt: Boolean(spatialIndex),
            hoodHighlightCount: hoodHighlightData.length,
            deckBuildProfile: { ...lastDeckBuildProfile },
            ...overlay,
          });
        };
        if (!deckgl?.isInitialized) {
          requestAnimationFrame(() => requestAnimationFrame(finish));
          return;
        }
        deckgl.setProps({
          onAfterRender: () => {
            deckgl.setProps({ onAfterRender: null });
            finish();
          },
        });
      });
    },
    profileNeighborhoodToggle(opts = {}) {
      const marks = [];
      const mark = (name) => {
        performance.mark(name);
        marks.push(name);
      };
      mark("hood-toggle-start");
      return handle.benchNeighborhoodToggle(opts).then((result) => {
        mark("hood-toggle-end");
        const measures = [];
        if (marks.length >= 2) {
          try {
            const m = performance.measure(
              "hood-toggle-e2e",
              marks[0],
              marks[marks.length - 1],
            );
            measures.push({ name: m.name, duration: m.duration });
          } catch {
            /* ignore */
          }
        }
        return { ...result, measures };
      });
    },
    getPerfSnapshot: () => ({
      spatialIndexBuilt: Boolean(spatialIndex),
      spatialIndexReadyMs,
      pointCount: getPointsData().length,
      hoodHighlightCount: hoodHighlightData.length,
      pointRoleMode,
      usingBinaryScatterColors: Boolean(pointFillColors),
    }),
    getHover: () => (hoverTarget ? { ...hoverTarget } : null),
    subscribeHover: (fn) => {
      if (typeof fn !== "function") return () => {};
      hoverListeners.push(fn);
      return () => {
        hoverListeners = hoverListeners.filter((f) => f !== fn);
      };
    },
    subscribeLandmarkMenu: (fn) => {
      if (typeof fn !== "function") return () => {};
      landmarkMenuListeners.push(fn);
      return () => {
        landmarkMenuListeners = landmarkMenuListeners.filter((f) => f !== fn);
      };
    },
    getInspectPin: () => {
      const kind = model.get("selected_kind") || "";
      const index = model.get("selected_index");
      if (
        (kind === "landmark" || kind === "type" || kind === "molecule") &&
        index >= 0
      ) {
        return { kind, index };
      }
      return null;
    },
    subscribeInspect(fn) {
      if (typeof fn !== "function") return () => {};
      inspectListeners.add(fn);
      return () => inspectListeners.delete(fn);
    },
    setInspectWindowVisible(v) {
      volumeWindowVisible = Boolean(v);
      setDeckLayers();
    },
    setInspectWindow(x, y, sizeUm) {
      volumeWindow = { x, y, size: sizeUm };
      model.set("inspect_cx", x);
      model.set("inspect_cy", y);
      model.set("inspect_size_um", sizeUm);
      volumeWindowSavedAt = performance.now();
      model.save_changes();
      setDeckLayers();
    },
    moveInspectWindow(x, y) {
      const size = volumeWindow?.size ?? inspectWindowUm;
      volumeWindow = { x, y, size };
      model.set("inspect_cx", x);
      model.set("inspect_cy", y);
      model.set("inspect_size_um", size);
      setDeckLayers();
    },
    saveInspect,
    getLandmarkGeometry: landmarkGeometry,
    subscribeLandmarks(fn) {
      if (typeof fn !== "function") return () => {};
      landmarkListeners.add(fn);
      return () => landmarkListeners.delete(fn);
    },
    getInspectOverlay() {
      return {
        hover: volumeHover ? [volumeHover.x, volumeHover.y] : null,
        placed: volumeWindow ? [volumeWindow.x, volumeWindow.y] : null,
        sizeUm: inspectWindowUm,
        placedSizeUm: volumeWindow?.size ?? null,
      };
    },
    /** Test / membership probe: `[x, y]` per point, in the `inspect_cx/cy` frame (µm). */
    getPoints() {
      return getPointsData().map((p) => [p.x, p.y]);
    },
    /**
     * Scatter points inside an Inspect window for the 3D cube: map µm position,
     * fill colour and radius (µm), using the same accessors as the 2D layer.
     */
    getScatterPointsInWindow(cx, cy, sizeUm) {
      const data = getPointsData();
      if (!data.length) return [];
      const half = sizeUm / 2;
      const probeField =
        pointSimilarityOn() || rasterSimilarityOn()
          ? activePointProbeScores()
          : null;
      const out = [];
      for (const d of data) {
        if (Math.abs(d.x - cx) > half || Math.abs(d.y - cy) > half) continue;
        out.push({
          x: d.x,
          y: d.y,
          z: d.z,
          color: fillColorForPoint(d, probeField),
          radius: radiusForPoint(d),
        });
      }
      return out;
    },
    destroy,
  };
  if (typeof window !== "undefined") {
    window.__landmarksEngine = handle;
    window.__landmarksModel = model;
  }
  return handle;
}
