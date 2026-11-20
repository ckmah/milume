import assert from "node:assert/strict";
import test from "node:test";

import { cellSizeControl, knownUmPerUnit } from "./layers-size.ts";

test("an unknown scale keeps the raw radius and labels it px", () => {
  const size = cellSizeControl(4, null, [0, 100]);
  assert.equal(size.unit, "px");
  assert.equal(size.caption, "Size");
  assert.equal(size.readout, "4.00 px");
  assert.equal(size.toPointSize(6), 6);
  assert.equal(knownUmPerUnit(undefined), null);
  assert.equal(knownUmPerUnit(0), null);
});

test("a known scale is dot diameter from 1 to 50 µm", () => {
  const size = cellSizeControl(4, 1, [0, 100]);
  assert.equal(size.unit, "µm");
  assert.equal(size.min, 1);
  assert.equal(size.max, 50);
  assert.equal(size.step, 0.5);
  assert.equal(size.value, 8);
  assert.equal(size.readout, "8.0 µm");
  assert.equal(size.toPointSize(10), 5);
  assert.equal(knownUmPerUnit(0.2125), 0.2125);
});

test("diameter clamps into 1 to 50 µm without changing the raw-unit path", () => {
  assert.equal(cellSizeControl(40, 1, [0, 100]).value, 50);
  assert.equal(cellSizeControl(0.1, 1, [0, 100]).value, 1);
  assert.equal(cellSizeControl(0.1, null, [0, 100]).readout, "0.10 px");
});
