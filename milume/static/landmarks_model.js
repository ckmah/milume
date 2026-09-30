/**
 * Landmarks model facade: UI state stays local; only notebook annotations
 * sync to the kernel. Raster bin features are built in the browser.
 */

/** Bidirectional notebook contract — every interaction save. */
export const NOTEBOOK_KEYS = new Set([
  "landmarks",
  "selections",
  "selected_kind",
  "selected_index",
  "inspect_cx",
  "inspect_cy",
]);

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

  const wrapped = {
    get(key) {
      if (hasOwn(local, key)) return local[key];
      const v = raw.get(key);
      if (v !== undefined && v !== null) return v;
      if (hasOwn(DEFAULTS, key)) return DEFAULTS[key];
      return v;
    },

    set(key, value) {
      if (NOTEBOOK_KEYS.has(key)) {
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
