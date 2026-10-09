/** Client-side spatial neighbor queries via @thi.ng/geom-accel (n-D KD-tree). */

import { KdTreeMap } from "@thi.ng/geom-accel";

let scratchSeed = null;
let scratchVisit = null;
let scratchN = 0;

/** Pre-size visit buffers so the first neighborhood query avoids allocation. */
export function warmNeighborQueryScratch(pointCount) {
  ensureScratch(pointCount | 0);
}

function ensureScratch(n) {
  if (!scratchSeed || scratchN < n) {
    scratchN = n;
    scratchSeed = new Uint8Array(n);
    scratchVisit = new Uint8Array(n);
  }
  return { isSeed: scratchSeed, visited: scratchVisit };
}

/**
 * Build a KD-tree over point positions. Values are point indices.
 * @param {Array<{x:number,y:number,z?:number}>} pts
 * @returns {import("@thi.ng/geom-accel").KdTreeMap<number[], number> | null}
 */
export function buildSpatialIndex(pts) {
  if (!pts || !pts.length) return null;
  const dim = pts[0].z != null && Number.isFinite(pts[0].z) ? 3 : 2;
  const pairs = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const key = dim === 3 ? [p.x, p.y, p.z] : [p.x, p.y];
    pairs.push([key, i]);
  }
  return new KdTreeMap(dim, pairs);
}

/**
 * Query knn or radius neighbors of seed indices (seeds themselves excluded).
 * @param {ReturnType<typeof buildSpatialIndex>} tree
 * @param {Array<{x:number,y:number,z?:number}>} pts
 * @param {number[]} seedIdxs
 * @param {{ mode?: string, k?: number, radius?: number, edges?: boolean }} opts
 */
export function queryNeighbors(tree, pts, seedIdxs, opts) {
  const edges = [];
  const neighbors = [];
  if (!tree || !seedIdxs.length || !pts.length) return { edges, neighbors };
  const mode = opts?.mode || "knn";
  const takeK = Math.max(0, opts?.k | 0);
  const radius = Number(opts?.radius) || 0;
  const wantEdges = opts?.edges === true || (opts?.edges !== false && mode === "knn");
  if (mode === "knn" && takeK <= 0) return { edges, neighbors };
  if (mode === "radius" && !(radius > 0)) return { edges, neighbors };

  const dim = tree.dim | 0;
  const n = pts.length;
  const { isSeed, visited } = ensureScratch(n);
  for (let i = 0; i < seedIdxs.length; i++) {
    const si = seedIdxs[i] | 0;
    if (si >= 0 && si < n) isSeed[si] = 1;
  }
  const limit = mode === "knn" ? takeK + 1 : Math.max(n, 1);
  const maxDist = mode === "knn" ? Number.POSITIVE_INFINITY : radius;
  const q2 = dim === 3 ? [0, 0, 0] : [0, 0];

  for (let si = 0; si < seedIdxs.length; si++) {
    const seedIdx = seedIdxs[si] | 0;
    const s = pts[seedIdx];
    if (!s) continue;
    if (dim === 3) {
      q2[0] = s.x;
      q2[1] = s.y;
      q2[2] = s.z ?? 0;
    } else {
      q2[0] = s.x;
      q2[1] = s.y;
    }
    const hits = tree.queryValues(q2, maxDist, limit) || [];
    for (let hi = 0; hi < hits.length; hi++) {
      const j = hits[hi] | 0;
      if (j === seedIdx || isSeed[j]) continue;
      if (!visited[j]) {
        visited[j] = 1;
        neighbors.push(j);
      }
      if (wantEdges) {
        const t = pts[j];
        if (!t) continue;
        edges.push({
          path: [
            [s.x, s.y],
            [t.x, t.y],
          ],
        });
      }
    }
  }

  for (let i = 0; i < neighbors.length; i++) visited[neighbors[i]] = 0;
  for (let i = 0; i < seedIdxs.length; i++) {
    const si = seedIdxs[i] | 0;
    if (si >= 0 && si < n) isSeed[si] = 0;
  }
  return { edges, neighbors };
}
