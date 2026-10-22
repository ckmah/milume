/**
 * Per-gene expression cache for one widget. Each gene is a sparse slice (int32 rows,
 * float32 values in [0, 1]); a dense n_obs column exists only for genes on screen.
 * Preloaded genes (the eager ``genes=`` pack) are pinned; fetched genes live in a
 * byte-budgeted LRU that never evicts a gene on screen.
 */

export const GENE_CACHE_BUDGET_BYTES = 128 * 1024 * 1024;
/** Matches Python ``GENE_FETCH_MAX_NAMES``. */
export const GENE_FETCH_BATCH = 16;
export const GENE_AGGREGATES = ["mean", "median", "max"];

/**
 * @param {{
 *   nObs: () => number,
 *   activeNames: () => string[],
 *   fetchSlices: (names: string[]) => Promise<Array<{ name: string, vmin: number, vmax: number, rows: Int32Array, values: Float32Array }>>,
 *   budgetBytes?: number,
 * }} opts
 */
export function createGeneStore({ nObs, activeNames, fetchSlices, budgetBytes = GENE_CACHE_BUDGET_BYTES }) {
  const pinned = new Map();
  const lru = new Map();
  const inflight = new Map();
  const failed = new Map();
  const dense = new Map();
  const listeners = new Set();
  let lruBytes = 0;
  let version = 0;
  let aggregate = "mean";
  const counts = { fetches: 0, fetchedGenes: 0, densified: 0, evictions: 0 };

  function emit() {
    version += 1;
    for (const fn of listeners) fn();
  }

  function slice(name) {
    const hit = pinned.get(name);
    if (hit) return hit;
    const entry = lru.get(name);
    if (!entry) return null;
    lru.delete(name);
    lru.set(name, entry);
    return entry;
  }

  function evict() {
    if (lruBytes <= budgetBytes) return;
    const keep = new Set(activeNames());
    for (const [name, entry] of lru) {
      if (lruBytes <= budgetBytes) break;
      if (keep.has(name)) continue;
      lru.delete(name);
      lruBytes -= entry.bytes;
      counts.evictions += 1;
    }
  }

  function insert(s) {
    const prev = lru.get(s.name);
    if (prev) lruBytes -= prev.bytes;
    const entry = { ...s, bytes: s.rows.byteLength + s.values.byteLength };
    lru.set(s.name, entry);
    lruBytes += entry.bytes;
    failed.delete(s.name);
  }

  function pruneDense(active) {
    for (const name of dense.keys()) if (!active.includes(name)) dense.delete(name);
  }

  const store = {
    get version() {
      return version;
    },
    get aggregate() {
      return aggregate;
    },
    setAggregate(mode) {
      if (!GENE_AGGREGATES.includes(mode) || mode === aggregate) return;
      aggregate = mode;
      emit();
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    /** Pin the eager pack: column ``j`` of the CSC is ``meta[j].name``. */
    setEager(meta, indptr, indices, data) {
      pinned.clear();
      dense.clear();
      if (meta.length && indptr && indptr.length === meta.length + 1) {
        meta.forEach((m, j) => {
          const a = indptr[j];
          const b = indptr[j + 1];
          pinned.set(m.name, {
            name: m.name,
            vmin: m.vmin,
            vmax: m.vmax,
            rows: indices.subarray(a, b),
            values: data.subarray(a, b),
          });
        });
      }
      emit();
    },
    /** Drop every slice and column (catalog or cell count changed). */
    clear() {
      pinned.clear();
      lru.clear();
      dense.clear();
      failed.clear();
      inflight.clear();
      lruBytes = 0;
      emit();
    },
    dropColumns() {
      dense.clear();
      emit();
    },
    has(name) {
      return pinned.has(name) || lru.has(name);
    },
    /** ``{ vmin, vmax }`` once the gene is loaded, else null. */
    meta(name) {
      const s = pinned.get(name) ?? lru.get(name);
      return s ? { name, vmin: s.vmin, vmax: s.vmax } : null;
    },
    error(name) {
      return failed.get(name) ?? null;
    },
    pending() {
      return [...inflight.keys()];
    },
    /** Fetch every name not loaded or in flight, in batches; resolves when all land. */
    ensure(names) {
      const missing = [...new Set(names)].filter(
        (n) => !pinned.has(n) && !lru.has(n) && !inflight.has(n),
      );
      const waits = [...new Set(names)].filter((n) => inflight.has(n)).map((n) => inflight.get(n));
      for (let i = 0; i < missing.length; i += GENE_FETCH_BATCH) {
        const batch = missing.slice(i, i + GENE_FETCH_BATCH);
        counts.fetches += 1;
        const p = fetchSlices(batch)
          .then((slices) => {
            for (const s of slices) {
              if (inflight.get(s.name) !== p) continue;
              insert(s);
              counts.fetchedGenes += 1;
            }
            evict();
          })
          .catch((err) => {
            const message = String(err?.message ?? err);
            for (const n of batch) if (inflight.get(n) === p) failed.set(n, message);
          })
          .finally(() => {
            for (const n of batch) if (inflight.get(n) === p) inflight.delete(n);
            emit();
          });
        for (const n of batch) inflight.set(n, p);
        waits.push(p);
      }
      if (missing.length) emit();
      return Promise.all(waits).then(() => undefined);
    },
    /**
     * Dense [0, 1] column of an on-screen gene (``activeNames``), or null when the
     * gene is off screen or not loaded yet. Off-screen columns are released.
     */
    column(name) {
      const active = activeNames();
      pruneDense(active);
      if (!active.includes(name)) return null;
      const hit = dense.get(name);
      if (hit) return hit;
      const s = slice(name);
      if (!s) return null;
      const n = nObs();
      const col = new Float32Array(n);
      const { rows, values } = s;
      for (let p = 0; p < rows.length; p++) {
        const i = rows[p];
        if (i >= 0 && i < n) col[i] = values[p];
      }
      dense.set(name, col);
      counts.densified += 1;
      return col;
    },
    stats() {
      let denseBytes = 0;
      for (const c of dense.values()) denseBytes += c.byteLength;
      return {
        ...counts,
        lruBytes,
        lruGenes: lru.size,
        pinnedGenes: pinned.size,
        denseColumns: dense.size,
        denseBytes,
        pending: inflight.size,
        budgetBytes,
      };
    },
  };
  return store;
}
