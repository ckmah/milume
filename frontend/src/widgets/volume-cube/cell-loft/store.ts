/**
 * The cells of a per-slice polygon parquet (a SpatialData shapes element with `cell_id`
 * and `Z_um` columns, geometry WKB in µm), meshed on demand per Inspect window.
 */
import { parquetMetadataAsync, parquetRead } from "hyparquet";

import type { CellMeshData } from "../cell-mesh";
import { type Poly, makePoly } from "./geom";
import { type CellMesh, meshCell } from "./loft";
import { wkbPolygons } from "./wkb";

/** One cell's rings as Float32 offsets from its bbox corner (sub-nm precision, half the memory of Float64). */
type PackedCell = { ox: number; oy: number; z: Float64Array; rowPart: Uint32Array; partRing: Uint32Array; ringOff: Uint32Array; xy: Float32Array };

/** Built cells kept for panning back: ~70 MB of vertices, about two 300 µm windows. */
const CACHE_VERTICES = 2_000_000;

export class CellPolygonStore {
  private cells: PackedCell[] = [];
  private bbox = new Float64Array(0);
  private ids = new Int32Array(0);
  private zStepUm = 0.5;
  private cache = new Map<number, CellMesh>();
  private cacheVertices = 0;

  /** `rows`: each cell's table row (-1 when the table has none), cells in first-appearance order. */
  static async fromParquet(buf: ArrayBuffer, rows: Int32Array): Promise<CellPolygonStore> {
    const file = { byteLength: buf.byteLength, slice: (a: number, b?: number) => buf.slice(a, b) };
    let cols: unknown[][] = [];
    await parquetRead({
      file,
      metadata: await parquetMetadataAsync(file),
      columns: ["cell_id", "Z_um", "geometry"],
      geoparquet: false,
      utf8: true,
      // Raw WKB: hyparquet would otherwise decode a GEOMETRY column to GeoJSON.
      parsers: { geometryFromBytes: (b: Uint8Array) => b, geographyFromBytes: (b: Uint8Array) => b } as never,
      onComplete: (r: unknown[][]) => (cols = r),
    });
    const st = new CellPolygonStore();
    const index = new Map<string, number>();
    const rowsOf: number[][] = [];
    const zs = new Set<number>();
    for (let r = 0; r < cols.length; r++) {
      const cid = String(cols[r]![0]);
      let c = index.get(cid);
      if (c === undefined) {
        c = rowsOf.length;
        index.set(cid, c);
        rowsOf.push([]);
      }
      rowsOf[c]!.push(r);
      zs.add(Number(cols[r]![1]));
    }
    const sorted = [...zs].sort((a, b) => a - b);
    let step = Infinity;
    for (let i = 1; i < sorted.length; i++) step = Math.min(step, sorted[i]! - sorted[i - 1]!);
    if (Number.isFinite(step) && step > 0) st.zStepUm = step;
    st.bbox = new Float64Array(4 * rowsOf.length);
    st.ids = Int32Array.from(rowsOf, (_, c) => (rows[c] ?? -1) + 1);
    st.cells = rowsOf.map((rs, c) => {
      const dec = rs.map((r) => ({ z: Number(cols[r]![1]), parts: wkbPolygons(cols[r]![2] as Uint8Array) }));
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, nf = 0, np = 0, nr = 0;
      for (const d of dec) {
        for (const part of d.parts) {
          np++;
          part.forEach((ring, k) => {
            nr++;
            nf += ring.length;
            if (k) return;
            for (let i = 0; i < ring.length; i += 2) {
              x0 = Math.min(x0, ring[i]!);
              x1 = Math.max(x1, ring[i]!);
              y0 = Math.min(y0, ring[i + 1]!);
              y1 = Math.max(y1, ring[i + 1]!);
            }
          });
        }
      }
      if (!np) x0 = y0 = x1 = y1 = 0;
      st.bbox.set([x0, y0, x1, y1], 4 * c);
      const P: PackedCell = {
        ox: x0,
        oy: y0,
        z: new Float64Array(dec.length),
        rowPart: new Uint32Array(dec.length + 1),
        partRing: new Uint32Array(np + 1),
        ringOff: new Uint32Array(nr + 1),
        xy: new Float32Array(nf),
      };
      let pi = 0, ri = 0, f = 0;
      dec.forEach((d, j) => {
        P.z[j] = d.z;
        for (const part of d.parts) {
          for (const ring of part) {
            for (let i = 0; i < ring.length; i += 2) {
              P.xy[f++] = ring[i]! - x0;
              P.xy[f++] = ring[i + 1]! - y0;
            }
            P.ringOff[++ri] = f;
          }
          P.partRing[++pi] = ri;
        }
        P.rowPart[j + 1] = pi;
      });
      return P;
    });
    return st;
  }

