/**
 * Client-side spatial bin assignment + windowed multi-d aggregation.
 * Hard square bins; each bin's feature is the mean (or composition histogram)
 * of the cells within a soft window of its centre.
 */

import { KdTreeMap } from "@thi.ng/geom-accel";

export const DEFAULT_BIN_SIZE = 8;
export const DEFAULT_WINDOW_RADIUS = 24;

/** @param {number | null | undefined} binSize */
export function defaultWindowRadius(binSize) {
  const s = Number(binSize);
  if (Number.isFinite(s) && s > 0) return s * 3;
  return DEFAULT_WINDOW_RADIUS;
}

/**
 * @param {Float32Array | Float64Array | number[]} xy flat [x0,y0,x1,y1,...] or {x,y}[]
 * @param {number} binSize
 * @param {number} [pad=0]
 */
export function buildGrid(xy, binSize, pad = 0) {
  const size = Number(binSize);
  if (!Number.isFinite(size) || size <= 0) {
    throw new Error("bin_size must be a positive finite number");
  }
  const pts = normalizeXy(xy);
  const n = pts.length >> 1;
  if (n === 0) {
    return { origin_x: 0, origin_y: 0, bin_size: size, n_cols: 1, n_rows: 1 };
  }
  let xmin = Infinity;
  let xmax = -Infinity;
  let ymin = Infinity;
  let ymax = -Infinity;
  for (let i = 0; i < n; i++) {
    const x = pts[i * 2];
    const y = pts[i * 2 + 1];
    if (x < xmin) xmin = x;
    if (x > xmax) xmax = x;
    if (y < ymin) ymin = y;
    if (y > ymax) ymax = y;
  }
  xmin -= pad;
  xmax += pad;
  ymin -= pad;
  ymax += pad;
  let n_cols = Math.max(1, Math.ceil((xmax - xmin) / size));
  let n_rows = Math.max(1, Math.ceil((ymax - ymin) / size));
  if (xmin + n_cols * size <= xmax) n_cols += 1;
  if (ymin + n_rows * size <= ymax) n_rows += 1;
  return {
    origin_x: xmin,
    origin_y: ymin,
    bin_size: size,
    n_cols: n_cols | 0,
    n_rows: n_rows | 0,
  };
}

/**
 * @param {Float32Array | Float64Array | number[]} xy
 * @param {{ origin_x:number, origin_y:number, bin_size:number, n_cols:number, n_rows:number }} grid
 */
export function assignBins(xy, grid) {
  const pts = normalizeXy(xy);
  const n = pts.length >> 1;
  const size = grid.bin_size;
  const flatIds = new Int32Array(n);
  flatIds.fill(-1);
  const compactIds = new Int32Array(n);
  compactIds.fill(-1);

  /** @type {Map<number, number>} */
  const flatToCompact = new Map();
  const compactToFlat = [];
  const rows = [];
  const cols = [];
  const counts = [];

  for (let i = 0; i < n; i++) {
    const col = Math.floor((pts[i * 2] - grid.origin_x) / size);
    const row = Math.floor((pts[i * 2 + 1] - grid.origin_y) / size);
    if (col < 0 || row < 0 || col >= grid.n_cols || row >= grid.n_rows) continue;
    const flat = col + grid.n_cols * row;
    flatIds[i] = flat;
    let c = flatToCompact.get(flat);
    if (c === undefined) {
      c = compactToFlat.length;
      flatToCompact.set(flat, c);
      compactToFlat.push(flat);
      cols.push(col);
      rows.push(row);
      counts.push(0);
    }
    compactIds[i] = c;
    counts[c] += 1;
  }

  return {
    grid,
    flat_ids: flatIds,
    compact_ids: compactIds,
    compact_to_flat: Int32Array.from(compactToFlat),
    rows: Int32Array.from(rows),
    cols: Int32Array.from(cols),
    counts: Int32Array.from(counts),
  };
}

/** World centers of compact bins, flat [cx0,cy0,...]. */
export function binCenters(assignment) {
  const size = assignment.grid.bin_size;
  const ox = assignment.grid.origin_x;
  const oy = assignment.grid.origin_y;
  const n = assignment.counts.length;
  const out = new Float64Array(n * 2);
  for (let i = 0; i < n; i++) {
    out[i * 2] = ox + (assignment.cols[i] + 0.5) * size;
    out[i * 2 + 1] = oy + (assignment.rows[i] + 0.5) * size;
  }
  return out;
}

/**
 * Hard-bin mean. features: Float32Array row-major (n, d).
 * @returns {Float32Array} (n_bins, d)
 */
