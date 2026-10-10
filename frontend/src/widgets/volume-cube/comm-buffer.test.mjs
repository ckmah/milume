import assert from "node:assert/strict";
import test from "node:test";

import { bytesFromCommBuffer } from "./comm-buffer.ts";

test("bytesFromCommBuffer returns undefined for null and undefined", () => {
  assert.equal(bytesFromCommBuffer(null), undefined);
  assert.equal(bytesFromCommBuffer(undefined), undefined);
});

test("bytesFromCommBuffer reads a bare ArrayBuffer", () => {
  const raw = new ArrayBuffer(4);
  new Uint8Array(raw).set([9, 8, 7, 6]);
  const out = bytesFromCommBuffer(raw);
  assert.ok(out);
  assert.deepEqual([...out], [9, 8, 7, 6]);
});

test("bytesFromCommBuffer passes through an offset Uint8Array slice", () => {
  const backing = new Uint8Array([0, 1, 2, 3, 4, 5]);
  const slice = backing.subarray(2, 5);
  const out = bytesFromCommBuffer(slice);
  assert.ok(out);
  assert.equal(out, slice);
  assert.deepEqual([...out], [2, 3, 4]);
  assert.equal(out.byteOffset, 2);
});

test("bytesFromCommBuffer reads an offset DataView (not Uint8Array(DataView))", () => {
  const raw = new ArrayBuffer(8);
  new Uint8Array(raw).set([1, 2, 3, 4, 5, 6, 7, 8]);
  const dv = new DataView(raw, 2, 4);
  const emptyFromDv = new Uint8Array(dv);
  assert.equal(emptyFromDv.byteLength, 0, "Uint8Array(DataView) is empty in browsers");
  const out = bytesFromCommBuffer(dv);
  assert.ok(out);
  assert.deepEqual([...out], [3, 4, 5, 6]);
});

test("bytesFromCommBuffer reads an offset Float32Array view", () => {
  const raw = new ArrayBuffer(16);
  const words = new Float32Array(raw);
  words.set([0, 1.5, 2.5, 3.5]);
  const view = new Float32Array(raw, 4, 2);
  const out = bytesFromCommBuffer(view);
  assert.ok(out);
  assert.equal(out.byteLength, 8);
  assert.equal(new Float32Array(out.buffer, out.byteOffset, 2)[0], 1.5);
  assert.equal(new Float32Array(out.buffer, out.byteOffset, 2)[1], 2.5);
});
