import { decodeF32Base64, decodeI32Base64 } from "@/widgets/landmarks/binary";
import type { AnyModel } from "@/widgets/landmarks/helpers";
import { isCommVolumeUrl } from "@/widgets/volume-cube/volume-url";

declare const __MILUME_VOLUME_FIXTURE_FILE__: string | undefined;

type Listener = () => void;

type CommBuffer = ArrayBuffer | DataView;
type CustomHandler = (msg: unknown, buffers?: CommBuffer[]) => void;

type GeneHook = { delayMs?: number; fail?: boolean };
type KernelGene = { name: string; vmin: number; vmax: number; rows: Int32Array; values: Float32Array };

function base64Bytes(b64: string): number {
  const pad = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0;
  return Math.max(0, (b64.length * 3) / 4 - pad);
}

/**
 * The fixture's gene pack, held "kernel-side" like Python's ``_gene_get``. Legacy
 * fixtures carry dense col-major ``gene_values``; newer ones the CSC traits.
 */
function kernelGenes(state: Record<string, unknown>): Map<string, KernelGene> {
  const meta = (state.gene_names as Array<{ name: string; vmin?: number; vmax?: number }>) ?? [];
  const n = Math.floor(base64Bytes(String(state.points_data ?? "")) / 16);
  const out = new Map<string, KernelGene>();
  const put = (j: number, rows: Int32Array, values: Float32Array) => {
    const m = meta[j]!;
    out.set(m.name, { name: m.name, vmin: m.vmin ?? 0, vmax: m.vmax ?? 1, rows, values });
  };
  const indptr = decodeI32Base64(String(state.gene_csc_indptr ?? ""));
  if (indptr.length === meta.length + 1 && meta.length) {
    const indices = decodeI32Base64(String(state.gene_csc_indices ?? ""));
    const data = decodeF32Base64(String(state.gene_csc_data ?? ""));
    meta.forEach((_, j) => put(j, indices.slice(indptr[j], indptr[j + 1]), data.slice(indptr[j], indptr[j + 1])));
  } else {
    const dense = decodeF32Base64(String(state.gene_values ?? ""));
    const active = (state.active_genes as string[]) ?? [];
    const order = dense.length === n * meta.length ? meta.map((m) => m.name) : active;
    order.forEach((name, c) => {
      const j = meta.findIndex((m) => m.name === name);
      if (j < 0 || dense.length < (c + 1) * n) return;
      const rows: number[] = [];
      const values: number[] = [];
      for (let i = 0; i < n; i++) {
        const v = dense[c * n + i]!;
        if (v) {
          rows.push(i);
          values.push(v);
        }
      }
      put(j, Int32Array.from(rows), Float32Array.from(values));
    });
  }
  return out;
}

/**
 * Minimal traitlets model for notebook-free dev and Impeccable live. Genes load on
 * demand through a simulated ``_gene_get`` (names-only catalog, like Python's
 * default); ``?eagerGenes=1`` keeps the fixture's CSC pack in the state instead.
 */