export function aggregateMean(features, compactIds, nBins, dim) {
  const out = new Float32Array(nBins * dim);
  if (!nBins || !dim) return out;
  const counts = new Float64Array(nBins);
  const n = compactIds.length;
  for (let i = 0; i < n; i++) {
    const b = compactIds[i] | 0;
    if (b < 0 || b >= nBins) continue;
    counts[b] += 1;
    const src = i * dim;
    const dst = b * dim;
    for (let d = 0; d < dim; d++) {
      const v = features[src + d];
      out[dst + d] += Number.isFinite(v) ? v : 0;
    }
  }
  for (let b = 0; b < nBins; b++) {
    const c = counts[b];
    if (!(c > 0)) continue;
    const inv = 1 / c;
    const dst = b * dim;
    for (let d = 0; d < dim; d++) out[dst + d] *= inv;
  }
  return out;
}

/**
 * @param {import("@thi.ng/geom-accel").KdTreeMap<number[], number> | null} tree
 * @param {Float64Array} centers flat
 * @param {number} radius
 * @param {number} nPoints
 * @returns {number[][]}
 */
export function windowMemberLists(tree, centers, radius, nPoints) {
  const nBins = centers.length >> 1;
  /** @type {number[][]} */
  const members = new Array(nBins);
  if (!nBins || !nPoints || !(radius > 0) || !Number.isFinite(radius)) {
    for (let i = 0; i < nBins; i++) members[i] = [];
    return members;
  }
  if (!tree) {
    for (let i = 0; i < nBins; i++) members[i] = [];
    return members;
  }
  const limit = Math.max(nPoints, 1);
  for (let i = 0; i < nBins; i++) {
    const q = [centers[i * 2], centers[i * 2 + 1]];
    members[i] = tree.queryValues(q, radius, limit) || [];
  }
  return members;
}

/**
 * Windowed mean; empty windows fall back to hard-bin mean.
 * @returns {Float32Array}
 */
export function aggregateMeanWindow(
  features,
  compactIds,
  assignment,
  members,
  dim,
) {
  const nBins = assignment.counts.length;
  const hard = aggregateMean(features, compactIds, nBins, dim);
  const out = new Float32Array(nBins * dim);
  for (let b = 0; b < nBins; b++) {
    const idxs = members[b] || [];
    if (!idxs.length) {
      out.set(hard.subarray(b * dim, (b + 1) * dim), b * dim);
      continue;
    }
    const dst = b * dim;
    let count = 0;
    for (const i of idxs) {
      const src = (i | 0) * dim;
      for (let d = 0; d < dim; d++) {
        const v = features[src + d];
        out[dst + d] += Number.isFinite(v) ? v : 0;
      }
      count += 1;
    }
    const inv = 1 / count;
    for (let d = 0; d < dim; d++) out[dst + d] *= inv;
  }
  return out;
}

/**
 * Hard-bin category fractions. codes: Int32Array length n.
 * @returns {Float32Array} (n_bins, n_cats)
 */
export function compositionHist(codes, compactIds, nCats, nBins) {
  const out = new Float32Array(nBins * Math.max(nCats, 0));
  if (!nBins || nCats <= 0) return out;
  const n = compactIds.length;
  for (let i = 0; i < n; i++) {
    const b = compactIds[i] | 0;
    const c = codes[i] | 0;
    if (b < 0 || b >= nBins || c < 0 || c >= nCats) continue;
    out[b * nCats + c] += 1;
  }
  for (let b = 0; b < nBins; b++) {
    let s = 0;
    const off = b * nCats;
    for (let c = 0; c < nCats; c++) s += out[off + c];
    if (!(s > 0)) continue;
    const inv = 1 / s;
    for (let c = 0; c < nCats; c++) out[off + c] *= inv;
  }
  return out;
}

/** Windowed category fractions; empty → hard hist. */
export function compositionHistWindow(codes, compactIds, assignment, members, nCats) {
  const nBins = assignment.counts.length;
  const hard = compositionHist(codes, compactIds, nCats, nBins);
  const out = new Float32Array(nBins * nCats);
  for (let b = 0; b < nBins; b++) {
    const idxs = members[b] || [];
    if (!idxs.length) {
      out.set(hard.subarray(b * nCats, (b + 1) * nCats), b * nCats);
      continue;
    }
    const counts = new Float64Array(nCats);
    let s = 0;
    for (const i of idxs) {
      const c = codes[i | 0] | 0;
      if (c < 0 || c >= nCats) continue;
      counts[c] += 1;
      s += 1;
    }
    const dst = b * nCats;
    if (!(s > 0)) {
      out.set(hard.subarray(dst, dst + nCats), dst);
      continue;
    }
    const inv = 1 / s;
    for (let c = 0; c < nCats; c++) out[dst + c] = counts[c] * inv;
  }
  return out;
}

/**
 * Build KD-tree over flat xy [x0,y0,...]. Values = point indices.
 * @param {Float32Array | Float64Array | number[]} xy
 */
