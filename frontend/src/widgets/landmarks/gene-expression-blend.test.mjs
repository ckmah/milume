import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { blendGeneSrgb } from "../../../../milume/static/gene-expression-blend.js";

describe("gene-expression-blend", () => {
  it("scales and blends active genes", () => {
    const meta = { vmin: 0, vmax: 1 };
    const rgb = blendGeneSrgb({
      activeGenes: ["0"],
      pointIndex: 0,
      scaleMode: "independent",
      log1p: false,
      valueAt: () => 1,
      metaAt: () => meta,
    });
    assert.deepEqual(rgb, [255, 0, 153]);
  });
});
