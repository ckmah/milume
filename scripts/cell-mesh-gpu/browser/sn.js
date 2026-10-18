// Multi-label surface nets in the browser: WebGPU compute (snWebGPU) and a plain-JS
// CPU fallback with the same kernels (snJS). Exploration only (branch proto-cell-mesh-gpu).
//
// Input: label volume (Uint32Array, z-major [Z][Y][X]) + LUT label id -> compact id (0 = drop).
// Output: positions Float32Array (n*4, xyz µm + label), indices Uint32Array (oriented tris).
// Kernels: compact -> count (per dual cube) -> scan -> place -> qcount -> scan -> emit
// -> smooth (gather from the 6 face-adjacent cubes; no float atomics in WGSL) -> normals.

const WG = 256;

const COMMON = /* wgsl */ `
struct Dims { Z: u32, Y: u32, X: u32, nlut: u32, CZ: u32, CY: u32, CX: u32, ncube: u32,
              sz: f32, sy: f32, sx: f32, lam: f32, tz: f32, ty: f32, tx: f32, nv: u32 };
@group(0) @binding(0) var<uniform> d: Dims;
@group(0) @binding(1) var<storage, read_write> lab: array<u32>;
fn L(z: i32, y: i32, x: i32) -> u32 {
  if (z < 0 || y < 0 || x < 0 || z >= i32(d.Z) || y >= i32(d.Y) || x >= i32(d.X)) { return 0u; }
  return lab[(u32(z) * d.Y + u32(y)) * d.X + u32(x)];
}
fn gid1(g: vec3<u32>, n: vec3<u32>) -> u32 { return g.x + g.y * n.x * ${WG}u; }
fn cubeOf(c: u32) -> vec3<i32> {
  let cz = c / (d.CY * d.CX); let r = c % (d.CY * d.CX);
  return vec3<i32>(i32(cz) - 1, i32(r / d.CX) - 1, i32(r % d.CX) - 1);   // lower-corner voxel
}
fn cubeId(v: vec3<i32>) -> u32 { return (u32(v.x + 1) * d.CY + u32(v.y + 1)) * d.CX + u32(v.z + 1); }
struct Distinct { n: u32, mixed: bool, l: array<u32, 8>, vals: array<u32, 8> };
fn distinct(v: vec3<i32>) -> Distinct {
  var o: Distinct; o.n = 0u; o.mixed = false;
  for (var k = 0u; k < 8u; k++) {
    let val = L(v.x + i32(k >> 2u), v.y + i32((k >> 1u) & 1u), v.z + i32(k & 1u));
    o.vals[k] = val;
    if (val != o.vals[0]) { o.mixed = true; }
    if (val == 0u) { continue; }
    var j = 0u;
    loop { if (j >= o.n || o.l[j] >= val) { break; } j++; }
    if (j < o.n && o.l[j] == val) { continue; }
    var q = o.n; loop { if (q <= j) { break; } o.l[q] = o.l[q - 1u]; q--; }
    o.l[j] = val; o.n++;
  }
  return o;
}
`;

const K_COMPACT = COMMON + /* wgsl */ `
@group(0) @binding(2) var<storage, read> vol: array<u32>;
@group(0) @binding(3) var<storage, read> lut: array<u32>;
@compute @workgroup_size(${WG}) fn main(@builtin(workgroup_id) w: vec3<u32>, @builtin(local_invocation_index) li: u32, @builtin(num_workgroups) n: vec3<u32>) {
  let i = (w.x + w.y * n.x) * ${WG}u + li;
  if (i >= d.Z * d.Y * d.X) { return; }
  let v = vol[i];
  lab[i] = select(0u, lut[min(v, d.nlut - 1u)], v < d.nlut);
}`;

const K_COUNT = COMMON + /* wgsl */ `
@group(0) @binding(2) var<storage, read_write> cnt: array<u32>;
@compute @workgroup_size(${WG}) fn main(@builtin(workgroup_id) w: vec3<u32>, @builtin(local_invocation_index) li: u32, @builtin(num_workgroups) n: vec3<u32>) {
  let c = (w.x + w.y * n.x) * ${WG}u + li;
  if (c >= d.ncube) { return; }
  let o = distinct(cubeOf(c));
  cnt[c] = select(0u, o.n, o.mixed);
}`;

