import { decodeF32Base64, decodeI32Base64 } from "./binary";
import { invokeCommand, type CommandModel } from "./comm-command.js";
import { createGeneStore, type GeneSlice, type GeneStore } from "./gene-store.js";

type GeneModel = {
  get(key: string): unknown;
  on(event: string, callback: () => void): void;
};

type GeneGetResponse = {
  ok: boolean;
  status?: number;
  error?: string;
  genes?: Array<{ name: string; vmin: number; vmax: number; nnz: number }>;
};

function typedView<T extends Int32Array | Float32Array>(
  buf: ArrayBuffer | ArrayBufferView | undefined,
  Ctor: { new (b: ArrayBuffer, o: number, l: number): T; new (src: ArrayLike<number> | ArrayBuffer): T },
): T {
  if (!buf) return new Ctor(new ArrayBuffer(0));
  const view = ArrayBuffer.isView(buf) ? buf : new Uint8Array(buf);
  const { buffer, byteOffset, byteLength } = view;
  if (byteOffset % 4 === 0) return new Ctor(buffer as ArrayBuffer, byteOffset, byteLength / 4);
  return new Ctor(buffer.slice(byteOffset, byteOffset + byteLength) as ArrayBuffer);
}

/** ``_gene_get`` reply split into per-gene slices (zero-copy views when aligned). */
export async function fetchGeneSlices(model: CommandModel, names: string[]): Promise<GeneSlice[]> {
  const [res, buffers] = await invokeCommand<GeneGetResponse>(model, "_gene_get", { names });
  if (!res.ok || !res.genes) throw new Error(res.error || `_gene_get failed (${res.status ?? "error"})`);
  const rows = typedView(buffers[0], Int32Array);
  const values = typedView(buffers[1], Float32Array);
  let at = 0;
  return res.genes.map((g) => {
    const s = { name: g.name, vmin: g.vmin, vmax: g.vmax, rows: rows.subarray(at, at + g.nnz), values: values.subarray(at, at + g.nnz) };
    at += g.nnz;
    return s;
  });
}

function pointCount(model: GeneModel): number {
  const b64 = String(model.get("points_data") || "");
  const pad = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor(((b64.length * 3) / 4 - pad) / 16));
}

const stores = new WeakMap<object, GeneStore>();

/**
 * The widget's one gene store, shared by the engine and the React chrome (both hold
 * the same landmarks facade, so ``active_genes`` here is what is on screen). It loads
 * the eager pack, fetches ``active_genes`` as they change, and resets when the
 * catalog changes.
 */
export function geneStoreFor(model: GeneModel): GeneStore {
  const hit = stores.get(model);
  if (hit) return hit;
  const active = () => (model.get("active_genes") as string[] | undefined) ?? [];
  // The landmarks facade keeps UI keys (active_genes) local; commands go to the raw model.
  const comm = ((model as { _raw?: unknown })._raw ?? model) as Partial<CommandModel>;
  const store = createGeneStore({
    nObs: () => pointCount(model),
    activeNames: active,
    fetchSlices: (names) =>
      typeof comm.send === "function"
        ? fetchGeneSlices(comm as CommandModel, names)
        : Promise.reject(new Error("widget has no kernel comm")),
  });
  const loadEager = () => {
    const indptr = decodeI32Base64(String(model.get("gene_csc_indptr") || ""));
    store.setEager(
      (model.get("gene_names") as Array<{ name: string; vmin?: number; vmax?: number }>) ?? [],
      indptr.length ? indptr : null,
      decodeI32Base64(String(model.get("gene_csc_indices") || "")),
      decodeF32Base64(String(model.get("gene_csc_data") || "")),
    );
  };
  const fetchActive = () => {
    void store.ensure(active().filter((n) => !store.error(n)));
  };
  loadEager();
  for (const key of ["gene_names", "gene_csc_indptr", "gene_csc_indices", "gene_csc_data"]) {
    model.on(`change:${key}`, () => {
      store.clear();
      loadEager();
      fetchActive();
    });
  }
  model.on("change:points_data", () => store.dropColumns());
  model.on("change:active_genes", fetchActive);
  fetchActive();
  stores.set(model, store);
  return store;
}
