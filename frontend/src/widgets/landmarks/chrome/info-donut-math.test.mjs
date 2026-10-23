import assert from "node:assert/strict";
import { test } from "node:test";

import {
  donutSliceAngles,
  wobbleDonutSlicePath,
} from "./info-donut-math.ts";

test("donutSliceAngles partitions a full circle clockwise from the top", () => {
  const angles = donutSliceAngles(
    [{ key: "c0", value: 25 }, { key: "c1", value: 75 }],
    100,
  );
  assert.equal(angles.length, 2);
  assert.equal(angles[0].startDeg, 90);
  assert.equal(angles[0].endDeg, 90 - 90);
  assert.equal(angles[1].startDeg, 0);
  assert.equal(angles[1].endDeg, -270);
});

test("wobbleDonutSlicePath returns a closed path", () => {
  const d = wobbleDonutSlicePath({
    cx: 100,
    cy: 100,
    innerR: 66,
    outerR: 82,
    startDeg: 90,
    endDeg: 45,
    sliceKey: "c0",
  });
  assert.match(d, /^M /);
  assert.ok(d.endsWith(" Z"));
  assert.ok(d.includes(" L "));
});
