/**
 * Landmarks model facade: UI state stays local; only notebook annotations
 * sync to the kernel. Raster bin features are built in the browser.
 */

/**
 * Bidirectional notebook contract — every interaction save.
 * ``color`` and the private colour dicts are here because the kernel derives
 * ``active_*``, packs embeddings, and echoes ``_color_state`` / ``_look``.
 * A local-only write changes the menu and leaves the points on the previous colour.
 */
export const NOTEBOOK_KEYS = new Set([
  "landmarks",
  "selections",
  "selected_kind",
  "selected_index",
  "inspect_cx",
  "inspect_cy",
  "inspect_open",
  "color",
  "_color_state",
  "_look",
  "_color_options",
  "_category_columns",
  "_category_codes",
  "_embedding_values",
  "_embedding_channel_labels",
  "_embedding_matrix",
  "_embedding_matrix_dim",
  "_gene_csc_data",
  "_gene_csc_indices",
  "_gene_csc_indptr",
]);

const COLOR_STATE_KEYS = new Set([
  "color_mode",
  "legend_title",
  "legend_labels",
  "raster_basis",
  "raster_embedding_key",
]);

const LOOK_KEYS = new Set([
  "point_palette",
  "color_vmin",
  "color_vmax",
  "gene_scale_mode",
  "gene_log1p",
  "raster_embedding_dims",
]);

/** Legacy top-level colour traits, folded into the private synced dicts. */
const RENAMED_COLOR_KEYS = {
  category_columns: "_category_columns",
  category_codes: "_category_codes",
  embedding_values: "_embedding_values",
  embedding_channel_labels: "_embedding_channel_labels",
  embedding_matrix: "_embedding_matrix",
  embedding_matrix_dim: "_embedding_matrix_dim",
  gene_csc_indptr: "_gene_csc_indptr",
  gene_csc_indices: "_gene_csc_indices",
  gene_csc_data: "_gene_csc_data",
};

const DEFAULTS = {
  mode: "select",
  active_genes: [],
  gene_scale_mode: "independent",
  gene_log1p: false,
  type_neighborhoods: [],
  promote_tick: 0,
  promote_buffer_tick: 0,
  show_rulers: false,
  raster_query_bin: -1,
  raster_threshold: 0,
  raster_similarity_enabled: false,
  render_mode: "points",
};

function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

/**
 * Wrap an anywidget model so UI trait writes stay in-memory unless flushed
 * for notebook annotation sync.
 *
 * @param {import('./landmarks_state.js').AnyModel | object} raw
 */
export function wrapLandmarksModel(raw) {
  const local = Object.create(null);
  /** @type {Map<string, Set<() => void>>} */
  const localHandlers = new Map();

  function emitLocal(key) {
    const set = localHandlers.get(key);
    if (!set) return;
    for (const fn of set) fn();
  }

  function readRaw(key) {
    const v = raw.get(key);
    return v == null ? undefined : v;
  }

  function writeRaw(key, value) {
    if (hasOwn(local, key)) delete local[key];
    raw.set(key, value);
  }

  /** Map a removed top-level colour trait onto the private dict the engine reads. */
  function foldLegacyColorKey(key, value) {
    if (COLOR_STATE_KEYS.has(key)) {
      const prev = readRaw("_color_state") || {};
      writeRaw("_color_state", { ...prev, [key]: value });
      return true;
    }
    if (LOOK_KEYS.has(key)) {
      const prev = readRaw("_look") || {};
      writeRaw("_look", { ...prev, [key]: value });
      return true;
    }
    if (key === "gene_names") {
      const prev = readRaw("_color_options") || { obs: {}, genes: [], embeddings: {} };
      writeRaw("_color_options", { ...prev, genes: value });
      return true;
    }
    if (key === "raster_embedding_keys") {
      const prev = readRaw("_color_options") || { obs: {}, genes: [], embeddings: {} };
      const old = prev.embeddings || {};
      const embeddings = {};
      for (const name of value || []) embeddings[name] = old[name] ?? 0;
      writeRaw("_color_options", { ...prev, embeddings });
      return true;
    }
    if (key === "_numeric_obs_columns") {
      const prev = readRaw("_color_options") || { obs: {}, genes: [], embeddings: {} };
      const obs = { ...(prev.obs || {}) };
      for (const name of value || []) obs[name] = { ...(obs[name] || {}), kind: "numeric" };
      writeRaw("_color_options", { ...prev, obs });
      return true;
    }
    const renamed = RENAMED_COLOR_KEYS[key];
    if (renamed) {
      writeRaw(renamed, value);
      return true;
    }
    return false;
  }

  const wrapped = {
    get(key) {
      if (!NOTEBOOK_KEYS.has(key) && hasOwn(local, key)) return local[key];
      const v = raw.get(key);
      if (v !== undefined && v !== null) return v;
      if (hasOwn(DEFAULTS, key)) return DEFAULTS[key];
      return v;
    },

    set(key, value) {
      if (foldLegacyColorKey(key, value)) return;
      if (NOTEBOOK_KEYS.has(key)) {
        // Drop a stale local copy so the value Python sends back is what
        // the menu and the points both read.
        if (hasOwn(local, key)) delete local[key];
        raw.set(key, value);
        return;
      }
      local[key] = value;
      emitLocal(key);
    },

    /** Persist dirty notebook keys (landmarks / selections / selection focus). */
    save_changes() {
      raw.save_changes();
    },

    on(event, fn) {
      const m = typeof event === "string" ? /^change:(.+)$/.exec(event) : null;
      if (m) {
        const key = m[1];
        if (!NOTEBOOK_KEYS.has(key)) {
          if (!localHandlers.has(key)) localHandlers.set(key, new Set());
          localHandlers.get(key).add(fn);
        }
      }
      raw.on(event, fn);
    },

    off(event, fn) {
      const m = typeof event === "string" ? /^change:(.+)$/.exec(event) : null;
      if (m && localHandlers.has(m[1])) {
        localHandlers.get(m[1]).delete(fn);
      }
      raw.off?.(event, fn);
    },

    /** Escape hatch for tests / raw trait access. */
    _raw: raw,
  };

  return wrapped;
}

/** True when the facade is currently showing raster geometry. */
export function isRasterView(model) {
  return (model.get("render_mode") || "points") === "raster";
}
