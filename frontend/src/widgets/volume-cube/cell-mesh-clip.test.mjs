import assert from "node:assert/strict";
import test from "node:test";

import { OPEN, cellMeshClipBox, clipKeeps, keptVertexCount } from "./cell-mesh-clip.ts";

const origin = [100, -50, 2];
const stackZ = [0, 40];
// A 20 µm cube of vertices on a 1 µm grid, window-relative: x, y, z in 0..20.
const grid = [];
for (let x = 0; x <= 20; x++) for (let y = 0; y <= 20; y++) for (let z = 0; z <= 20; z++) grid.push(x, y, z);
const full = [100, 120, -50, -30, 0, 40];

test("uncut z stays open; x and y clip to the shown window", () => {
  const box = cellMeshClipBox({ cut: full, stackZ, originUm: origin });
  assert.deepEqual(box.lo, [0, 0, -OPEN]);
  assert.deepEqual(box.hi, [20, 20, OPEN]);
  assert.equal(keptVertexCount(grid, box), grid.length / 3);
  assert.equal(clipKeeps([20.5, 5, 5], box), false, "spill past the window's x edge is clipped");
});

for (const [axis, lo, hi] of [["x", 0, 1], ["y", 2, 3], ["z", 4, 5]]) {
  const a = { x: 0, y: 1, z: 2 }[axis];
  const off = origin[a];
  test(`${axis} min cut drops the low side only`, () => {
    const cut = [...full];
    cut[lo] = off + 8;
    const box = cellMeshClipBox({ cut, stackZ, originUm: origin });
    const inside = [10, 10, 10];
    const below = [10, 10, 10];
    below[a] = 7.5;
    assert.ok(clipKeeps(inside, box));
    assert.equal(clipKeeps(below, box), false);
    // 13 of 21 grid planes on that axis survive (8..20).
    assert.equal(keptVertexCount(grid, box), (grid.length / 3 / 21) * 13);
  });
  test(`${axis} max cut drops the high side only`, () => {
    const cut = [...full];
    cut[hi] = off + 12;
    const box = cellMeshClipBox({ cut, stackZ, originUm: origin });
    const above = [10, 10, 10];
    above[a] = 12.5;
    assert.ok(clipKeeps([10, 10, 10], box));
    assert.equal(clipKeeps(above, box), false);
    assert.equal(keptVertexCount(grid, box), (grid.length / 3 / 21) * 13);
  });
}

test("a box cut on all six sides keeps only its interior", () => {
  const cut = [origin[0] + 5, origin[0] + 15, origin[1] + 5, origin[1] + 15, origin[2] + 5, origin[2] + 15];
  const box = cellMeshClipBox({ cut, stackZ, originUm: origin });
  assert.equal(keptVertexCount(grid, box), 11 ** 3);
});
