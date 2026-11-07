import type * as zarr from "zarrita";

type AnyArray = zarr.Array<zarr.DataType, zarr.Readable>;
type Chunk = zarr.Chunk<zarr.DataType>;

/** Decoded bytes the cache may hold (per widget). */
export const CHUNK_CACHE_BYTES = 256 * 1024 * 1024;
/** Background prefetch requests in flight at once. */
export const PREFETCH_CONCURRENCY = 2;

const ATTACHED = Symbol("chunkCache");

/** Copy decoded chunk bytes so zarr.get assembly cannot mutate a shared cache entry. */
export function cloneZarrChunk(chunk: Chunk): Chunk {
  const src = chunk.data as unknown as ArrayLike<number> & {
    constructor: new (length: number) => ArrayLike<number>;
    length: number;
    set(arr: ArrayLike<number>): void;
  };
  const data = new src.constructor(src.length) as ArrayLike<number> & {
    set(arr: ArrayLike<number>): void;
  };
  data.set(src);
  return { ...chunk, data: data as Chunk["data"] };
}

/**
 * Decoded Zarr chunks shared by every cube of one widget. `attach` patches an
 * array's `getChunk`, which `zarr.get` calls per chunk, so windows and regions
 * that overlap earlier ones only copy memory. Keys are `<key>/<coords>` (full
 * mosaic tile, including all `c` planes in one chunk). Multichannel `{c:0}` and
 * `{c:1}` selections share coords on `c` when chunk shape bundles channels; each
 * `zarr.get` slices its channel out of a fresh clone of the cached full tile.
 */
export class ChunkCache {
  private readonly entries = new Map<string, { chunk: Promise<Chunk>; bytes: number }>();
  private readonly inflight = new Map<string, Promise<Chunk>>();
  private readonly queue: { arr: AnyArray; coords: number[] }[] = [];
  private running = 0;
  private pauseDepth = 0;
  private paused = false;
  bytes = 0;
  hits = 0;
  misses = 0;

  constructor(
    private readonly maxBytes = CHUNK_CACHE_BYTES,
    private readonly concurrency = PREFETCH_CONCURRENCY,
  ) {}

  attach(arr: AnyArray, key: string): void {
    const tagged = arr as AnyArray & { [ATTACHED]?: ChunkCache };
    if (tagged[ATTACHED] === this) return;
    const original = arr.getChunk.bind(arr);
    arr.getChunk = ((coords: number[], opts?: unknown) =>
      this.load(`${key}/${coords.join(".")}`, () => original(coords, opts as never))) as AnyArray["getChunk"];
    tagged[ATTACHED] = this;
  }

  private load(id: string, fetch: () => Promise<Chunk>): Promise<Chunk> {
    const hit = this.entries.get(id);
    if (hit) {
      this.hits++;
      this.entries.delete(id);
      this.entries.set(id, hit);
      return hit.chunk.then(cloneZarrChunk);
    }
    let pending = this.inflight.get(id);
    if (pending) return pending.then(cloneZarrChunk);

    this.misses++;
    pending = fetch().then(cloneZarrChunk);
    this.inflight.set(id, pending);
    const entry = { chunk: pending, bytes: 0 };
    this.entries.set(id, entry);
    pending.then(
      (chunk) => {
        this.inflight.delete(id);
        entry.bytes = (chunk.data as { byteLength?: number }).byteLength ?? 0;
        this.bytes += entry.bytes;
        this.evict();
      },
      () => {
        this.inflight.delete(id);
        if (this.entries.get(id) === entry) this.entries.delete(id);
      },
    );
    return pending.then(cloneZarrChunk);
  }

  private evict(): void {
    for (const [id, entry] of this.entries) {
      if (this.bytes <= this.maxBytes) break;
      if (!entry.bytes) continue; // still in flight
      this.entries.delete(id);
      this.bytes -= entry.bytes;
    }
  }

  /** Queue background reads (through the patched `getChunk`, so they land here). */
  prefetch(arr: AnyArray, coords: number[][]): void {
    for (const c of coords) this.queue.push({ arr, coords: c });
    this.pump();
  }

  pause(): void {
    this.pauseDepth++;
    this.paused = true;
    this.clearQueue();
  }

  resume(): void {
    this.pauseDepth = Math.max(0, this.pauseDepth - 1);
    this.paused = this.pauseDepth > 0;
    if (this.paused) return;
    queueMicrotask(() => {
      if (!this.paused) this.pump();
    });
  }

  clearQueue(): void {
    this.queue.length = 0;
  }

  private pump(): void {
    while (!this.paused && this.running < this.concurrency && this.queue.length) {
      const { arr, coords } = this.queue.shift()!;
      this.running++;
      arr
        .getChunk(coords)
        .catch(() => undefined)
        .finally(() => {
          this.running--;
          this.pump();
        });
    }
  }
}
