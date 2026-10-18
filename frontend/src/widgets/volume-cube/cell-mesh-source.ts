/**
 * Client for cell-mesh-worker.ts (branch proto-cell-mesh-ts): one worker per polygon
 * source, shared by every cube; `build(box)` resolves with the window's CellMeshData,
 * or null when a newer request superseded it.
 */
import type { CellMeshData } from "./cell-mesh";

/** `volume.cell_polygons` from Python (or the dev fixture). */
export type CellPolygonSpec = {
  url: string;
  xy_um_per_px: number;
  z_um_per_index: number;
  /** cell_id -> label id (the colouring's key); or a JSON URL with that map. */
  label_ids?: Record<string, number>;
  label_ids_url?: string;
};

type Pending = { resolve: (m: CellMeshData | null) => void };
const clients = new Map<string, CellMeshWorkerClient>();

export class CellMeshWorkerClient {
  worker: Worker;
  next = 1;
  pending = new Map<number, Pending>();
  loaded: Promise<Record<string, number>>;
  constructor(spec: CellPolygonSpec) {
    const worker = new Worker(new URL("./cell-mesh-worker.ts", import.meta.url), { type: "module" });
    this.worker = worker;
    let onLoaded: (t: Record<string, number>) => void = () => {};
    this.loaded = new Promise((r) => (onLoaded = r));
    this.worker.onmessage = (e) => {
      const m = e.data;
      if (m.type === "loaded") { onLoaded(m.timings); stats().load = m.timings; return; }
      const p = this.pending.get(m.id);
      if (!p) return;
      this.pending.delete(m.id);
      if (m.type === "built") {
        const w = m.mesh;
        stats().builds.push({ id: m.id, ms: w.ms, build_ms: w.build_ms, pack_ms: w.pack_ms, built: w.built, cached: w.cached, cells: w.labels.length, triangles: w.indices.length / 3, bytes: w.bytes });
        p.resolve({ originUm: w.originUm, positions: w.positions, normals: w.normals, cells: w.cells, indices: w.indices, labels: w.labels, bytes: w.bytes });
      } else {
        stats().superseded++;
        p.resolve(null);
      }
    };
    void (async () => {
      const labelIds = spec.label_ids ?? (spec.label_ids_url ? await (await fetch(spec.label_ids_url)).json() : {});
      worker.postMessage({ type: "load", url: spec.url, xyUmPerPx: spec.xy_um_per_px, zUmPerIndex: spec.z_um_per_index, labelIds });
    })();
  }
  build(box: [number, number, number, number]): Promise<CellMeshData | null> {
    const id = this.next++;
    // Older requests resolve null when the worker reports them superseded.
    return new Promise((resolve) => {
      this.pending.set(id, { resolve });
      this.worker.postMessage({ type: "build", id, box });
    });
  }
  static for(spec: CellPolygonSpec): CellMeshWorkerClient {
    let c = clients.get(spec.url);
    if (!c) { c = new CellMeshWorkerClient(spec); clients.set(spec.url, c); }
    return c;
  }
}

type MeshStats = { load?: Record<string, number>; builds: Record<string, number>[]; superseded: number };
function stats(): MeshStats {
  const w = globalThis as unknown as { __cellMeshWorker?: MeshStats };
  return (w.__cellMeshWorker ??= { builds: [], superseded: 0 });
}
