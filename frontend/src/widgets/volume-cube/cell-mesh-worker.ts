/// <reference lib="webworker" />
/**
 * Builds the Inspect window's cell meshes off the main thread. `load` hands over the
 * polygon parquet once; each `build` meshes the cells in a window, yielding between
 * chunks so a newer window supersedes it. Built cells stay cached across windows.
 */
import { CellPolygonStore } from "./cell-loft/store";

export type WorkerRequest =
  | { type: "load"; parquet: ArrayBuffer; rows: Int32Array }
  | { type: "build"; id: number; box: [number, number, number, number] };

const CHUNK = 48;

let store: Promise<CellPolygonStore>;
let latest = 0;
const post = (msg: unknown, transfer: Transferable[] = []) => (self as unknown as Worker).postMessage(msg, transfer);
const yieldToMessages = () => new Promise<void>((r) => setTimeout(r, 0));

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const m = e.data;
  if (m.type === "load") {
    store = CellPolygonStore.fromParquet(m.parquet, m.rows);
    return;
  }
  latest = m.id;
  try {
    const s = await store;
    const [x0, y0, x1, y1] = m.box;
    const cells = s.cellsIn(x0, y0, x1, y1);
    const meshes = [];
    for (let k = 0; k < cells.length; k++) {
      meshes.push(s.mesh(cells[k]!));
      if (k % CHUNK === CHUNK - 1) {
        await yieldToMessages();
        if (m.id !== latest) return post({ id: m.id, mesh: null });
      }
    }
    const w = s.pack(cells, meshes, [x0, y0, 0]);
    post({ id: m.id, mesh: w }, [w.positions.buffer, w.normals.buffer, w.cells.buffer, w.indices.buffer, w.ids.buffer]);
  } catch (err) {
    post({ id: m.id, mesh: null, error: String(err) });
  }
};
