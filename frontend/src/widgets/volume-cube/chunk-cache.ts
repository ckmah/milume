import type * as zarr from "zarrita";

type AnyArray = zarr.Array<zarr.DataType, zarr.Readable>;
type Chunk = zarr.Chunk<zarr.DataType>;

/** Decoded bytes the cache may hold (per widget). */
export const CHUNK_CACHE_BYTES = 256 * 1024 * 1024;
/** Background prefetch requests in flight at once. */
export const PREFETCH_CONCURRENCY = 2;

const ATTACHED = Symbol("chunkCache");

/**
 * Decoded Zarr chunks shared by every cube of one widget. `attach` patches an
 * array's `getChunk`, which `zarr.get` calls per chunk, so windows and regions
 * that overlap earlier ones only copy memory. Keys are `<key>/<coords>`, so two
 * array objects opened on the same level (preview and dock) share entries.
 */
export class ChunkCache {
  private readonly entries = new Map<string, { chunk: Promise<Chunk>; bytes: number }>();
  private readonly queue: { arr: AnyArray; coords: number[] }[] = [];
  private running = 0;
  private pauseDepth = 0;
  private paused = false;
  /** Multichannel zarr tiles: spatial chunk cache must not reuse another channel's decode. */
  private fetchChannel = 0;
  bytes = 0;
  hits = 0;
  misses = 0;

  constructor(
    private readonly maxBytes = CHUNK_CACHE_BYTES,
    private readonly concurrency = PREFETCH_CONCURRENCY,
  ) {}

  private fetchQueue: Promise<unknown> = Promise.resolve();

  attach(arr: AnyArray, key: string): void {
    const tagged = arr as AnyArray & { [ATTACHED]?: ChunkCache };
    if (tagged[ATTACHED] === this) return;
    const original = arr.getChunk.bind(arr);
    arr.getChunk = ((coords: number[], opts?: unknown) =>
      this.load(`${key}/${coords.join(".")}`, () => original(coords, opts as never))) as AnyArray["getChunk"];
    tagged[ATTACHED] = this;
  }

  /** Scope decoded chunk cache keys to one channel index (see fetchBox / multichannel cube). */
  runWithFetchChannel<T>(channel: number, fn: () => T): T {
    const prev = this.fetchChannel;
    this.fetchChannel = channel;
    try {
      const out = fn();
      if (out instanceof Promise) {
        return out.finally(() => {
          this.fetchChannel = prev;
        }) as T;
      }
      this.fetchChannel = prev;
      return out;
    } catch (err) {
      this.fetchChannel = prev;
      throw err;
    }
  }

  /** Serialize multichannel fetches so ChunkCache channel scope is not interleaved. */
  enqueueFetch<T>(channel: number, fn: () => Promise<T>): Promise<T> {
    const run = () => this.runWithFetchChannel(channel, fn);
    const next = this.fetchQueue.then(run, run);
    this.fetchQueue = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }

  private load(id: string, fetch: () => Promise<Chunk>): Promise<Chunk> {
    const scoped = `${id}@c${this.fetchChannel}`;
    const hit = this.entries.get(scoped);
    if (hit) {
      this.hits++;
      // Re-insert: Map order is the LRU order.
      this.entries.delete(scoped);
      this.entries.set(scoped, hit);
      return hit.chunk;
    }
    this.misses++;
    const entry = { chunk: fetch(), bytes: 0 };
    this.entries.set(scoped, entry);
    entry.chunk.then(
      (chunk) => {
        entry.bytes = (chunk.data as { byteLength?: number }).byteLength ?? 0;
        this.bytes += entry.bytes;
        this.evict();
      },
      () => {
        // A failed read must not poison retries.
        if (this.entries.get(scoped) === entry) this.entries.delete(scoped);
      },
    );
    return entry.chunk;
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
    // Drop queued prefetch. In-flight reads still finish, but a window change
    // must not wait behind the rest of a level on a high-latency comm.
    this.clearQueue();
  }

  resume(): void {
    this.pauseDepth = Math.max(0, this.pauseDepth - 1);
    this.paused = this.pauseDepth > 0;
    if (this.paused) return;
    // A replacement load pauses again in the same turn. Pumping now would
    // start a prefetch chunk ahead of that load.
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
