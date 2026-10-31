import assert from "node:assert/strict";
import test from "node:test";

import {
  formatDepthRailDragReadout,
  formatDepthRailUmWhole,
} from "./depth-rail-format.ts";

test("formatDepthRailUmWhole rounds to integer µm labels", () => {
  assert.equal(formatDepthRailUmWhole(67.04), "67");
  assert.equal(formatDepthRailUmWhole(10.2), "10");
  assert.equal(formatDepthRailUmWhole(51.7), "52");
});

test("formatDepthRailDragReadout uses whole µm for asymmetric band during drag", () => {
  const line = formatDepthRailDragReadout(67.04, 51.7, 72.0);
  assert.equal(line.main, "67 ± 10");
  assert.equal(line.subLo, "52");
  assert.equal(line.subHi, "72");
});
