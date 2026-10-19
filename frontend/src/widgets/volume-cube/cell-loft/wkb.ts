/** Polygon / MultiPolygon WKB (Z, M and EWKB flags skipped) as closed flat-xy rings per part. */
export function wkbPolygons(bytes: Uint8Array): Float64Array[][] {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let o = 0;
  const parts: Float64Array[][] = [];
  const geom = () => {
    const le = dv.getUint8(o) === 1; o += 1;
    let type = dv.getUint32(o, le); o += 4;
    let dims = 2;
    if (type & 0x20000000) o += 4; // EWKB SRID
    if (type & 0x80000000) dims++; if (type & 0x40000000) dims++;
    type &= 0xffff;
    if (type >= 1000) { dims += type >= 3000 ? 2 : 1; type %= 1000; }
    const ring = () => {
      const n = dv.getUint32(o, le); o += 4;
      const r = new Float64Array(2 * n);
      for (let i = 0; i < n; i++) { r[2 * i] = dv.getFloat64(o, le); r[2 * i + 1] = dv.getFloat64(o + 8, le); o += 8 * dims; }
      return r;
    };
    if (type === 3) { const nr = dv.getUint32(o, le); o += 4; const rings = []; for (let k = 0; k < nr; k++) rings.push(ring()); if (rings.length) parts.push(rings); }
    else if (type === 6 || type === 7) { const ng = dv.getUint32(o, le); o += 4; for (let k = 0; k < ng; k++) geom(); }
    else throw new Error(`WKB type ${type} not supported`);
  };
  geom();
  return parts;
}
