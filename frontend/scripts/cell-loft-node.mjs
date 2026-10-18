// Node driver for the TS loft (run with `npx tsx`): reads the parquet, builds the requested cells,
// writes MLMESH-like per-cell binary for Python scoring. Usage:
//   npx tsx scripts/cell-loft-node.mjs <parquet> <cells.json> <out.bin>
// cells.json: {xy, z, cells: [cell_id...], windows: {name: [x0,y0,x1,y1]}}
import fs from "node:fs";
import { asyncBufferFromFile } from "hyparquet";
import { CellPolygonStore } from "../src/widgets/volume-cube/cell-loft/store.ts";

const [pq, cfgPath, outPath] = process.argv.slice(2);
const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
const t0 = performance.now();
const { store, timings } = await CellPolygonStore.fromParquet(await asyncBufferFromFile(pq), { xyUmPerPx: cfg.xy, zUmPerIndex: cfg.z, labelIds: {} });
const res = { load: { ...timings, total_ms: performance.now() - t0, rss_mb: process.memoryUsage().rss / 1e6 } };
const idx = new Map(store.cellIds.map((c, i) => [c, i]));
// per-cell meshes for scoring
const chunks = []; const meta = [];
let off = 0;
for (const cid of cfg.cells) {
  const m = store.mesh(idx.get(cid));
  for (const a of [m.positions, m.normals, m.indices]) { chunks.push(Buffer.from(a.buffer, a.byteOffset, a.byteLength)); }
  meta.push({ cell: cid, nv: m.positions.length / 3, ni: m.indices.length, off, stats: m.stats });
  off += m.positions.byteLength * 2 + m.indices.byteLength;
}
fs.writeFileSync(outPath, Buffer.concat(chunks));
res.cells = meta;
// window timings (cold: fresh cache each)
res.windows = {};
for (const [name, box] of Object.entries(cfg.windows ?? {})) {
  store.cache.clear(); store.cacheVerts = 0; store.cacheVertexBudget = 1e12;
  const cells = name === "all" ? store.cellIds.map((_, i) => i) : store.cellsIn(...box);
  const t = performance.now();
  const ms = cells.map((c) => store.mesh(c));
  const tb = performance.now() - t;
  const w = store.pack(cells, ms, [box[0], box[1], 0]);
  const st = ms.reduce((a, m) => { for (const k in m.stats) a[k] = (a[k] ?? 0) + m.stats[k]; return a; }, {});
  res.windows[name] = { cells: cells.length, build_ms: tb, pack_ms: performance.now() - t - tb, triangles: w.indices.length / 3, vertices: w.positions.length / 3, bytes: w.bytes, stats: st };
  console.error(name, JSON.stringify(res.windows[name]));
}
res.rss_mb_end = process.memoryUsage().rss / 1e6;
fs.writeFileSync(outPath + ".json", JSON.stringify(res));
console.error(JSON.stringify(res.load));
