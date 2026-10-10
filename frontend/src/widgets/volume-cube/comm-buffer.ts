/** Normalize Jupyter / marimo comm binary payloads for zarrita reads. */
export function bytesFromCommBuffer(
  buf: ArrayBuffer | ArrayBufferView | undefined | null,
): Uint8Array | undefined {
  if (buf == null) return undefined;
  if (buf instanceof Uint8Array) return buf;
  if (ArrayBuffer.isView(buf)) {
    return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  }
  return new Uint8Array(buf);
}
