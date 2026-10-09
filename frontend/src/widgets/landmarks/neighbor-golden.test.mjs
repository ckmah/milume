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

// Golden vectors from spatial-neighbors on dev/fixture (main); do not change without product sign-off.
const GOLDEN = {
  knn_seeds_0_1_2_k12: "1bcfb4d637e6fe262553f25e63b08e7f44d5826831fa89e8b5047e1f94fc8ec0",
  radius_seeds_0_1_2_r26: "6e7742b03f8cf9dd360072806b72d4fcd9d09d913c81d6f6ce93cb593a8cc25a",
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
  const r = 26.401789346775608;
  const { neighbors } = queryNeighbors(tree, pts, seeds, {
    mode: "radius",
    radius: r,
    edges: false,
  });
  const digest = neighborDigest(neighbors);
  assert.equal(digest, GOLDEN.radius_seeds_0_1_2_r26);
});
