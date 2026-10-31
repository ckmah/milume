import { decodeF32Base64, decodeI32Base64 } from "./binary";

function b64ToBytes(b64: string): Uint8Array {
  if (!b64) return new Uint8Array(0);
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function copyBuffer(bytes: Uint8Array): ArrayBuffer {
  const out = new ArrayBuffer(bytes.byteLength);
  if (bytes.byteLength) new Uint8Array(out).set(bytes);
  return out;
}

/** Decompress trait bytes when ``gene_csc_codec`` is ``gzip`` (legacy payloads skip). */
export async function decodeGeneCscBytes(b64: string, codec: string): Promise<ArrayBuffer> {
  const bytes = b64ToBytes(b64);
  if (!bytes.byteLength) return new ArrayBuffer(0);
  if (codec !== "gzip") return copyBuffer(bytes);
  const chunk = copyBuffer(bytes);
  const stream = new Blob([chunk]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Response(stream).arrayBuffer();
}

export async function decodeGeneCscI32(b64: string, codec: string): Promise<Int32Array> {
  const buf = await decodeGeneCscBytes(b64, codec);
  if (!buf.byteLength) return new Int32Array(0);
  return new Int32Array(buf);
}

export async function decodeGeneCscF32(b64: string, codec: string): Promise<Float32Array> {
  const buf = await decodeGeneCscBytes(b64, codec);
  if (!buf.byteLength) return new Float32Array(0);
  return new Float32Array(buf);
}

/** Sync decode for legacy uncompressed fixtures (harness mocks without async boot). */
export function decodeGeneCscI32Sync(b64: string, codec: string): Int32Array {
  if (codec === "gzip") throw new Error("gzip gene CSC requires decodeGeneCscI32");
  return decodeI32Base64(b64);
}

export function decodeGeneCscF32Sync(b64: string, codec: string): Float32Array {
  if (codec === "gzip") throw new Error("gzip gene CSC requires decodeGeneCscF32");
  return decodeF32Base64(b64);
}
