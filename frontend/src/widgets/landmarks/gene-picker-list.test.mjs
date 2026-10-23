import assert from "node:assert/strict";
import test from "node:test";

import { filterGeneNamesForPicker, GENE_PICKER_MAX_VISIBLE } from "./gene-picker-list.ts";

test("filterGeneNamesForPicker is search-first", () => {
  const names = ["Aaa", "Bbb", "Ccc"];
  assert.deepEqual(filterGeneNamesForPicker(names, ""), []);
  assert.deepEqual(filterGeneNamesForPicker(names, "  "), []);
});

test("filterGeneNamesForPicker matches prefix and substring", () => {
  const names = ["Muc2", "APOB", "Lgr5"];
  assert.deepEqual(filterGeneNamesForPicker(names, "mu"), ["Muc2"]);
  assert.deepEqual(filterGeneNamesForPicker(names, "gr"), ["Lgr5"]);
  assert.deepEqual(filterGeneNamesForPicker(names, "POB"), ["APOB"]);
});

test("filterGeneNamesForPicker caps visible matches", () => {
  const names = Array.from({ length: 500 }, (_, i) => `G${i}`);
  const out = filterGeneNamesForPicker(names, "G");
  assert.equal(out.length, GENE_PICKER_MAX_VISIBLE);
});

test("filterGeneNamesForPicker scans 18k names quickly", () => {
  const names = Array.from({ length: 18028 }, (_, i) => `SYN_${String(i).padStart(5, "0")}`);
  const t0 = performance.now();
  const out = filterGeneNamesForPicker(names, "syn");
  const ms = performance.now() - t0;
  assert.ok(out.length > 0);
  assert.ok(ms < 100, `expected <100ms, got ${ms.toFixed(1)}ms`);
});
