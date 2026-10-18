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

type PackedCell = { ox: number; oy: number; scale: number; z: Float64Array; rowPart: Uint32Array; partRing: Uint32Array; ringOff: Uint32Array; xy: Float32Array | Float64Array };

export class CellPolygonStore {
  cellIds: string[] = [];
  labelOf: Int32Array = new Int32Array(0);
  /** per cell: packed polygon rings (see fromParquet) */
  packed: PackedCell[] = [];
  bbox: Float64Array = new Float64Array(0); // 4 per cell
  p: MeshParams;
  cache = new Map<number, CellMesh>();
  cacheVerts = 0;
  constructor(p: MeshParams = DEFAULT_PARAMS, public cacheVertexBudget = 4_000_000) { this.p = p; }

  static async fromParquet(file: AsyncBuffer, src: PolygonSource, p?: MeshParams): Promise<{ store: CellPolygonStore; timings: Record<string, number> }> {
    const t0 = performance.now();
    const metadata = await parquetMetadataAsync(file);
    let cols: unknown[][] = [];
    await parquetRead({ file, metadata, columns: ["cell_id", "ZIndex", "geometry"], geoparquet: false, utf8: true,
      // the column is a parquet GEOMETRY logical type: keep the raw WKB (hyparquet would build GeoJSON objects)
      parsers: { geometryFromBytes: (b: Uint8Array) => b, geographyFromBytes: (b: Uint8Array) => b } as never,
      onComplete: (rows: unknown[][]) => (cols = rows) });
    const t1 = performance.now();
    const st = new CellPolygonStore(p);
    // group rows by cell, then decode each cell's WKB into one packed Float32 block (pixel xy relative to
    // the cell's min pixel; see below): ~half the memory of per-ring Float64Arrays, and Poly
    // objects (with their scanline caches) only live while a cell is meshed.
    const index = new Map<string, number>();
    const rowsOf: number[][] = [];
    for (let r = 0; r < cols.length; r++) {
      const cid = String(cols[r]![0]);
      let c = index.get(cid);
      if (c === undefined) { c = st.cellIds.length; index.set(cid, c); st.cellIds.push(cid); rowsOf.push([]); }
      rowsOf[c]!.push(r);
    }
    const bb = new Float64Array(4 * st.cellIds.length);
    st.packed = rowsOf.map((rs, c) => {
      const dec = rs.map((r) => ({ z: (Number(cols[r]![1] as number | bigint) + 0.5) * src.zUmPerIndex, parts: wkbPolygons(cols[r]![2] as Uint8Array, 1) }));
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, nf = 0, np = 0, nr = 0;
      for (const d of dec) for (const part of d.parts) {
        np++;
        part.forEach((ring, k) => {
          nr++; nf += ring.length;
          if (k) return;
          for (let i = 0; i < ring.length; i += 2) {
            const x = ring[i]!, y = ring[i + 1]!;
            if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
          }
        });
      }
      if (!np) { x0 = y0 = x1 = y1 = 0; }
      const k = src.xyUmPerPx;
      bb.set([x0 * k, y0 * k, x1 * k, y1 * k], 4 * c);
      // pixel coords relative to the cell's min pixel: whole pixels in practice, so Float32 is exact.
      // A cell where any coord does not round-trip bit-exactly keeps Float64 (output then matches
      // decoding the WKB directly, bit for bit).
      let f32 = true;
      check: for (const d of dec) for (const part of d.parts) for (const ring of part) for (let i = 0; i < ring.length; i += 2) {
        if (Math.fround(ring[i]! - x0) + x0 !== ring[i]! || Math.fround(ring[i + 1]! - y0) + y0 !== ring[i + 1]!) { f32 = false; break check; }
      }
      const P: PackedCell = { ox: x0, oy: y0, scale: k, z: new Float64Array(dec.length), rowPart: new Uint32Array(dec.length + 1),
        partRing: new Uint32Array(np + 1), ringOff: new Uint32Array(nr + 1), xy: f32 ? new Float32Array(nf) : new Float64Array(nf) };
      let pi = 0, ri = 0, f = 0;
      dec.forEach((d, j) => {
        P.z[j] = d.z;
        for (const part of d.parts) {
          for (const ring of part) {
            for (let i = 0; i < ring.length; i += 2) { P.xy[f++] = ring[i]! - x0; P.xy[f++] = ring[i + 1]! - y0; }
            P.ringOff[++ri] = f;
          }
          P.partRing[++pi] = ri;
        }
        P.rowPart[j + 1] = pi;
      });
      return P;
    });
    st.bbox = bb;
    st.labelOf = Int32Array.from(st.cellIds, (c) => src.labelIds[c] ?? 0);
    const t2 = performance.now();
    return { store: st, timings: { parquet_read_ms: t1 - t0, decode_ms: t2 - t1, rows: cols.length, cells: st.cellIds.length, polygon_mb: st.polygonBytes() / 1e6, f64_cells: st.packed.filter((P) => P.xy instanceof Float64Array).length } as Record<string, number> };
  }

  /** Decoded slices of one cell (fresh Poly objects; the loft input). */
  slices(c: number): { z: number; parts: Poly[] }[] {
    const P = this.packed[c]!;
    const out: { z: number; parts: Poly[] }[] = [];
    for (let j = 0; j < P.z.length; j++) {
      const parts: Poly[] = [];
      for (let pi = P.rowPart[j]!; pi < P.rowPart[j + 1]!; pi++) {
        const rings: Float64Array[] = [];
        for (let ri = P.partRing[pi]!; ri < P.partRing[pi + 1]!; ri++) {
          const a = P.ringOff[ri]!, b = P.ringOff[ri + 1]!;
          const r = new Float64Array(b - a);
          for (let i = 0; i < b - a; i += 2) { r[i] = (P.xy[a + i]! + P.ox) * P.scale; r[i + 1] = (P.xy[a + i + 1]! + P.oy) * P.scale; }
          rings.push(r);
        }
        parts.push(makePoly(rings));
      }
      out.push({ z: P.z[j]!, parts });
    }
    return out;
  }

  /** Bytes held by the packed polygons (the store's resident size, excluding the mesh cache). */
  polygonBytes(): number {
    let n = 0;
    for (const P of this.packed) n += P.xy.byteLength + P.z.byteLength + P.rowPart.byteLength + P.partRing.byteLength + P.ringOff.byteLength;
    return n;
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
    m = meshCell(this.slices(c), this.p);
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