export function createMockModel(
  initial: Record<string, unknown>,
  options: { volumeStaticRoot?: string; fixtureUrl?: string } = {},
): AnyModel {
  const state: Record<string, unknown> = { ...initial };
  const eagerGenes =
    typeof window !== "undefined" && new URLSearchParams(window.location.search).get("eagerGenes") === "1";
  const genesKernel = kernelGenes(state);
  const geneRequests: string[][] = [];
  if (!eagerGenes) {
    state.gene_names = ((state.gene_names as Array<{ name: string }>) ?? []).map((g) => ({ name: g.name }));
    state.gene_csc_indptr = "";
    state.gene_csc_indices = "";
    state.gene_csc_data = "";
  } else if (!state.gene_csc_indptr && genesKernel.size) {
    const meta = (state.gene_names as Array<{ name: string }>) ?? [];
    const slices = meta.map((m) => genesKernel.get(m.name));
    const indptr = new Int32Array(meta.length + 1);
    slices.forEach((g, j) => (indptr[j + 1] = indptr[j]! + (g?.rows.length ?? 0)));
    const toB64 = (a: ArrayBufferView) =>
      btoa(String.fromCharCode(...new Uint8Array(a.buffer, a.byteOffset, a.byteLength)));
    const cat = <T extends Int32Array | Float32Array>(C: { new (n: number): T }, pick: (g: KernelGene) => T) => {
      const out = new C(indptr[meta.length]!);
      slices.forEach((g, j) => g && out.set(pick(g), indptr[j]!));
      return out;
    };
    state.gene_csc_indptr = toB64(indptr);
    state.gene_csc_indices = toB64(cat(Int32Array, (g) => g.rows));
    state.gene_csc_data = toB64(cat(Float32Array, (g) => g.values));
  }
  delete state.gene_values;
  delete state.gene_format;
  const listeners = new Map<string, Set<Listener>>();
  const customHandlers = new Set<CustomHandler>();
  const dirty = new Set<string>();
  let commReads = 0;
  const commPaths: string[] = [];

  const volume = initial.volume as { image_url?: string } | undefined;

  function staticRootForFixture(fixtureUrl: string): string {
    const viteFixture =
      typeof __MILUME_VOLUME_FIXTURE_FILE__ !== "undefined" ? __MILUME_VOLUME_FIXTURE_FILE__ : "";
    const name = viteFixture || fixtureUrl.split("/").pop() || "";
    if (name.includes("xsmall")) return "/xsmall.sdata.zarr/";
    if (name.includes("small")) return "/small.sdata.zarr/";
    if (name.includes("issue122")) return "/issue122-2d.sdata.zarr/";
    if (name.includes("colon")) return "/colon_a2.sdata.zarr/";
    return "/toy.sdata.zarr/";
  }

  const volumeStaticRoot =
    options.volumeStaticRoot ??
    (isCommVolumeUrl(volume?.image_url ?? "") ? staticRootForFixture(options.fixtureUrl ?? "") : "");

  async function serveVolumeGet(msg: unknown): Promise<[object, (ArrayBuffer | DataView)[]]> {
    const hook =
      typeof window !== "undefined"
        ? (window as unknown as { __volumeCommHook?: { delayMs?: number; fail?: boolean } }).__volumeCommHook
        : undefined;
    if (hook?.fail) {
      return [{ ok: false, status: 500, error: "volume_get failed (injected)" }, []];
    }
    if (hook?.delayMs && hook.delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, hook.delayMs));
    }
    const body = msg as { path?: string; range?: { offset?: number; length?: number; suffixLength?: number } };
    let rel = String(body.path ?? "").replace(/^\//, "");
    if (!volumeStaticRoot || !rel) return [{ ok: false, status: 404 }, []];
    const url = `${volumeStaticRoot}${rel}`.replace(/([^:]\/)\/+/g, "$1");
    const headers: Record<string, string> = {};
    const range = body.range;
    if (range) {
      if ("suffixLength" in range) {
        headers.Range = `bytes=-${range.suffixLength}`;
      } else if (range.offset != null && range.length != null) {
        const end = range.offset + range.length - 1;
        headers.Range = `bytes=${range.offset}-${end}`;
      }
    }
    commReads++;
    commPaths.push(rel);
    const res = await fetch(url, { headers });
    if (res.status === 404) return [{ ok: false, status: 404 }, []];
    if (!res.ok) throw new Error(`volume_get ${url}: ${res.status}`);
    const buf = await res.arrayBuffer();
    // marimo forwards comm buffers as DataView (see marimo static model send()).
    const payload = new DataView(buf);
    return [{ ok: true, status: res.status }, [payload]];
  }

  async function serveGeneGet(msg: unknown): Promise<[object, ArrayBuffer[]]> {
    const hook =
      typeof window !== "undefined" ? (window as unknown as { __geneCommHook?: GeneHook }).__geneCommHook : undefined;
    if (hook?.delayMs && hook.delayMs > 0) await new Promise((r) => setTimeout(r, hook.delayMs));
    const names = (msg as { names?: unknown })?.names;
    if (!Array.isArray(names) || !names.length || names.length > 16) {
      return [{ ok: false, status: 400, error: "names must list 1 to 16 gene names" }, []];
    }
    if (hook?.fail) return [{ ok: false, status: 500, error: "_gene_get failed (injected)" }, []];
    const known = new Set(((state.gene_names as Array<{ name: string }>) ?? []).map((g) => g.name));
    const unknown = names.filter((n) => !known.has(String(n)));
    if (unknown.length) return [{ ok: false, status: 404, error: `not in the gene catalog: ${unknown}` }, []];
    geneRequests.push(names.map(String));
    const empty = { rows: new Int32Array(0), values: new Float32Array(0), vmin: 0, vmax: 1 };
    const slices = names.map((n) => ({ name: String(n), ...(genesKernel.get(String(n)) ?? empty) }));
    const total = slices.reduce((a, g) => a + g.rows.length, 0);
    const rows = new Int32Array(total);
    const values = new Float32Array(total);
    let at = 0;
    for (const g of slices) {
      rows.set(g.rows, at);
      values.set(g.values, at);
      at += g.rows.length;
    }
    const genes = slices.map((g) => ({ name: g.name, vmin: g.vmin, vmax: g.vmax, nnz: g.rows.length }));
    return [{ ok: true, genes }, [rows.buffer, values.buffer]];
  }

  const model = {
    get(key: string) {
      return state[key];
    },
    set(key: string, value: unknown) {
      state[key] = value;
      dirty.add(key);
    },
    save_changes() {
      for (const key of dirty) {
        listeners.get(`change:${key}`)?.forEach((cb) => cb());
      }
      dirty.clear();
    },
    on(event: string, callback: Listener | CustomHandler) {
      if (event === "msg:custom") {
        customHandlers.add(callback as CustomHandler);
        return;
      }
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)!.add(callback as Listener);
    },
    off(event: string, callback: Listener | CustomHandler) {
      if (event === "msg:custom") {
        customHandlers.delete(callback as CustomHandler);
        return;
      }
      listeners.get(event)?.delete(callback as Listener);
    },
    send(content: unknown) {
      const cmd = content as { id?: string; kind?: string; name?: string; msg?: unknown };
      if (cmd.kind !== "anywidget-command") return;
      const serve = cmd.name === "volume_get" ? serveVolumeGet : cmd.name === "_gene_get" ? serveGeneGet : null;
      if (!serve) return;
      void serve(cmd.msg).then(([response, buffers]) => {
        const payload = { id: cmd.id, kind: "anywidget-command-response", response };
        for (const handler of customHandlers) handler(payload, buffers);
      });
    },
  };

  if (typeof window !== "undefined") {
    (window as unknown as { __geneRequests?: () => string[][] }).__geneRequests = () =>
      geneRequests.map((r) => [...r]);
  }

  if (typeof window !== "undefined" && volumeStaticRoot) {
    (window as unknown as { __volumeCommStaticRoot?: string }).__volumeCommStaticRoot = volumeStaticRoot;
    (window as unknown as { __volumeCommReads?: () => number }).__volumeCommReads = () => commReads;
    (window as unknown as { __volumeCommPaths?: () => string[] }).__volumeCommPaths = () => [...commPaths];
  }

  return model;
}

/**
 * Load ``/fixture.json`` at runtime so Vite does not transform the multi‑MB
 * base64 payload into the module graph (slow cold start / HMR after regen).
 */
function harnessFixtureUrl() {
  if (typeof window === "undefined") return "/fixture.json";
  const fromQuery = new URLSearchParams(window.location.search).get("fixture");
  return fromQuery ? fromQuery : "/fixture.json";
}

export async function loadFixtureModel(url?: string): Promise<AnyModel> {
  const res = await fetch(url ?? harnessFixtureUrl());
  if (!res.ok) {
    throw new Error(`Failed to load harness fixture ${url}: ${res.status}`);
  }
  const initial = (await res.json()) as Record<string, unknown>;
  const fixtureUrl = url ?? harnessFixtureUrl();
  return createMockModel(initial, { fixtureUrl });
}
