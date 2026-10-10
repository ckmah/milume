import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  LANDMARK_COLORS,
  landmarkStableColor,
} from "../../../../milume/static/landmark-stable-color.js";

describe("landmark-stable-color", () => {
  it("is stable per id and independent of fallback index when id is set", () => {
    const a = landmarkStableColor("vessel", 0);
    const b = landmarkStableColor("vessel", 3);
    assert.equal(a, b);
    assert.ok(LANDMARK_COLORS.includes(a));
  });

  it("uses fallback index only when id is empty", () => {
    assert.equal(landmarkStableColor("", 0), LANDMARK_COLORS[0]);
    assert.equal(landmarkStableColor("", 2), LANDMARK_COLORS[2]);
  });

  it("differs for different ids", () => {
    assert.notEqual(landmarkStableColor("vessel", 0), landmarkStableColor("tumour nest", 0));
  });
});