// Forward edges of voxel v (the cube's lower corner), quads per non-zero side.
const EDGE_FNS = /* wgsl */ `
fn nb(v: vec3<i32>, ax: u32) -> vec3<i32> { return v + vec3<i32>(i32(ax == 0u), i32(ax == 1u), i32(ax == 2u)); }
fn Lv(v: vec3<i32>) -> u32 { return L(v.x, v.y, v.z); }
`;
const K_QCOUNT = COMMON + EDGE_FNS + /* wgsl */ `
@group(0) @binding(2) var<storage, read_write> qc: array<u32>;
@compute @workgroup_size(${WG}) fn main(@builtin(workgroup_id) w: vec3<u32>, @builtin(local_invocation_index) li: u32, @builtin(num_workgroups) n: vec3<u32>) {
  let c = (w.x + w.y * n.x) * ${WG}u + li;
  if (c >= d.ncube) { return; }
  let v = cubeOf(c); let a = Lv(v); var s = 0u;
  for (var ax = 0u; ax < 3u; ax++) { let b = Lv(nb(v, ax)); if (a != b) { s += u32(a > 0u) + u32(b > 0u); } }
  qc[c] = s;
}`;

const K_PLACE = COMMON + /* wgsl */ `
@group(0) @binding(2) var<storage, read_write> cnt: array<u32>;
@group(0) @binding(3) var<storage, read_write> base: array<u32>;
@group(0) @binding(4) var<storage, read_write> P: array<vec4<f32>>;
@group(0) @binding(5) var<storage, read_write> VC: array<u32>;
const E = array<vec2<u32>, 12>(vec2(0u,1u),vec2(2u,3u),vec2(4u,5u),vec2(6u,7u),vec2(0u,2u),vec2(1u,3u),vec2(4u,6u),vec2(5u,7u),vec2(0u,4u),vec2(1u,5u),vec2(2u,6u),vec2(3u,7u));
fn off(k: u32) -> vec3<f32> { return vec3<f32>(f32(k >> 2u), f32((k >> 1u) & 1u), f32(k & 1u)); }
@compute @workgroup_size(${WG}) fn main(@builtin(workgroup_id) w: vec3<u32>, @builtin(local_invocation_index) li: u32, @builtin(num_workgroups) n: vec3<u32>) {
  let c = (w.x + w.y * n.x) * ${WG}u + li;
  if (c >= d.ncube || cnt[c] == 0u) { return; }
  let v = cubeOf(c); let o = distinct(v); let b = base[c];
  for (var r = 0u; r < o.n; r++) {
    let lc = o.l[r]; var s = vec3<f32>(0.0); var m = 0.0;
    for (var e = 0u; e < 12u; e++) {
      let i = E[e].x; let j = E[e].y;
      if (o.vals[i] != o.vals[j] && (o.vals[i] == lc || o.vals[j] == lc)) { s += 0.5 * (off(i) + off(j)); m += 1.0; }
    }
    let p = vec3<f32>(f32(v.x), f32(v.y), f32(v.z)) + s / m;   // voxel index space (zyx), centre of voxel i at i
    P[b + r] = vec4<f32>(p, bitcast<f32>(lc));
    VC[b + r] = c;
  }
}`;

