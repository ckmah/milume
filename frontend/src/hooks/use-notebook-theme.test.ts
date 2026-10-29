import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { mdSchemeIsDark } from "./notebook-theme.ts";

describe("mdSchemeIsDark", () => {
  it("maps Zensical palette ids", () => {
    assert.equal(mdSchemeIsDark("default"), false);
    assert.equal(mdSchemeIsDark("slate"), true);
    assert.equal(mdSchemeIsDark(null), null);
    assert.equal(mdSchemeIsDark("custom"), null);
  });
});
