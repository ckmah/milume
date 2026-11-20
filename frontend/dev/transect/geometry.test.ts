import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { orderStops, profileBins, projectPoint, transectField } from "./geometry.ts";
import { sceneFromState } from "./scene.ts";
import { stopId, type Cell, type Stop } from "./types.ts";

function stop(id: string, x: number, y: number): Stop {
  return { id: stopId(id), label: id, x, y, landmarkId: id, vertexIndex: 0 };
}

function cell(index: number, x: number, y: number, gene = 0): Cell {
  return { index, x, y, category: "region", band: "low", gene };
}

test("midpoint of one segment is t=0.5 and offset 0", () => {
  const hit = projectPoint(1, 0, [stop("a", 0, 0), stop("b", 2, 0)]);
  assert.ok(hit);
  assert.ok(Math.abs(hit.t - 0.5) < 1e-9);
  assert.ok(Math.abs(hit.offset) < 1e-9);
});

test("left of travel is a positive offset", () => {
  const hit = projectPoint(1, 2, [stop("a", 0, 0), stop("b", 2, 0)]);
  assert.ok(hit);
  assert.ok(hit.offset > 0);
});

test("fixture scene builds a field along real landmark stops", () => {
  const raw = JSON.parse(readFileSync(new URL("../fixture.json", import.meta.url), "utf8")) as Record<
    string,
    unknown
  >;
  const scene = sceneFromState(raw);
  assert.ok(scene.cells.length > 100);
  assert.ok(scene.stops.length >= 2);
  assert.equal(scene.geneName, "Aldoc");
  const ordered = orderStops(scene.stops, scene.stops.map((s) => s.id));
  const field = transectField(scene.cells, ordered);
  assert.ok(field);
  assert.equal(field.method, "mock-straight-line");
  assert.equal(field.byIndex.length >= scene.cells.length, true);
  const bins = profileBins(scene.cells, field, 6);
  const counted = bins.reduce((sum, bin) => sum + bin.n, 0);
  assert.equal(counted, scene.cells.length);
  assert.ok(bins.some((bin) => bin.geneMean > 0));
});
