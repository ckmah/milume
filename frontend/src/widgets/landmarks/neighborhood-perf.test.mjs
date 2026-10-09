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
  assert.equal(max, 102_000);

  const under5k = 5000 * K;
  const over9k = 9000 * K;
  assert.ok(under5k < max);
  assert.ok(over9k > max);

  assert.equal(knnEdgesHiddenByCap("knn", 5000, K), false);
  assert.equal(knnEdgesHiddenByCap("knn", 9000, K), true);
  assert.equal(knnEdgesHiddenByCap("radius", 9000, K), false);
  assert.equal(knnEdgesHiddenByCap("off", 9000, K), false);

  assert.equal(knnEdgeCapHiddenNote("knn", 5000, K), null);
  assert.match(knnEdgeCapHiddenNote("knn", 9000, K), /Edges hidden above 102k for speed/);

  assert.equal(shouldDrawKnnEdgeLines(N_COLON_10K, 5000, under5k), true);
  assert.equal(shouldDrawKnnEdgeLines(N_COLON_10K, 9000, over9k), false);
});

test("cap note uses valid seed count when indices are padded", () => {
  const seeds5k = Array.from({ length: 5000 }, (_, i) => i);
  const padded = [...seeds5k, ...Array.from({ length: 4000 }, () => 9_999_999)];
  const valid = selectionMemberCount({ point_indices: padded }, N_COLON_10K);
  assert.equal(valid, 5000);
  assert.equal(knnEdgeCapHiddenNote("knn", valid, K), null);
  assert.equal(knnEdgesHiddenByCap("knn", padded.length, K), true);
  assert.equal(knnEdgesHiddenByCap("knn", valid, K), false);
});
