import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { decodeGeneCscF32, decodeGeneCscI32 } from "./gene-csc-binary.ts";

const dev = join(dirname(fileURLToPath(import.meta.url)), "../../../dev");

test("JS decodes gzip CSC traits from the squidpy harness fixture", async () => {
  const fixture = JSON.parse(readFileSync(join(dev, "squidpy-niche-fixture.json"), "utf8"));
  assert.equal(fixture.gene_csc_codec, "gzip");
  const codec = fixture.gene_csc_codec;
  const meta = fixture.gene_names;
  const indptr = await decodeGeneCscI32(fixture.gene_csc_indptr, codec);
  const indices = await decodeGeneCscI32(fixture.gene_csc_indices, codec);
  const data = await decodeGeneCscF32(fixture.gene_csc_data, codec);
  assert.equal(indptr.length, meta.length + 1);
  assert.equal(indices.length, data.length);
  assert.equal(indptr.at(-1), indices.length);
  for (let j = 0; j < meta.length; j++) {
    const a = indptr[j];
    const b = indptr[j + 1];
    assert.ok(b >= a);
    for (let p = a; p < b; p++) {
      assert.ok(indices[p] >= 0);
      assert.ok(data[p] >= 0 && data[p] <= 1);
    }
  }
});
