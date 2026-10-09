import assert from "node:assert/strict";
import test from "node:test";

import {
  KNN_EDGE_MAX_EDGE_COUNT,
  knnEdgeCapHiddenNote,
  knnEdgesHiddenByCap,
  shouldDrawKnnEdgeLines,
} from "./neighborhood-perf.js";
import { selectionMemberCount } from "./selection-members.js";

const K = 12;
const N_COLON_10K = 10_000;

test("selectionMemberCount ignores out-of-range point_indices", () => {
  const seeds5k = Array.from({ length: 5000 }, (_, i) => i);
  const padded = [...seeds5k, ...Array.from({ length: 4000 }, () => 9_999_999)];
  assert.equal(selectionMemberCount({ point_indices: seeds5k }, N_COLON_10K), 5000);
  assert.equal(selectionMemberCount({ point_indices: padded }, N_COLON_10K), 5000);
  assert.equal(selectionMemberCount({ point_indices: padded }, 5000), 5000);
});

test("k-NN cap at production constant (colon-scale seed counts)", () => {
  const max = KNN_EDGE_MAX_EDGE_COUNT;
  assert.equal(max, 36_000);

  const under2500 = 2500 * K;
  const over3500 = 3500 * K;
  assert.ok(under2500 <= max);
  assert.ok(over3500 > max);

  assert.equal(knnEdgesHiddenByCap("knn", 2500, K), false);
  assert.equal(knnEdgesHiddenByCap("knn", 3500, K), true);
  assert.equal(knnEdgesHiddenByCap("radius", 3500, K), false);
  assert.equal(knnEdgesHiddenByCap("off", 3500, K), false);

  assert.equal(knnEdgeCapHiddenNote("knn", 2500, K), null);
  assert.equal(
    knnEdgeCapHiddenNote("knn", 3500, K),
    "Edge lines hidden for large selections",
  );

  assert.equal(shouldDrawKnnEdgeLines(N_COLON_10K, 2500, under2500), true);
  assert.equal(shouldDrawKnnEdgeLines(N_COLON_10K, 3500, over3500), false);
});

test("cap note uses valid seed count when indices are padded", () => {
  const seeds2500 = Array.from({ length: 2500 }, (_, i) => i);
  const padded = [...seeds2500, ...Array.from({ length: 4000 }, () => 9_999_999)];
  const valid = selectionMemberCount({ point_indices: padded }, N_COLON_10K);
  assert.equal(valid, 2500);
  assert.equal(knnEdgeCapHiddenNote("knn", valid, K), null);
  assert.equal(knnEdgesHiddenByCap("knn", padded.length, K), true);
  assert.equal(knnEdgesHiddenByCap("knn", valid, K), false);
});
