import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { DEFAULT_RENDER } from "./palettes.ts";

describe("DEFAULT_RENDER", () => {
  it("defaults segmentation mesh peak opacity to 0.6", () => {
    assert.equal(DEFAULT_RENDER.cellAlpha, 0.6);
  });
});