const K_EMIT = COMMON + EDGE_FNS + /* wgsl */ `
@group(0) @binding(2) var<storage, read_write> cnt: array<u32>;
@group(0) @binding(3) var<storage, read_write> base: array<u32>;
@group(0) @binding(4) var<storage, read_write> qoff: array<u32>;
@group(0) @binding(5) var<storage, read_write> P: array<vec4<f32>>;
@group(0) @binding(6) var<storage, read_write> idx: array<u32>;
fn vid(cv: vec3<i32>, lc: u32) -> u32 {
  let o = distinct(cv); var r = 0u;
  loop { if (o.l[r] == lc) { break; } r++; }
  return base[cubeId(cv)] + r;
}
@compute @workgroup_size(${WG}) fn main(@builtin(workgroup_id) w: vec3<u32>, @builtin(local_invocation_index) li: u32, @builtin(num_workgroups) n: vec3<u32>) {
  let c = (w.x + w.y * n.x) * ${WG}u + li;
  if (c >= d.ncube) { return; }
  if (cnt[c] == 0xffffffffu) { return; }   // keeps binding 2 in the auto layout
  let v = cubeOf(c); let a = Lv(v); var q = qoff[c];
  for (var ax = 0u; ax < 3u; ax++) {
    let b = Lv(nb(v, ax));
    if (a == b) { continue; }
    var o1 = 1u; var o2 = 2u; if (ax == 1u) { o1 = 0u; } if (ax == 2u) { o1 = 0u; o2 = 1u; }
    for (var side = 0u; side < 2u; side++) {
      let lc = select(b, a, side == 0u);
      if (lc == 0u) { continue; }
      var ids: array<u32, 4>;
      for (var k = 0u; k < 4u; k++) {
        let d1 = i32(k >= 2u); let d2 = i32(k == 1u || k == 2u);
        var cv = v; cv[o1] -= d1; cv[o2] -= d2;
        ids[k] = vid(cv, lc);
      }
      // orient: normal of (0,1,2) along +ax for side 0 (a inside), -ax for side 1
      let p0 = P[ids[0]].xyz; let nrm = cross(P[ids[1]].xyz - p0, P[ids[2]].xyz - p0);
      let want = select(-1.0, 1.0, side == 0u);
      // index space is zyx; output is xyz (an odd permutation), so the test flips sign
      let flip = nrm[ax] * want > 0.0;
      let i1 = select(ids[1], ids[2], flip); let i2 = select(ids[2], ids[1], flip);
      let j1 = select(ids[2], ids[3], flip); let j2 = select(ids[3], ids[2], flip);
      idx[6u * q + 0u] = ids[0]; idx[6u * q + 1u] = i1; idx[6u * q + 2u] = i2;
      idx[6u * q + 3u] = ids[0]; idx[6u * q + 4u] = j1; idx[6u * q + 5u] = j2;
      q++;
    }
  }
}`;

// Smoothing by gather: neighbours of vertex (cube, label) = same-label vertices of the 6 face-adjacent cubes.
const K_SMOOTH = COMMON + /* wgsl */ `
@group(0) @binding(2) var<storage, read_write> cnt: array<u32>;
@group(0) @binding(3) var<storage, read_write> base: array<u32>;
@group(0) @binding(4) var<storage, read_write> Pin: array<vec4<f32>>;
@group(0) @binding(5) var<storage, read_write> Pout: array<vec4<f32>>;
@group(0) @binding(6) var<storage, read_write> VC: array<u32>;
fn find(cv: vec3<i32>, lc: u32) -> i32 {
  if (cv.x < -1 || cv.y < -1 || cv.z < -1 || cv.x >= i32(d.CZ) - 1 || cv.y >= i32(d.CY) - 1 || cv.z >= i32(d.CX) - 1) { return -1; }
  let id = cubeId(cv);
  if (cnt[id] == 0u) { return -1; }
  let o = distinct(cv);
  for (var r = 0u; r < o.n; r++) { if (o.l[r] == lc) { return i32(base[id] + r); } }
  return -1;
}
@compute @workgroup_size(${WG}) fn main(@builtin(workgroup_id) w: vec3<u32>, @builtin(local_invocation_index) li: u32, @builtin(num_workgroups) n: vec3<u32>) {
  let i = (w.x + w.y * n.x) * ${WG}u + li;
  if (i >= d.nv) { return; }
  let p = Pin[i]; let lc = bitcast<u32>(p.w); let v = cubeOf(VC[i]);
  var s = vec3<f32>(0.0); var m = 0.0;
  for (var k = 0u; k < 6u; k++) {
    var cv = v; let ax = k >> 1u; cv[ax] += select(-1, 1, (k & 1u) == 1u);
    let j = find(cv, lc);
    if (j >= 0) { s += Pin[u32(j)].xyz; m += 1.0; }
  }
  var q = p.xyz;
  if (m > 0.0) { q = p.xyz + d.lam * (s / m - p.xyz); }
  Pout[i] = vec4<f32>(q, p.w);
}`;

