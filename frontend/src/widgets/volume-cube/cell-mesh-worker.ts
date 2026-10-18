/// <reference lib="webworker" />
/**
 * Web Worker: builds cell meshes for the Inspect window from the per-slice polygon
 * parquet (branch proto-cell-mesh-ts). Messages:
 *   {type: "load", url, xyUmPerPx, zUmPerIndex, labelIds}  -> {type: "loaded", timings}
 *   {type: "build", id, box: [x0, y0, x1, y1]}             -> {type: "built", id, mesh} (buffers transferred)
 * A newer build supersedes an older one between cell chunks (latest window wins); cells
 * already meshed stay in the per-cell cache, so moving back and forth is cheap.
 */
import { CellPolygonStore, type PolygonSource } from "./cell-loft/store";

let store: CellPolygonStore | null = null;
let ready: Promise<void> | null = null;
let latest = 0;
const CHUNK = 48;
const yieldToMessages = () => new Promise<void>((r) => setTimeout(r, 0));

self.onmessage = async (e: MessageEvent) => {
  const m = e.data;
  if (m.type === "load") {
    ready = (async () => {
      const t0 = performance.now();
      const res = await fetch(m.url);
      const buf = await res.arrayBuffer();
      const t1 = performance.now();
      const file = { byteLength: buf.byteLength, slice: (a: number, b?: number) => buf.slice(a, b) };
      const src: PolygonSource = { xyUmPerPx: m.xyUmPerPx, zUmPerIndex: m.zUmPerIndex, labelIds: m.labelIds ?? {} };
      const { store: s, timings } = await CellPolygonStore.fromParquet(file, src);
      store = s;
      (self as unknown as Worker).postMessage({ type: "loaded", timings: { ...timings, fetch_ms: t1 - t0, total_ms: performance.now() - t0, parquet_bytes: buf.byteLength } });
    })();
    return;
  }
  if (m.type === "build") {
    latest = m.id;
    await ready;
    if (!store || m.id !== latest) return;
    const t0 = performance.now();
    const [x0, y0, x1, y1] = m.box as [number, number, number, number];
    const cells = store.cellsIn(x0, y0, x1, y1);
    let built = 0, cached = 0;
    const meshes = [];
    for (let k = 0; k < cells.length; k++) {
      const c = cells[k]!;
      if (store.cache.has(c)) cached++; else built++;
      meshes.push(store.mesh(c));
      if (k % CHUNK === CHUNK - 1) {
        await yieldToMessages();
        if (m.id !== latest) { (self as unknown as Worker).postMessage({ type: "superseded", id: m.id, done: k + 1, of: cells.length }); return; }
      }
    }
    const tb = performance.now();
    const w = store.pack(cells, meshes, [x0, y0, 0]);
    const mesh = { ...w, built, cached, ms: performance.now() - t0, build_ms: tb - t0, pack_ms: performance.now() - tb };
    (self as unknown as Worker).postMessage({ type: "built", id: m.id, mesh }, [w.positions.buffer, w.normals.buffer, w.cells.buffer, w.indices.buffer, w.labels.buffer]);
  }
};
