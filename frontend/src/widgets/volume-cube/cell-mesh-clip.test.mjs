import assert from "node:assert/strict";
import test from "node:test";

import { OPEN, cellMeshClipBox, clipKeeps, keptVertexCount, sliceEntry, slicePlanes } from "./cell-mesh-clip.ts";

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

const win = { x: [100, 120], y: [-50, -30] };

test("slice planes sit exactly on each cut side, and only there", () => {
  // No cut: the window's and the stack's edges are not slice planes.
  assert.deepEqual(slicePlanes(cellMeshClipBox({ cut: full, stackZ, originUm: origin, window: win })), []);
  const cases = [
    [0, 107, "lo", 0, 7],
    [1, 113, "hi", 0, 13],
    [2, -42, "lo", 1, 8],
    [3, -35, "hi", 1, 15],
    [4, 10, "lo", 2, 8],
    [5, 30, "hi", 2, 28],
  ];
  for (const [i, value, side, axis, at] of cases) {
    const cut = [...full];
    cut[i] = value;
    const planes = slicePlanes(cellMeshClipBox({ cut, stackZ, originUm: origin, window: win }));
    assert.deepEqual(planes, [{ axis, side, at }], `cut[${i}] = ${value}`);
  }
  const all = slicePlanes(cellMeshClipBox({ cut: [105, 115, -45, -35, 10, 30], stackZ, originUm: origin, window: win }));
  assert.equal(all.length, 6);
});

test("a ray through a cut side is behind the slice; through the window's edge it is not", () => {
  const cut = [...full];
  cut[5] = 22; // z max cut at 20 µm window-relative
  const box = cellMeshClipBox({ cut, stackZ, originUm: origin, window: win });
  const eyeAbove = [10, 10, 500];
  const hit = sliceEntry(eyeAbove, [10, 10, 5], box);
  assert.deepEqual([hit.axis, hit.side, hit.active], [2, "hi", true]);
  assert.ok(Math.abs(eyeAbove[2] + hit.t * (5 - eyeAbove[2]) - 20) < 1e-9, "enters on the plane z = 20");
  // From the side, through the window's x edge: no slice in front.
  const side = sliceEntry([-500, 10, 10], [5, 10, 10], box);
  assert.deepEqual([side.axis, side.side, side.active], [0, "lo", false]);
});
