import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { buildSpatialIndex, queryNeighbors } from "./spatial-neighbors.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(
  readFileSync(join(here, "../../../dev/fixture.json"), "utf8"),
);

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

function neighborDigest(neighbors) {
  const sorted = [...neighbors].sort((a, b) => a - b);
  return createHash("sha256").update(sorted.join(",")).digest("hex");
}

const pts = decodePoints(fixture.points_data, fixture.x_bounds, fixture.y_bounds);
const tree = buildSpatialIndex(pts);

// Golden vectors from spatial-neighbors on dev/fixture.json (HF xsmall); do not change without product sign-off.
const GOLDEN = {
  knn_seeds_0_1_2_k12: "2b47950448a5ff40437534e66cfd0fbd65c2ef6c9ffc924e6fb6db117dfea71f",
  radius_seeds_0_1_2: "08c9225d7fca3833c7672d3ea5b138339975d93a7322fafc3e0e176833e698db",
};

test("k-NN neighbor indices match golden hash", () => {
  const seeds = [0, 1, 2];
  const { neighbors } = queryNeighbors(tree, pts, seeds, {
    mode: "knn",
    k: 12,
    edges: false,
  });
  const digest = neighborDigest(neighbors);
  assert.equal(digest, GOLDEN.knn_seeds_0_1_2_k12);
});

test("radius neighbor indices match golden hash", () => {
  const seeds = [0, 1, 2];
  const rMax = Number(fixture.neighbor_radius_max) || 0;
  const r = rMax > 0 ? rMax * 0.35 : 26.401789346775608;
  const { neighbors } = queryNeighbors(tree, pts, seeds, {
    mode: "radius",
    radius: r,
    edges: false,
  });
  const digest = neighborDigest(neighbors);
  assert.equal(digest, GOLDEN.radius_seeds_0_1_2);
});
