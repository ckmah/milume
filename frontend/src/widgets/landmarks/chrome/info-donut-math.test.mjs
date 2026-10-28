import assert from "node:assert/strict";
import { test } from "node:test";

import { donutSliceAngles, donutSlicePath } from "./info-donut-math.ts";

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

test("donutSlicePath uses SVG arc commands without polyline wobble", () => {
  const d = donutSlicePath({
    cx: 100,
    cy: 100,
    innerR: 66,
    outerR: 82,
    startDeg: 90,
    endDeg: 45,
  });
  assert.match(d, /^M /);
  assert.ok(d.endsWith(" Z"));
  assert.match(d, /\bA 82 82 0 0 1 /);
  assert.match(d, /\bA 66 66 0 0 0 /);
  assert.equal((d.match(/\bL\b/g) ?? []).length, 1);
});

test("donutSlicePath handles a one-cell slice of two hundred", () => {
  const [{ startDeg, endDeg }] = donutSliceAngles([{ key: "c0", value: 1 }], 200);
  const d = donutSlicePath({
    cx: 100,
    cy: 100,
    innerR: 66,
    outerR: 82,
    startDeg,
    endDeg,
  });
  assert.ok(d.length > 0);
  assert.match(d, /\bA 82 82/);
});
