/// <reference types="vite/client" />
import type { CellMeshData } from "./cell-mesh";
import type { WorkerRequest } from "./cell-mesh-worker";
import CellMeshWorker from "./cell-mesh-worker?worker&inline";
import type { VolumeCommClient } from "./volume-comm";

/** `volume.cells` from Python: the per-slice polygon parquet in the store, and its size. */
export type CellPolygons = { url: string; bytes: number };

/** Comm reads stay well under message-size limits of notebook transports. */
const READ_BYTES = 4 << 20;

type Reply = { id: number; mesh: CellMeshData | null; error?: string };

/** One worker per polygon file, shared by every cube; `build` resolves null when a newer window superseded it. */
class CellMeshWorkerClient {
  private worker = new CellMeshWorker();
  private next = 1;
  private pending = new Map<number, (m: CellMeshData | null) => void>();
  private loaded: Promise<void>;

  constructor(cells: CellPolygons, rows: Int32Array, comm: VolumeCommClient) {
    this.worker.onmessage = (e: MessageEvent<Reply>) => {
      if (e.data.error) console.warn("cell meshes:", e.data.error);
      this.pending.get(e.data.id)?.(e.data.mesh);
      this.pending.delete(e.data.id);
    };
    this.loaded = readAll(comm, cells).then((parquet) => {
      const own = rows.slice();
      this.post({ type: "load", parquet: parquet.buffer as ArrayBuffer, rows: own }, [parquet.buffer, own.buffer]);
    });
  }

  private post(msg: WorkerRequest, transfer: Transferable[] = []) {
    this.worker.postMessage(msg, transfer);
  }

  async build(box: [number, number, number, number]): Promise<CellMeshData | null> {
    await this.loaded;
    const id = this.next++;
    return new Promise((resolve) => {
      this.pending.set(id, resolve);
      this.post({ type: "build", id, box });
    });
  }
}

async function readAll(comm: VolumeCommClient, cells: CellPolygons): Promise<Uint8Array> {
  const out = new Uint8Array(cells.bytes);
  const reads = [];
  for (let offset = 0; offset < cells.bytes; offset += READ_BYTES) {
    const length = Math.min(READ_BYTES, cells.bytes - offset);
    reads.push(
      comm.get(cells.url, { offset, length }).then((b) => {
        if (b?.byteLength !== length) throw new Error(`cell polygons: short read at ${offset}`);
        out.set(b, offset);
      }),
    );
  }
  await Promise.all(reads);
  return out;
}

const clients = new Map<string, CellMeshWorkerClient>();

export function cellMeshBuilder(cells: CellPolygons, rows: Int32Array, comm: VolumeCommClient): CellMeshWorkerClient {
  let c = clients.get(cells.url);
  if (!c) clients.set(cells.url, (c = new CellMeshWorkerClient(cells, rows, comm)));
  return c;
}
