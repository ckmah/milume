/**
 * Cell polygons for the client-side loft: parquet -> per-cell slices, per-window meshes.
 *
 * Source: the per-z-slice segmentation parquet (cell_id, ZIndex, geometry WKB in pixels),
 * read in the browser with hyparquet (pure JS, snappy built in, no wasm). xy is scaled by
 * `xyUmPerPx`; z centre is (ZIndex + 0.5) * zUmPerIndex, as spatialdata_io's pyxa reader.
 */
import { parquetMetadataAsync, parquetRead, type AsyncBuffer } from "hyparquet";
import { type Poly, makePoly } from "./geom";
import { type CellMesh, DEFAULT_PARAMS, type MeshParams, meshCell } from "./loft";
import { wkbPolygons } from "./wkb";

export type PolygonSource = { xyUmPerPx: number; zUmPerIndex: number; labelIds: Record<string, number> };

export type WindowMesh = {
  originUm: [number, number, number];
  positions: Float32Array; normals: Float32Array; cells: Uint16Array; indices: Uint32Array; labels: Int32Array;
  bytes: number; built: number; cached: number; ms: number;
};

export class CellPolygonStore {
  cellIds: string[] = [];
  labelOf: Int32Array = new Int32Array(0);
  /** rows of each cell: z µm and decoded pieces */
  rows: { z: number; parts: Poly[] }[][] = [];
  bbox: Float64Array = new Float64Array(0); // 4 per cell
  p: MeshParams;
  cache = new Map<number, CellMesh>();
  cacheVerts = 0;
  constructor(p: MeshParams = DEFAULT_PARAMS, public cacheVertexBudget = 4_000_000) { this.p = p; }

  static async fromParquet(file: AsyncBuffer, src: PolygonSource, p?: MeshParams): Promise<{ store: CellPolygonStore; timings: Record<string, number> }> {
    const t0 = performance.now();
    const metadata = await parquetMetadataAsync(file);
    let cols: unknown[][] = [];
    await parquetRead({ file, metadata, columns: ["cell_id", "ZIndex", "geometry"], geoparquet: false, utf8: true, onComplete: (rows: unknown[][]) => (cols = rows) });
    const t1 = performance.now();
    const st = new CellPolygonStore(p);
    const index = new Map<string, number>();
    const bb: number[] = [];
    for (const row of cols) {
      const cid = String(row[0]);
      let c = index.get(cid);
      if (c === undefined) { c = st.cellIds.length; index.set(cid, c); st.cellIds.push(cid); st.rows.push([]); bb.push(Infinity, Infinity, -Infinity, -Infinity); }
      const zi = Number(row[1] as number | bigint);
      const parts = wkbPolygons(row[2] as Uint8Array, src.xyUmPerPx).map(makePoly);
      st.rows[c]!.push({ z: (zi + 0.5) * src.zUmPerIndex, parts });
      for (const q of parts) {
        const b = q.bbox;
        if (b[0] < bb[4 * c]!) bb[4 * c] = b[0]; if (b[1] < bb[4 * c + 1]!) bb[4 * c + 1] = b[1];
        if (b[2] > bb[4 * c + 2]!) bb[4 * c + 2] = b[2]; if (b[3] > bb[4 * c + 3]!) bb[4 * c + 3] = b[3];
      }
    }
    st.bbox = Float64Array.from(bb);
    st.labelOf = Int32Array.from(st.cellIds, (c) => src.labelIds[c] ?? 0);
    const t2 = performance.now();
    return { store: st, timings: { parquet_read_ms: t1 - t0, decode_ms: t2 - t1, rows: cols.length, cells: st.cellIds.length } as Record<string, number> };
  }

  /** Cells whose bbox centre lies in the window (whole cells, as the 2D map and the Python cache). */
  cellsIn(x0: number, y0: number, x1: number, y1: number): number[] {
    const out: number[] = [];
    for (let c = 0; c < this.cellIds.length; c++) {
      const cx = (this.bbox[4 * c]! + this.bbox[4 * c + 2]!) / 2, cy = (this.bbox[4 * c + 1]! + this.bbox[4 * c + 3]!) / 2;
      if (x0 <= cx && cx <= x1 && y0 <= cy && cy <= y1) out.push(c);
    }
    return out;
  }

  mesh(c: number): CellMesh {
    let m = this.cache.get(c);
    if (m) { this.cache.delete(c); this.cache.set(c, m); return m; } // LRU touch
    m = meshCell(this.rows[c]!, this.p);
    this.cache.set(c, m); this.cacheVerts += m.positions.length / 3;
    for (const [k, v] of this.cache) {
      if (this.cacheVerts <= this.cacheVertexBudget) break;
      this.cache.delete(k); this.cacheVerts -= v.positions.length / 3;
    }
    return m;
  }

  /** Pack cells into one window buffer (positions relative to origin, like pack_mesh). */
  pack(cells: number[], meshes: CellMesh[], origin: [number, number, number]): Omit<WindowMesh, "built" | "cached" | "ms"> {
    let nv = 0, ni = 0;
    for (const m of meshes) { nv += m.positions.length / 3; ni += m.indices.length; }
    const positions = new Float32Array(nv * 3), normals = new Float32Array(nv * 3), cellIdx = new Uint16Array(nv), indices = new Uint32Array(ni);
    let v = 0, i = 0;
    meshes.forEach((m, k) => {
      const n = m.positions.length / 3;
      for (let a = 0; a < n; a++) {
        positions[3 * (v + a)] = m.positions[3 * a]! - origin[0];
        positions[3 * (v + a) + 1] = m.positions[3 * a + 1]! - origin[1];
        positions[3 * (v + a) + 2] = m.positions[3 * a + 2]! - origin[2];
      }
      normals.set(m.normals, 3 * v); cellIdx.fill(k, v, v + n);
      for (let b = 0; b < m.indices.length; b++) indices[i + b] = m.indices[b]! + v;
      v += n; i += m.indices.length;
    });
    const labels = Int32Array.from(cells, (c) => this.labelOf[c]!);
    const bytes = positions.byteLength + normals.byteLength + cellIdx.byteLength + indices.byteLength + labels.byteLength;
    return { originUm: origin, positions, normals, cells: cellIdx, indices, labels, bytes };
  }
}
