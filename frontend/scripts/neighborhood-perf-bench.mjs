/**
 * Harness timings for issue #92 PR table (Pyxa small dev/fixture).
 * Run: node frontend/scripts/neighborhood-perf-bench.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";

import { bakeRadiusDistanceField } from "../src/widgets/landmarks/neighborhood-radius-bake.js";
import { buildSpatialIndex, queryNeighbors } from "../src/widgets/landmarks/spatial-neighbors.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(readFileSync(join(here, "../dev/fixture.json"), "utf8"));

function decodePoints(b64, xBounds, yBounds) {
  const raw = Buffer.from(b64, "base64");
  const n = Math.floor(raw.length / 16);
  const data = new Array(n);
  for (let i = 0; i < n; i++) {
    const o = i * 16;
    data[i] = {
      i,
      x: xBounds[0] + ((raw.readFloatLE(o) + 1) / 2) * (xBounds[1] - xBounds[0]),
      y: yBounds[0] + ((raw.readFloatLE(o + 4) + 1) / 2) * (yBounds[1] - yBounds[0]),
    };
  }
  return data;
}

function median(samples) {
  const s = [...samples].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

function bench(fn, iterations = 7) {
  const samples = [];
  for (let i = 0; i < iterations; i++) {
    const t0 = performance.now();
    fn();
    samples.push(performance.now() - t0);
  }
  return median(samples);
}

const pts = decodePoints(fixture.points_data, fixture.x_bounds, fixture.y_bounds);
const tree = buildSpatialIndex(pts);
const rMax = 26.401789346775608;

const seedSizes = [30, 120, 200, 295];
const rows = [];

for (const n of seedSizes) {
  const seeds = Array.from({ length: n }, (_, i) => i);
  const withEdges = bench(() =>
    queryNeighbors(tree, pts, seeds, { mode: "knn", k: 12, edges: true }),
  );
  const noEdges = bench(() =>
    queryNeighbors(tree, pts, seeds, { mode: "knn", k: 12, edges: false }),
  );
  rows.push({
    scenario: `k-NN query (${n} seeds, ${pts.length} pts)`,
    before_ms: withEdges.toFixed(2),
    after_ms: noEdges.toFixed(2),
    note: n > 120 ? "edges off in UI" : "edges on in UI",
  });
}

const radiusSeeds = Array.from({ length: 295 }, (_, i) => i);
const radiusBake = bench(() => bakeRadiusDistanceField(pts, radiusSeeds, rMax));
rows.push({
  scenario: `radius gradient bake (295 seeds)`,
  before_ms: "~512px grid (main inline)",
  after_ms: radiusBake.toFixed(2),
  note: "256px tier (>800 seeds)",
});

console.log(JSON.stringify({ pointCount: pts.length, rows }, null, 2));