export function buildXyIndex(xy) {
  const pts = normalizeXy(xy);
  const n = pts.length >> 1;
  if (!n) return null;
  /** @type {[number[], number][]} */
  const pairs = new Array(n);
  for (let i = 0; i < n; i++) {
    pairs[i] = [[pts[i * 2], pts[i * 2 + 1]], i];
  }
  return new KdTreeMap(2, pairs);
}

/**
 * Full raster build for one basis.
 *
 * @param {object} opts
 * @param {Float32Array | Float64Array | number[] | Array<{x:number,y:number}>} opts.xy
 * @param {number} opts.binSize
 * @param {number} [opts.windowRadius]
 * @param {import("@thi.ng/geom-accel").KdTreeMap<number[], number> | null} [opts.tree]
 * @param {"genes"|"embedding"|"composition"} opts.basis
 * @param {Float32Array | null} [opts.features] row-major (n,d) for genes/embedding
 * @param {number} [opts.featureDim]
 * @param {string[]} [opts.featureLabels]
 * @param {Int32Array | null} [opts.codes] for composition
 * @param {number} [opts.nCats]
 * @param {string[]} [opts.catLabels]
 */
export function buildRaster(opts) {
  const xy = normalizeXy(opts.xy);
  const n = xy.length >> 1;
  let binSize = Number(opts.binSize);
  if (!Number.isFinite(binSize) || binSize <= 0) binSize = DEFAULT_BIN_SIZE;
  const grid = buildGrid(xy, binSize);
  const assignment = assignBins(xy, grid);
  const nBins = assignment.counts.length;
  let windowRadius = Number(opts.windowRadius);
  if (!(windowRadius > 0) || !Number.isFinite(windowRadius)) {
    windowRadius = defaultWindowRadius(binSize);
  }

  const tree = opts.tree || buildXyIndex(xy);
  const centers = binCenters(assignment);
  const members = windowMemberLists(tree, centers, windowRadius, n);

  const basis = opts.basis || "composition";
  /** @type {Float32Array} */
  let features = new Float32Array(0);
  /** @type {string[]} */
  let labels = [];
  let dim = 0;

  if (basis === "genes" || basis === "embedding") {
    dim = opts.featureDim | 0;
    labels = Array.isArray(opts.featureLabels) ? opts.featureLabels.slice() : [];
    if (dim > 0 && opts.features && opts.features.length >= n * dim) {
      features = aggregateMeanWindow(
        opts.features,
        assignment.compact_ids,
        assignment,
        members,
        dim,
      );
      if (labels.length < dim) {
        for (let i = labels.length; i < dim; i++) labels.push(`f${i}`);
      } else if (labels.length > dim) {
        labels = labels.slice(0, dim);
      }
    } else {
      dim = 0;
      labels = [];
      features = new Float32Array(nBins * 0);
    }
  } else {
    const nCats = opts.nCats | 0;
    labels = Array.isArray(opts.catLabels) ? opts.catLabels.slice() : [];
    if (nCats > 0 && opts.codes && opts.codes.length >= n) {
      features = compositionHistWindow(
        opts.codes,
        assignment.compact_ids,
        assignment,
        members,
        nCats,
      );
      dim = nCats;
    } else {
      dim = 0;
      labels = [];
      features = new Float32Array(0);
    }
  }

  const flatToCompact = new Int32Array(grid.n_cols * grid.n_rows);
  flatToCompact.fill(-1);
  for (let i = 0; i < nBins; i++) {
    const flat = assignment.compact_to_flat[i] | 0;
    if (flat >= 0 && flat < flatToCompact.length) flatToCompact[flat] = i;
  }

  return {
    origin_x: grid.origin_x,
    origin_y: grid.origin_y,
    bin_size: grid.bin_size,
    n_cols: grid.n_cols,
    n_rows: grid.n_rows,
    n_bins: nBins,
    window_radius: windowRadius,
    rows: assignment.rows,
    cols: assignment.cols,
    counts: assignment.counts,
    features,
    feature_dim: dim,
    feature_labels: labels,
    flatToCompact,
    assignment,
  };
}

/** @param {Float32Array | Float64Array | number[] | Array<{x:number,y:number}>} xy */
function normalizeXy(xy) {
  if (!xy) return new Float64Array(0);
  if (ArrayBuffer.isView(xy) || Array.isArray(xy)) {
    if (xy.length && typeof xy[0] === "object" && xy[0] != null && "x" in xy[0]) {
      const n = xy.length;
      const out = new Float64Array(n * 2);
      for (let i = 0; i < n; i++) {
        out[i * 2] = Number(xy[i].x) || 0;
        out[i * 2 + 1] = Number(xy[i].y) || 0;
      }
      return out;
    }
    return xy instanceof Float64Array ? xy : Float64Array.from(xy);
  }
  return new Float64Array(0);
}
