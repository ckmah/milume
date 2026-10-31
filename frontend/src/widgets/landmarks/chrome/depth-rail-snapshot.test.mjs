import assert from "node:assert/strict";
import test from "node:test";

import { applyBandSnapshot } from "./depth-rail-snapshot.ts";

test("applyBandSnapshot restores pre-drag band", () => {
  let lo = 40;
  let hi = 55;
  let focus = 50;
  applyBandSnapshot({ lo: 45, hi: 55, focus: 50 }, (next) => {
    lo = next.lo;
    hi = next.hi;
    focus = next.focus;
  });
  assert.equal(lo, 45);
  assert.equal(hi, 55);
  assert.equal(focus, 50);
});
