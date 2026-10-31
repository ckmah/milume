import { decodeF32Base64, decodeI32Base64 } from "./binary";

type Base64Capable = typeof Uint8Array & {
  fromBase64?: (input: string, options?: { alphabet?: string }) => Uint8Array;
};

/** Decode trait base64 without a per-char JS loop when the runtime supports it. */
async function b64ToBytes(b64: string): Promise<Uint8Array> {
  if (!b64) return new Uint8Array(0);
  const fromBase64 = (Uint8Array as Base64Capable).fromBase64;
  if (typeof fromBase64 === "function") {
    return fromBase64(b64, { alphabet: "base64" });
  }
  const ab = await (await fetch(`data:application/octet-stream;base64,${b64}`)).arrayBuffer();
  return new Uint8Array(ab);
}

function viewToArrayBuffer(view: Uint8Array): ArrayBuffer {
  if (view.byteOffset === 0 && view.byteLength === view.buffer.byteLength) {
    return view.buffer as ArrayBuffer;
  }
  return view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength) as ArrayBuffer;
}

/** Decompress trait bytes when ``gene_csc_codec`` is ``gzip`` (legacy payloads skip). */
export async function decodeGeneCscBytes(b64: string, codec: string): Promise<ArrayBuffer> {
  const bytes = await b64ToBytes(b64);
  if (!bytes.byteLength) return new ArrayBuffer(0);
  if (codec !== "gzip") return viewToArrayBuffer(bytes);
  const stream = new Blob([viewToArrayBuffer(bytes)]).stream().pipeThrough(new DecompressionStream("gzip"));
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

/** Decode all three CSC traits concurrently (gzip inflate runs in parallel). */
export async function decodeGeneCscPack(
  indptrB64: string,
  indicesB64: string,
  dataB64: string,
  codec: string,
): Promise<{ indptr: Int32Array; indices: Int32Array; data: Float32Array }> {
  const [indptrBuf, indicesBuf, dataBuf] = await Promise.all([
    decodeGeneCscBytes(indptrB64, codec),
    decodeGeneCscBytes(indicesB64, codec),
    decodeGeneCscBytes(dataB64, codec),
  ]);
  return {
    indptr: indptrBuf.byteLength ? new Int32Array(indptrBuf) : new Int32Array(0),
    indices: indicesBuf.byteLength ? new Int32Array(indicesBuf) : new Int32Array(0),
    data: dataBuf.byteLength ? new Float32Array(dataBuf) : new Float32Array(0),
  };
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
