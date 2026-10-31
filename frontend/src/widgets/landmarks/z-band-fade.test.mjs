import { applyZBandAlphaByte } from "./z-band-fade.js";
import assert from "node:assert/strict";
import test from "node:test";

test("applyZBandAlphaByte fades outside the band when active", () => {
  const faded = applyZBandAlphaByte(200, 25, 0, 20, true);
  assert.ok(faded < 200);
  assert.equal(applyZBandAlphaByte(200, 15, 0, 20, true), 200);
  assert.equal(applyZBandAlphaByte(200, 25, 0, 20, false), 200);
});
