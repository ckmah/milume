// Worker-equivalent memory of the polygon store (Node, --expose-gc): heap after load, after a 300 µm build,
// and with the default 4M-vertex LRU full. Usage: node --expose-gc --import tsx scripts/cell-loft-mem.mjs <parquet>
import { asyncBufferFromFile } from "hyparquet";
import { CellPolygonStore } from "../src/widgets/volume-cube/cell-loft/store.ts";
const mb = () => { global.gc(); const m = process.memoryUsage(); return { heap_mb: +(m.heapUsed / 1e6).toFixed(1), array_buffers_mb: +(m.arrayBuffers / 1e6).toFixed(1) }; };
const base = mb();
const { store } = await CellPolygonStore.fromParquet(await asyncBufferFromFile(process.argv[2]), { xyUmPerPx: 0.1149847507476807, zUmPerIndex: 0.5, labelIds: {} });
const loaded = mb();
for (const c of store.cellsIn(1443 - 150, -5190 - 150, 1443 + 150, -5190 + 150)) store.mesh(c);
const w300 = { ...mb(), cache_verts: store.cacheVerts };
for (let c = 0; c < store.cellIds.length; c++) store.mesh(c);
const full = { ...mb(), cache_verts: store.cacheVerts, cached_cells: store.cache.size };
console.log(JSON.stringify({ base, loaded, after_300um: w300, lru_full: full }));
