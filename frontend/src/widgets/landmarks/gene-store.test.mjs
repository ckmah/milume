import assert from "node:assert/strict";
import { test } from "node:test";

import { aggregateGeneT, blendGeneSrgb, MAX_RGB_GENES } from "../../../../milume/static/gene-expression-blend.js";
import { createGeneStore, GENE_FETCH_BATCH } from "./gene-store.js";

function slice(name, rows, values, vmin = 0, vmax = 1) {
  return { name, vmin, vmax, rows: Int32Array.from(rows), values: Float32Array.from(values) };
}

/** A fake kernel: each gene g{k} is nonzero at rows k and k+1. */
function harness({ n = 10, budgetBytes, active = [] } = {}) {
  const calls = [];
  const state = { active };
  const store = createGeneStore({
    nObs: () => n,
    activeNames: () => state.active,
    budgetBytes,
    fetchSlices: async (names) => {
      calls.push(names);
      return names.map((name) => {
        const k = Number(name.slice(1));
        return slice(name, [k % n, (k + 1) % n], [0.5, 1]);
      });
    },
  });
  return { store, calls, state };
}

test("ensure fetches each missing gene once, batching and deduping in-flight requests", async () => {
  const { store, calls } = harness();
  const names = Array.from({ length: GENE_FETCH_BATCH + 2 }, (_, k) => `g${k}`);
  await Promise.all([store.ensure(names), store.ensure(["g0", "g1"])]);
  assert.deepEqual(calls.map((c) => c.length), [GENE_FETCH_BATCH, 2]);
  await store.ensure(["g0"]);
  assert.equal(calls.length, 2, "cached genes are not refetched");
  assert.equal(store.stats().lruGenes, names.length);
  assert.deepEqual(store.meta("g3"), { name: "g3", vmin: 0, vmax: 1 });
});

test("only on-screen genes densify, one n_obs column each", async () => {
  const { store, state } = harness({ n: 6, active: ["g2"] });
  await store.ensure(["g1", "g2", "g3"]);
  assert.equal(store.column("g1"), null, "off-screen gene stays sparse");
  assert.deepEqual([...store.column("g2")], [0, 0, 0.5, 1, 0, 0]);
  assert.equal(store.column("g2"), store.column("g2"), "column is reused");
  state.active = ["g3"];
  store.column("g3");
  const stats = store.stats();
  assert.equal(stats.denseColumns, 1, "previous gene's column is released");
  assert.equal(stats.denseBytes, 6 * 4);
});

test("LRU evicts least recently used slices over budget but never an on-screen gene", async () => {
  const perGene = 2 * 4 + 2 * 4;
  const { store, state, calls } = harness({ budgetBytes: perGene * 3, active: ["g0"] });
  await store.ensure(["g0", "g1", "g2"]);
  store.column("g1");
  await store.ensure(["g3", "g4"]);
  const s = store.stats();
  assert.ok(s.lruBytes <= perGene * 3, `lru ${s.lruBytes} within budget`);
  assert.ok(store.has("g0"), "on-screen gene kept");
  assert.ok(!store.has("g2"), "oldest untouched gene evicted");
  assert.ok(s.evictions >= 2);
  state.active = [];
  await store.ensure(["g2"]);
  assert.equal(calls.at(-1)[0], "g2", "evicted gene refetches");
});

test("eager pack is pinned from CSC views and never fetched or evicted", async () => {
  const { store, calls } = harness({ budgetBytes: 1, active: ["a"] });
  store.setEager(
    [{ name: "a", vmin: 1, vmax: 5 }, { name: "b", vmin: 0, vmax: 2 }],
    Int32Array.from([0, 1, 3]),
    Int32Array.from([4, 0, 9]),
    Float32Array.from([0.25, 1, 0.5]),
  );
  await store.ensure(["a", "b"]);
  assert.equal(calls.length, 0);
  assert.deepEqual(store.meta("a"), { name: "a", vmin: 1, vmax: 5 });
  assert.equal(store.column("a")[4], 0.25);
  assert.equal(store.stats().pinnedGenes, 2);
});

test("a failed fetch is reported per gene and clear() drops replies for the old catalog", async () => {
  let release;
  const store = createGeneStore({
    nObs: () => 4,
    activeNames: () => [],
    fetchSlices: (names) =>
      names[0] === "bad"
        ? Promise.reject(new Error("not in the gene catalog"))
        : new Promise((r) => (release = () => r(names.map((n) => slice(n, [0], [1]))))),
  });
  await store.ensure(["bad"]);
  assert.match(store.error("bad"), /catalog/);
  const late = store.ensure(["old"]);
  store.clear();
  release();
  await late;
  assert.equal(store.has("old"), false);
});

test("aggregates combine normalized values: mean, median, max", () => {
  const ts = [0.1, 0.9, 0.2, 0.4, 0.0];
  assert.equal(aggregateGeneT(ts, "max"), 0.9);
  assert.equal(aggregateGeneT(ts, "median"), 0.2);
  assert.ok(Math.abs(aggregateGeneT(ts, "mean") - 0.32) < 1e-9);
  assert.equal(aggregateGeneT([0.2, 0.6, 0.4, 0.8], "median"), 0.5);
});

test("blend: up to three genes per RGB channel, more genes share one aggregate ramp", () => {
  const meta = () => ({ vmin: 0, vmax: 1 });
  const values = { a: 1, b: 0, c: 0, d: 0, e: 0.5 };
  const base = { pointIndex: 0, scaleMode: "independent", log1p: false, metaAt: meta, valueAt: (_i, g) => values[g] };
  assert.equal(MAX_RGB_GENES, 3);
  assert.deepEqual(blendGeneSrgb({ ...base, activeGenes: ["a", "b", "c"] }), [255, 0, 153]);
  const five = ["a", "b", "c", "d", "e"];
  const at = (aggregate) => blendGeneSrgb({ ...base, activeGenes: five, aggregate });
  assert.deepEqual(at("max"), [255, 0, 153]);
  assert.deepEqual(at("mean"), [77, 0, 46]);
  assert.deepEqual(at("median"), [107, 114, 128], "median 0 reads as no expression");
});