// To µm xyz (+ label in w) and a normal from the occupancy gradient of the vertex's cube.
const K_FINAL = COMMON + /* wgsl */ `
@group(0) @binding(2) var<storage, read_write> Pin: array<vec4<f32>>;
@group(0) @binding(3) var<storage, read_write> VC: array<u32>;
@group(0) @binding(4) var<storage, read_write> Pout: array<vec4<f32>>;
@group(0) @binding(5) var<storage, read_write> N: array<u32>;   // packed snorm8x4
@compute @workgroup_size(${WG}) fn main(@builtin(workgroup_id) w: vec3<u32>, @builtin(local_invocation_index) li: u32, @builtin(num_workgroups) n: vec3<u32>) {
  let i = (w.x + w.y * n.x) * ${WG}u + li;
  if (i >= d.nv) { return; }
  let p = Pin[i]; let lc = bitcast<u32>(p.w); let v = cubeOf(VC[i]);
  var g = vec3<f32>(0.0);
  for (var k = 0u; k < 8u; k++) {
    let o = vec3<i32>(i32(k >> 2u), i32((k >> 1u) & 1u), i32(k & 1u));
    if (L(v.x + o.x, v.y + o.y, v.z + o.z) == lc) { g += vec3<f32>(o) - vec3<f32>(0.5); }
  }
  let s = vec3<f32>(d.sz, d.sy, d.sx);
  let um = (p.xyz + vec3<f32>(0.5)) * s + vec3<f32>(d.tz, d.ty, d.tx);
  Pout[i] = vec4<f32>(um.z, um.y, um.x, p.w);
  var gn = -vec3<f32>(g.z / d.sx, g.y / d.sy, g.x / d.sz);
  let l = length(gn); if (l > 0.0) { gn = gn / l; }
  N[i] = pack4x8snorm(vec4<f32>(gn, 0.0));
}`;

const K_SCAN = /* wgsl */ `
@group(0) @binding(0) var<storage, read_write> data: array<u32>;
@group(0) @binding(1) var<storage, read_write> sums: array<u32>;
@group(0) @binding(2) var<uniform> len: vec4<u32>;
var<workgroup> sh: array<u32, ${WG}>;
@compute @workgroup_size(${WG}) fn main(@builtin(workgroup_id) w: vec3<u32>, @builtin(local_invocation_index) li: u32, @builtin(num_workgroups) n: vec3<u32>) {
  let blk = w.x + w.y * n.x; let i = blk * ${WG}u + li;
  let x = select(0u, data[i], i < len.x);
  sh[li] = x; workgroupBarrier();
  for (var o = 1u; o < ${WG}u; o <<= 1u) {
    var t = 0u; if (li >= o) { t = sh[li - o]; }
    workgroupBarrier(); sh[li] += t; workgroupBarrier();
  }
  if (i < len.x) { data[i] = sh[li] - x; }   // exclusive
  if (li == ${WG - 1}u) { sums[blk] = sh[li]; }
}`;
const K_ADD = /* wgsl */ `
@group(0) @binding(0) var<storage, read_write> data: array<u32>;
@group(0) @binding(1) var<storage, read_write> sums: array<u32>;
@group(0) @binding(2) var<uniform> len: vec4<u32>;
@compute @workgroup_size(${WG}) fn main(@builtin(workgroup_id) w: vec3<u32>, @builtin(local_invocation_index) li: u32, @builtin(num_workgroups) n: vec3<u32>) {
  let blk = w.x + w.y * n.x; let i = blk * ${WG}u + li;
  if (i < len.x) { data[i] += sums[blk]; }
}`;

function grid(n) {
  const groups = Math.ceil(n / WG);
  const x = Math.min(groups, 65535);
  return [x, Math.ceil(groups / x)];
}

