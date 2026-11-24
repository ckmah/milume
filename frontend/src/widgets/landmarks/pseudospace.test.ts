import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  PSEUDOSPACE_COLORS,
  pseudospaceField,
  pseudospaceRgb,
  type Cell,
  type Geom,
} from "./pseudospace.ts";

function point(id: string, x: number, y: number): Geom {
  return { id, kind: "point", vertices: [{ x, y }] };
}

function cell(x: number, y: number): Cell {
  return { x, y };
}

describe("pseudospaceField", () => {
  it("places cells at 0, 0.5, and 1 between two landmarks", () => {
    const field = pseudospaceField(
      [cell(0, 0), cell(1, 0), cell(2, 0)],
      [point("a", 0, 0), point("b", 2, 0)],
    );
    assert.ok(field);
    assert.deepEqual(Array.from(field.values), [0, 0.5, 1]);
    assert.equal(field.valueMax, 1);
    const start = PSEUDOSPACE_COLORS.ramp[0]!.rgb;
    const end = PSEUDOSPACE_COLORS.ramp[PSEUDOSPACE_COLORS.ramp.length - 1]!.rgb;
    assert.deepEqual(pseudospaceRgb(0, field.valueMax, true), [...start]);
    assert.deepEqual(pseudospaceRgb(1, field.valueMax, true), [...end]);
  });

  it("returns 0 when the two distances sum to 0", () => {
    const field = pseudospaceField([cell(0, 0)], [point("a", 0, 0), point("b", 0, 0)]);
    assert.ok(field);
    assert.deepEqual(Array.from(field.values), [0]);
  });

  it("returns null with fewer than two landmarks", () => {
    assert.equal(pseudospaceField([cell(0, 0)], []), null);
    assert.equal(pseudospaceField([cell(0, 0)], [point("a", 0, 0)]), null);
  });

  it("picks the consecutive pair with the smaller distance sum", () => {
    const field = pseudospaceField(
      [cell(10.5, 0)],
      [point("a", 0, 0), point("b", 10, 0), point("c", 11, 0)],
    );
    assert.ok(field);
    assert.equal(field.values[0], 1.5);
    assert.equal(field.valueMax, 2);
  });

  it("gives no value outside the span and keeps interior cells", () => {
    const ordered = [point("a", 0, 0), point("b", 10, 0), point("c", 20, 0)];
    const beside = Math.hypot(10, 5);
    const field = pseudospaceField(
      [cell(-10, 0), cell(0, 0), cell(5, 0), cell(10, 5), cell(15, 0), cell(20, 0), cell(30, 0)],
      ordered,
    );
    assert.ok(field);
    assert.equal(field.valueMax, 2);
    const shown = (value: number) => (Number.isFinite(value) ? value : null);
    assert.equal(shown(field.values[0]!), null);
    assert.equal(shown(field.values[1]!), 0);
    assert.equal(shown(field.values[2]!), 0.5);
    assert.equal(shown(field.values[3]!), beside / (beside + 5));
    assert.equal(shown(field.values[4]!), 1.5);
    assert.equal(shown(field.values[5]!), 2);
    assert.equal(shown(field.values[6]!), null);
    assert.deepEqual(pseudospaceRgb(field.values[0]!, field.valueMax, true), [
      ...PSEUDOSPACE_COLORS.neutral.dark,
    ]);
    assert.deepEqual(pseudospaceRgb(field.values[6]!, field.valueMax, false), [
      ...PSEUDOSPACE_COLORS.neutral.light,
    ]);
  });

  it("treats a line the same way: t < 0 beyond the first geometry is outside", () => {
    const line: Geom = {
      id: "line",
      kind: "line",
      vertices: [
        { x: 0, y: -1 },
        { x: 0, y: 1 },
      ],
    };
    const field = pseudospaceField([cell(-4, 0), cell(4, 0)], [line, point("b", 10, 0)]);
    assert.ok(field);
    assert.equal(Number.isFinite(field.values[0]), false);
    assert.equal(field.values[1], 0.4);
  });

  it("paints a non-finite value with the neutral grey", () => {
    const empty = (id: string): Geom => ({ id, kind: "point", vertices: [] });
    const field = pseudospaceField([cell(1, 1)], [empty("a"), empty("b")]);
    assert.ok(field);
    assert.equal(Number.isFinite(field.values[0]), false);
    assert.deepEqual(pseudospaceRgb(field.values[0]!, field.valueMax, true), [
      ...PSEUDOSPACE_COLORS.neutral.dark,
    ]);
    assert.deepEqual(pseudospaceRgb(field.values[0]!, field.valueMax, false), [
      ...PSEUDOSPACE_COLORS.neutral.light,
    ]);
  });
});
