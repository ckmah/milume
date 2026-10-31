import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { decodeGeneCscF32, decodeGeneCscI32 } from "./gene-csc-binary.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../../..");

function pythonPack() {
  const script = `
import base64, gzip, json
import numpy as np
from tests.helpers import adata_xy
from milume.genes import pack_eager_gene_matrix

adata = adata_xy([0.0, 1.0, 2.0], [0.0, 1.0, 0.0], genes={"A": [0.0, 2.0, 4.0], "B": [1.0, 0.0, 3.0]})
_, payload = pack_eager_gene_matrix(adata, ["A", "B"], 3)

def raw(key, dtype):
    data = base64.b64decode(payload[key])
    if payload.get("gene_csc_codec") == "gzip":
        data = gzip.decompress(data)
    return np.frombuffer(data, dtype=dtype).tolist()

print(json.dumps({"payload": payload, "indptr": raw("gene_csc_indptr", np.int32), "indices": raw("gene_csc_indices", np.int32), "data": raw("gene_csc_data", np.float32)}))
`;
  const proc = spawnSync("uv", ["run", "--directory", root, "python", "-c", script], {
    encoding: "utf8",
  });
  assert.equal(proc.status, 0, proc.stderr || proc.stdout);
  return JSON.parse(proc.stdout);
}

test("JS decodes Python gzip gene CSC traits", async () => {
  const py = pythonPack();
  assert.equal(py.payload.gene_csc_codec, "gzip");
  const codec = py.payload.gene_csc_codec;
  const gotIndptr = [...(await decodeGeneCscI32(py.payload.gene_csc_indptr, codec))];
  const gotIndices = [...(await decodeGeneCscI32(py.payload.gene_csc_indices, codec))];
  const gotData = [...(await decodeGeneCscF32(py.payload.gene_csc_data, codec))];
  assert.deepEqual(gotIndptr, py.indptr);
  assert.deepEqual(gotIndices, py.indices);
  assert.deepEqual(
    gotData.map((v) => Math.fround(v)),
    py.data.map((v) => Math.fround(v)),
  );
});
