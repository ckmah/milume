// Worker build bench for the client-side loft (branch proto-cell-mesh-ts). Driven by
// scripts/cell-loft-bench.mjs; results on window.__bench.
import { CellMeshWorkerClient, type CellPolygonSpec } from "../../src/widgets/volume-cube/cell-mesh-source";

const spec: CellPolygonSpec = { url: "/small-segmentation.parquet", xy_um_per_px: 0.1149847507476807, z_um_per_index: 0.5, label_ids_url: "/small-cell-labels.json" };
const C = [1443.0, -5190.0];
const box = (w: number): [number, number, number, number] => [C[0]! - w / 2, C[1]! - w / 2, C[0]! + w / 2, C[1]! + w / 2];
const heap = () => ((performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? 0) / 1e6;

async function cold(name: string, b: [number, number, number, number]) {
  const c = new CellMeshWorkerClient(spec);
  const t0 = performance.now();
  const load = await c.loaded;
  const t1 = performance.now();
  // main thread stays responsive: count rAF frames while the worker builds
  let frames = 0, maxGap = 0, last = performance.now(), on = true;
  const tick = () => { const n = performance.now(); maxGap = Math.max(maxGap, n - last); last = n; frames++; if (on) requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
  const m = await c.build(b);
  const t2 = performance.now();
  on = false;
  const out = { name, load_total_ms: t1 - t0, load, build_roundtrip_ms: t2 - t1, worker: (globalThis as never as { __cellMeshWorker: { builds: unknown[] } }).__cellMeshWorker.builds.at(-1),
    cells: m?.labels.length, triangles: m ? m.indices.length / 3 : 0, transferred_bytes: m?.bytes, main_heap_mb: heap(), raf_frames: frames, raf_max_gap_ms: maxGap };
  return { out, c };
}

(window as unknown as { runBench: () => Promise<unknown> }).runBench = async () => {
  const res: Record<string, unknown> = {};
  for (const [name, b] of [["100", box(100)], ["300", box(300)], ["all", [-1e9, -1e9, 1e9, 1e9] as [number, number, number, number]]] as const) {
    const { out, c } = await cold(name, b);
    res[name] = out;
    if (name === "100") {
      // pan: 10 steps of 20 µm to the right, each a new window (cells shared with the last are cached)
      const steps = [];
      for (let k = 1; k <= 10; k++) {
        const t = performance.now();
        const m = await c.build([b[0] + 20 * k, b[1], b[2] + 20 * k, b[3]]);
        steps.push({ ms: performance.now() - t, worker: (globalThis as never as { __cellMeshWorker: { builds: Record<string, number>[] } }).__cellMeshWorker.builds.at(-1), cells: m?.labels.length });
      }
      res.pan100 = steps;
      // supersede: fire 5 windows at once; only the last should complete
      const ps = [1, 2, 3, 4, 5].map((k) => c.build([b[0] - 30 * k, b[1] - 30 * k, b[2] - 30 * k, b[3] - 30 * k]));
      const got = await Promise.all(ps);
      res.burst5 = got.map((m) => (m ? m.labels.length : null));
    }
    (window as unknown as { __lastClient: unknown }).__lastClient = c;
    if (name !== "all") c.worker.terminate();
  }
  return res;
};
(window as unknown as { benchReady: boolean }).benchReady = true;
