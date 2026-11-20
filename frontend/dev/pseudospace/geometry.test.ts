import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { distanceToGeometry, orderLandmarks, profileBins, pseudospaceField } from "./geometry.ts";
import { sceneFromState } from "./scene.ts";
import { landmarkId, type Cell, type Landmark } from "./types.ts";

function cell(index: number, x: number, y: number): Cell {
  return { index, x, y, category: "a", band: "low", gene: index };
}

function point(id: string, x: number, y: number): Landmark {
  return { id: landmarkId(id), label: id, kind: "point", vertices: [{ x, y }] };
}

test("pseudospace is the between-landmark ratio, not a path offset", () => {
  const cells = [cell(0, 0, 0), cell(1, 10, 0), cell(2, 20, 0)];
  const field = pseudospaceField(cells, [point("a", 0, 0), point("b", 20, 0)]);
  assert.ok(field);
  assert.equal(field.method, "knn-graph");
  assert.equal(field.valueMax, 1);
  assert.ok(field.byIndex[0].value < 0.05);
  assert.ok(Math.abs(field.byIndex[1].value - 0.5) < 0.08);
  assert.ok(field.byIndex[2].value > 0.95);
  assert.equal("offset" in field.byIndex[0], false);
  assert.ok(field.byIndex[0].distances[0] < field.byIndex[2].distances[0]);
});

test("a cell on a shape edge is closer to that shape than a far cell", () => {
  const shape: Landmark = {
    id: landmarkId("shape"),
    label: "shape",
    kind: "shape",
    vertices: [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ],
  };
  assert.ok(distanceToGeometry(5, 0, shape) < 1e-6);
  assert.ok(distanceToGeometry(5, 40, shape) > 20);
});

test("each cell takes the consecutive pair with the smaller distance sum", () => {
  const cells = [cell(0, 0, 0), cell(1, 30, 0)];
  const field = pseudospaceField(cells, [point("a", 0, 0), point("b", 10, 0), point("c", 40, 0)]);
  assert.ok(field);
  assert.equal(field.byIndex[0].pair, 0);
  assert.equal(field.byIndex[1].pair, 1);
  assert.ok(field.byIndex[1].value > 1);
  assert.ok(field.byIndex[1].value < 2);
});

test("fixture scene shades a shape and a line with real Aldoc", () => {
  const raw = JSON.parse(readFileSync(new URL("../fixture.json", import.meta.url), "utf8")) as Record<string, unknown>;
  const scene = sceneFromState(raw);
  const shape = scene.landmarks.find((landmark) => landmark.id === "harness-shape");
  const line = scene.landmarks.find((landmark) => landmark.id === "harness-line");
  const spline = scene.landmarks.find((landmark) => landmark.id === "harness-spline");
  assert.equal(shape?.kind, "shape");
  assert.equal(line?.kind, "line");
  assert.equal(spline?.kind, "spline");
  const ordered = orderLandmarks(scene.landmarks, ["harness-shape", "harness-spline"]);
  const field = pseudospaceField(scene.cells, ordered);
  assert.ok(field);
  assert.equal(field.method, "knn-graph");
  const values = field.byIndex.map((cell) => cell.value);
  assert.ok(Math.min(...values) < 0.25);
  assert.ok(Math.max(...values) > 0.75);
  const bins = profileBins(scene.cells, field, 8);
  assert.equal(
    bins.reduce((sum, bin) => sum + bin.n, 0),
    scene.cells.length,
  );
  assert.ok(bins.some((bin) => bin.geneMean > 0));
  assert.equal(scene.geneName, "Aldoc");
});
