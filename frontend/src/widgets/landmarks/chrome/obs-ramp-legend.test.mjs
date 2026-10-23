import assert from "node:assert/strict";
import test from "node:test";

import { obsPaletteGradient } from "./obs-ramp-math.ts";

test("obsPaletteGradient spans every palette stop bottom to top", () => {
  const palette = ["#000000", "#ffffff"];
  const css = obsPaletteGradient(palette);
  assert.match(css, /linear-gradient\(to top/);
  assert.ok(css.includes("#000000 0.0000%"));
  assert.ok(css.includes("#ffffff 100.0000%"));
});

test("obsPaletteGradient handles a single swatch", () => {
  const css = obsPaletteGradient(["#336699"]);
  assert.match(css, /#336699/);
});