  private slices(c: number): { z: number; parts: Poly[] }[] {
    const P = this.cells[c]!;
    const out: { z: number; parts: Poly[] }[] = [];
    for (let j = 0; j < P.z.length; j++) {
      const parts: Poly[] = [];
      for (let pi = P.rowPart[j]!; pi < P.rowPart[j + 1]!; pi++) {
        const rings: Float64Array[] = [];
        for (let ri = P.partRing[pi]!; ri < P.partRing[pi + 1]!; ri++) {
          const a = P.ringOff[ri]!, b = P.ringOff[ri + 1]!;
          const r = new Float64Array(b - a);
          for (let i = 0; i < b - a; i += 2) {
            r[i] = P.xy[a + i]! + P.ox;
            r[i + 1] = P.xy[a + i + 1]! + P.oy;
          }
          rings.push(r);
        }
        parts.push(makePoly(rings));
      }
      out.push({ z: P.z[j]!, parts });
    }
    return out;
  }

  /** Cells reaching into the window; the cube clips them to it. */
  cellsIn(x0: number, y0: number, x1: number, y1: number): number[] {
    const out: number[] = [];
    const b = this.bbox;
    for (let c = 0; c < this.cells.length; c++) {
      if (b[4 * c]! < x1 && b[4 * c + 2]! > x0 && b[4 * c + 1]! < y1 && b[4 * c + 3]! > y0) out.push(c);
    }
    return out;
  }

  has(c: number): boolean {
    return this.cache.has(c);
  }

  mesh(c: number): CellMesh {
    let m = this.cache.get(c);
    if (m) {
      this.cache.delete(c);
      this.cache.set(c, m);
      return m;
    }
    m = meshCell(this.slices(c), this.zStepUm);
    this.cache.set(c, m);
    this.cacheVertices += m.positions.length / 3;
    for (const [k, v] of this.cache) {
      if (this.cacheVertices <= CACHE_VERTICES) break;
      this.cache.delete(k);
      this.cacheVertices -= v.positions.length / 3;
    }
    return m;
  }

  /** One buffer for the window, positions relative to `origin`. */
  pack(cells: number[], meshes: CellMesh[], origin: [number, number, number]): CellMeshData {
    let nv = 0, ni = 0;
    for (const m of meshes) {
      nv += m.positions.length / 3;
      ni += m.indices.length;
    }
    const positions = new Float32Array(nv * 3), normals = new Float32Array(nv * 3), cellOf = new Uint32Array(nv), indices = new Uint32Array(ni);
    let v = 0, i = 0;
    meshes.forEach((m, k) => {
      const n = m.positions.length / 3;
      for (let a = 0; a < n; a++) {
        positions[3 * (v + a)] = m.positions[3 * a]! - origin[0];
        positions[3 * (v + a) + 1] = m.positions[3 * a + 1]! - origin[1];
        positions[3 * (v + a) + 2] = m.positions[3 * a + 2]! - origin[2];
      }
      normals.set(m.normals, 3 * v);
      cellOf.fill(k, v, v + n);
      for (let b = 0; b < m.indices.length; b++) indices[i + b] = m.indices[b]! + v;
      v += n;
      i += m.indices.length;
    });
    return { originUm: origin, positions, normals, cells: cellOf, indices, ids: Int32Array.from(cells, (c) => this.ids[c]!) };
  }
}
