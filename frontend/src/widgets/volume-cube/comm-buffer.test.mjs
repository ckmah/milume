import assert from "node:assert/strict";
import { bytesFromCommBuffer } from "./comm-buffer.ts";

const raw = new ArrayBuffer(4);
new Uint8Array(raw).set([1, 2, 3, 4]);
const dv = new DataView(raw);

const emptyFromDv = new Uint8Array(dv);
assert.equal(emptyFromDv.byteLength, 0, "Uint8Array(DataView) is empty in browsers");

const fixed = bytesFromCommBuffer(dv);
assert.ok(fixed);
assert.deepEqual([...fixed], [1, 2, 3, 4]);

console.log("comm-buffer.test.mjs: ok");