export async function snWebGPU(device, vol, dims, lut, opt = {}) {
  const t0 = performance.now();
  const [Z, Y, X] = dims;
  const CZ = Z + 1, CY = Y + 1, CX = X + 1, ncube = CZ * CY * CX;
  const S = opt.scale, T = opt.trans, iters = opt.smoothIters ?? 2;
  const SB = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST;
  const buf = (bytes, usage = SB) => device.createBuffer({ size: Math.max(16, Math.ceil(bytes / 16) * 16), usage });
  const pipes = opt._pipes ?? (opt._pipes = {});
  const pipe = (name, code) => pipes[name] ?? (pipes[name] = device.createComputePipeline({ layout: "auto", compute: { module: device.createShaderModule({ code }), entryPoint: "main" } }));
  const dimsBuf = buf(64, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST);
  const writeDims = (nv, lam) => {
    const ab = new ArrayBuffer(64); const u = new Uint32Array(ab); const f = new Float32Array(ab);
    u.set([Z, Y, X, lut.length, CZ, CY, CX, ncube]); f.set([S[0], S[1], S[2], lam], 8); f.set([T[0], T[1], T[2]], 12); u[15] = nv;
    device.queue.writeBuffer(dimsBuf, 0, ab);
  };
  const run = (name, code, n, buffers) => {
    const p = pipe(name, code);
    const bg = device.createBindGroup({ layout: p.getBindGroupLayout(0), entries: buffers.map((b, i) => ({ binding: i, resource: { buffer: b } })) });
    const enc = device.createCommandEncoder(); const pass = enc.beginComputePass();
    pass.setPipeline(p); pass.setBindGroup(0, bg); pass.dispatchWorkgroups(...grid(n)); pass.end();
    device.queue.submit([enc.finish()]);
  };
  const scan = (data, n) => {   // exclusive, in place; returns nothing (total read separately)
    const blocks = Math.ceil(n / WG);
    const sums = buf(blocks * 4);
    const lenBuf = buf(16, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST);
    device.queue.writeBuffer(lenBuf, 0, new Uint32Array([n, 0, 0, 0]));
    run("scan", K_SCAN, n, [data, sums, lenBuf]);
    if (blocks > 1) {
      scan(sums, blocks);
      run("add", K_ADD, n, [data, sums, lenBuf]);
    }
  };
  const readU32 = async (b, offset, count) => {
    const rb = device.createBuffer({ size: Math.ceil(count * 4 / 4) * 4 + 4, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
    const enc = device.createCommandEncoder(); enc.copyBufferToBuffer(b, offset, rb, 0, count * 4); device.queue.submit([enc.finish()]);
    await rb.mapAsync(GPUMapMode.READ); const out = new Uint32Array(rb.getMappedRange().slice(0, count * 4)); rb.unmap(); rb.destroy(); return out;
  };
  const tm = {};
  writeDims(0, 0);
  const volBuf = buf(vol.byteLength); device.queue.writeBuffer(volBuf, 0, vol);
  const lutBuf = buf(lut.byteLength); device.queue.writeBuffer(lutBuf, 0, lut);
  const labBuf = buf(Z * Y * X * 4);
  const t1 = performance.now(); tm.upload = t1 - t0;
  run("compact", K_COMPACT, Z * Y * X, [dimsBuf, labBuf, volBuf, lutBuf]);
  const cnt = buf(ncube * 4), base = buf(ncube * 4), qc = buf(ncube * 4);
  run("count", K_COUNT, ncube, [dimsBuf, labBuf, cnt]);
  run("qcount", K_QCOUNT, ncube, [dimsBuf, labBuf, qc]);
  { const enc = device.createCommandEncoder(); enc.copyBufferToBuffer(cnt, 0, base, 0, ncube * 4); device.queue.submit([enc.finish()]); }
  const lastC = await readU32(cnt, (ncube - 1) * 4, 1), lastQ = await readU32(qc, (ncube - 1) * 4, 1);
  scan(base, ncube); scan(qc, ncube);
  const nv = (await readU32(base, (ncube - 1) * 4, 1))[0] + lastC[0];
  const nq = (await readU32(qc, (ncube - 1) * 4, 1))[0] + lastQ[0];
  writeDims(nv, 0);
  const P = buf(nv * 16), P2 = buf(nv * 16), VC = buf(nv * 4), idx = buf(nq * 24), N = buf(nv * 4);
  run("place", K_PLACE, ncube, [dimsBuf, labBuf, cnt, base, P, VC]);
  run("emit", K_EMIT, ncube, [dimsBuf, labBuf, cnt, base, qc, P, idx]);
  let a = P, b = P2;
  for (let it = 0; it < iters; it++) {
    for (const lam of [opt.lam ?? 0.5, opt.mu ?? -0.53]) {
      writeDims(nv, lam);
      run("smooth", K_SMOOTH, nv, [dimsBuf, labBuf, cnt, base, a, b, VC]);
      [a, b] = [b, a];
    }
  }
  writeDims(nv, 0);
  run("final", K_FINAL, nv, [dimsBuf, labBuf, a, VC, b, N]);
  await device.queue.onSubmittedWorkDone();
  const t2 = performance.now(); tm.compute = t2 - t1;
  let positions = null, indices = null, normals = null;
  if (opt.readback !== false) {
    positions = new Float32Array((await readU32(b, 0, nv * 4)).buffer);
    indices = await readU32(idx, 0, nq * 6);
    normals = new Int8Array((await readU32(N, 0, nv)).buffer);
  }
  tm.readback = performance.now() - t2;
  tm.total = performance.now() - t0;
  for (const x of [volBuf, lutBuf, labBuf, cnt, base, qc, P, P2, VC, idx, N, dimsBuf]) x.destroy();
  return { nv, nq, ntri: nq * 2, positions, indices, normals, timings: tm };
}

// ---------- plain-JS CPU fallback: same kernels, single thread ----------
export function snJS(vol, dims, lut, opt = {}) {
  const t0 = performance.now();
  const [Z, Y, X] = dims; const CZ = Z + 1, CY = Y + 1, CX = X + 1, ncube = CZ * CY * CX;
  const S = opt.scale, T = opt.trans, iters = opt.smoothIters ?? 2;
  // padded compact labels
  const PZ = Z + 2, PY = Y + 2, PX = X + 2;
  const lab = new Uint32Array(PZ * PY * PX);
  const nl = lut.length;
  for (let z = 0; z < Z; z++) for (let y = 0; y < Y; y++) {
    let i = (z * Y + y) * X, o = ((z + 1) * PY + y + 1) * PX + 1;
    for (let x = 0; x < X; x++, i++, o++) { const v = vol[i]; lab[o] = v < nl ? lut[v] : 0; }
  }
  const OFF = [0, 1, PX, PX + 1, PY * PX, PY * PX + 1, PY * PX + PX, PY * PX + PX + 1];
  const buf = new Uint32Array(8), vals = new Uint32Array(8);
  const distinct = (o) => {   // o = padded index of cube's lower corner (== cube id in padded coords)
    let n = 0, mixed = false; const f = lab[o];
    for (let k = 0; k < 8; k++) {
      const v = lab[o + OFF[k]]; vals[k] = v;
      if (v !== f) mixed = true;
      if (v === 0) continue;
      let j = 0; while (j < n && buf[j] < v) j++;
      if (j < n && buf[j] === v) continue;
      for (let q = n; q > j; q--) buf[q] = buf[q - 1];
      buf[j] = v; n++;
    }
    return mixed ? n : 0;
  };
  // cube (cz,cy,cx) has lower corner at padded voxel (cz,cy,cx): padded index == cube padded index
  const cubeIdx = (pi) => pi;   // we index cubes on the padded grid (unused last layer stays 0)
  const base = new Uint32Array(PZ * PY * PX);
  let nv = 0;
  for (let cz = 0; cz < CZ; cz++) for (let cy = 0; cy < CY; cy++) {
    let o = (cz * PY + cy) * PX;
    for (let cx = 0; cx < CX; cx++, o++) { base[o] = nv; nv += distinct(o); }
  }
  const P = new Float32Array(nv * 3), VL = new Uint32Array(nv);
  const E = [0, 1, 2, 3, 4, 5, 6, 7, 0, 2, 1, 3, 4, 6, 5, 7, 0, 4, 1, 5, 2, 6, 3, 7];
  const ox = [0, 1, 0, 1, 0, 1, 0, 1], oy = [0, 0, 1, 1, 0, 0, 1, 1], oz = [0, 0, 0, 0, 1, 1, 1, 1];
  for (let cz = 0; cz < CZ; cz++) for (let cy = 0; cy < CY; cy++) {
    let o = (cz * PY + cy) * PX;
    for (let cx = 0; cx < CX; cx++, o++) {
      const n = distinct(o); if (!n) continue;
      const b = base[o];
      for (let r = 0; r < n; r++) {
        const c = buf[r]; let sz = 0, sy = 0, sx = 0, m = 0;
        for (let e = 0; e < 12; e++) {
          const i = E[2 * e], j = E[2 * e + 1];
          if (vals[i] !== vals[j] && (vals[i] === c || vals[j] === c)) { sz += oz[i] + oz[j]; sy += oy[i] + oy[j]; sx += ox[i] + ox[j]; m++; }
        }
        P[3 * (b + r)] = cz + 0.5 * sz / m; P[3 * (b + r) + 1] = cy + 0.5 * sy / m; P[3 * (b + r) + 2] = cx + 0.5 * sx / m;
        VL[b + r] = c;
      }
    }
  }
  const vid = (o, c) => { distinct(o); let r = 0; while (buf[r] !== c) r++; return base[o] + r; };
  const quads = []; const dirs = [];
  const stride = [PY * PX, PX, 1];
  for (let z = 0; z < CZ; z++) for (let y = 0; y < CY; y++) {
    let o = (z * PY + y) * PX;
    for (let x = 0; x < CX; x++, o++) {
      const a = lab[o];
      for (let ax = 0; ax < 3; ax++) {
        const b = lab[o + stride[ax]];
        if (a === b) continue;
        const s1 = stride[ax === 0 ? 1 : 0], s2 = stride[ax === 2 ? 1 : 2];
        for (let side = 0; side < 2; side++) {
          const c = side === 0 ? a : b; if (!c) continue;
          quads.push(vid(o, c), vid(o - s2, c), vid(o - s1 - s2, c), vid(o - s1, c));
          dirs.push(2 * ax + side);
        }
      }
    }
  }
  const nq = dirs.length;
  const Q = Uint32Array.from(quads);
  // Taubin over quad edges (as the numba version)
  if (iters) {
    const deg = new Float32Array(nv); for (let i = 0; i < Q.length; i++) deg[Q[i]] += 2;
    const acc = new Float32Array(nv * 3);
    for (let it = 0; it < iters; it++) for (const f of [opt.lam ?? 0.5, opt.mu ?? -0.53]) {
      acc.fill(0);
      for (let q = 0; q < nq; q++) for (let k = 0; k < 4; k++) {
        const i = Q[4 * q + k], j = Q[4 * q + ((k + 1) & 3)];
        acc[3 * i] += P[3 * j]; acc[3 * i + 1] += P[3 * j + 1]; acc[3 * i + 2] += P[3 * j + 2];
        acc[3 * j] += P[3 * i]; acc[3 * j + 1] += P[3 * i + 1]; acc[3 * j + 2] += P[3 * i + 2];
      }
      for (let i = 0; i < nv; i++) if (deg[i] > 0) for (let d = 0; d < 3; d++) P[3 * i + d] += f * (acc[3 * i + d] / deg[i] - P[3 * i + d]);
    }
  }
  // µm xyz (padded index p -> voxel p-1 -> centre (p - 0.5) * s + t)
  const pos = new Float32Array(nv * 3);
  for (let i = 0; i < nv; i++) {
    pos[3 * i] = (P[3 * i + 2] - 0.5) * S[2] + T[2]; pos[3 * i + 1] = (P[3 * i + 1] - 0.5) * S[1] + T[1]; pos[3 * i + 2] = (P[3 * i] - 0.5) * S[0] + T[0];
  }
  const idx = new Uint32Array(nq * 6); const nrm = new Float32Array(nv * 3);
  for (let q = 0; q < nq; q++) {
    const ax = dirs[q] >> 1, sgn = (dirs[q] & 1) ? -1 : 1, comp = 2 - ax;
    for (let h = 0; h < 2; h++) {
      let i0 = Q[4 * q], i1 = Q[4 * q + 1 + h], i2 = Q[4 * q + 2 + h];
      const ux = pos[3 * i1] - pos[3 * i0], uy = pos[3 * i1 + 1] - pos[3 * i0 + 1], uz = pos[3 * i1 + 2] - pos[3 * i0 + 2];
      const vx = pos[3 * i2] - pos[3 * i0], vy = pos[3 * i2 + 1] - pos[3 * i0 + 1], vz = pos[3 * i2 + 2] - pos[3 * i0 + 2];
      let n = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
      if (n[comp] * sgn < 0) { const t = i1; i1 = i2; i2 = t; n = n.map((v) => -v); }
      idx.set([i0, i1, i2], 6 * q + 3 * h);
      for (const i of [i0, i1, i2]) { nrm[3 * i] += n[0]; nrm[3 * i + 1] += n[1]; nrm[3 * i + 2] += n[2]; }
    }
  }
  return { nv, nq, ntri: 2 * nq, positions: pos, indices: idx, vertLabel: VL, timings: { total: performance.now() - t0 } };
}
