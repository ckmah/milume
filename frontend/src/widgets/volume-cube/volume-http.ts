import type { AbsolutePath, AsyncReadable, RangeQuery } from "@zarrita/storage";

import type { VolumeCommClient } from "./volume-comm";
import { commRelativeVolumeBase, isCommVolumeUrl } from "./volume-url";

const DEFAULT_CONCURRENCY = 8;
const METADATA_CACHE_BYTES = 4 * 1024 * 1024;
const SHARD_INDEX_CACHE_BYTES = 32 * 1024 * 1024;
const COALESCE_GAP_BYTES = 256 * 1024;
const COALESCE_MAX_BYTES = 8 * 1024 * 1024;

type RangeInterval = { start: number; end: number };

function commObjectPath(elementBase: string, key: AbsolutePath): string {
  return `${commRelativeVolumeBase(elementBase)}${key.replace(/^\//, "")}`;
}

function absoluteObjectUrl(base: string, key: AbsolutePath): string {
  const root = base.endsWith("/") ? base : `${base}/`;
  const rel = key.replace(/^\//, "");
  if (root.startsWith("http://") || root.startsWith("https://")) {
    return new URL(rel, root).href;
  }
  if (typeof window !== "undefined") {
    return new URL(rel, new URL(root, window.location.href)).href;
  }
  return `${root}${rel}`.replace(/([^:]\/)\/+/g, "$1");
}

function rangeQueryToInterval(range: RangeQuery): RangeInterval {
  if ("suffixLength" in range) {
    return { start: -range.suffixLength, end: -1 };
  }
  return { start: range.offset, end: range.offset + range.length };
}

function mergeIntervals(intervals: RangeInterval[]): RangeInterval | null {
  const positive = intervals.filter((i) => i.start >= 0 && i.end > i.start);
  if (!positive.length) return null;
  const start = Math.min(...positive.map((i) => i.start));
  const end = Math.max(...positive.map((i) => i.end));
  return { start, end };
}

function sliceForInterval(bytes: Uint8Array, merged: RangeInterval, part: RangeInterval): Uint8Array {
  const offset = part.start - merged.start;
  return bytes.subarray(offset, offset + (part.end - part.start));
}

async function readHttp(
  href: string,
  range?: RangeQuery,
  init: RequestInit = {},
): Promise<Uint8Array | undefined> {
  const headers = new Headers(init.headers);
  if (range) {
    if ("suffixLength" in range) headers.set("Range", `bytes=-${range.suffixLength}`);
    else headers.set("Range", `bytes=${range.offset}-${range.offset + range.length - 1}`);
  }
  const response = await fetch(href, { ...init, headers });
  if (response.status === 404) return undefined;
  if (response.status !== 200 && response.status !== 206) {
    throw new Error(`volume HTTP read failed (${response.status})`);
  }
  const buf = await response.arrayBuffer();
  return buf.byteLength ? new Uint8Array(buf) : undefined;
}

type BatchJob = {
  elementBase: string;
  intervals: RangeInterval[];
  resolvers: {
    resolve: (value: Uint8Array | undefined) => void;
    reject: (reason: unknown) => void;
  }[];
};

/** HTTP range reads with shard-index caching and coalesced chunk fetches. */
export class VolumeHttpClient {
  private running = 0;
  private readonly queue: (() => Promise<void>)[] = [];
  private readonly batches = new Map<string, BatchJob>();
  private batchScheduled = false;
  private readonly metadata = new Map<string, { bytes: Uint8Array; size: number }>();
  private metadataBytes = 0;
  private readonly shardIndex = new Map<string, { bytes: Uint8Array; size: number }>();
  private shardIndexBytes = 0;
  private _httpFetches = 0;
  private _coalescedFetches = 0;
  private useCommFallback = false;

  constructor(
    private readonly comm: VolumeCommClient | null,
    private readonly concurrency = DEFAULT_CONCURRENCY,
  ) {}

  get httpFetches(): number {
    return this._httpFetches;
  }

  get coalescedFetches(): number {
    return this._coalescedFetches;
  }

  get commFallback(): boolean {
    return this.useCommFallback;
  }

  createStore(base: string): AsyncReadable {
    if (this.useCommFallback && this.comm) {
      return this.comm.createStore(commRelativeVolumeBase(base));
    }
    return new HttpStore(this, base);
  }

  private pump(): void {
    while (this.running < this.concurrency && this.queue.length) {
      const job = this.queue.shift()!;
      this.running++;
      void job().finally(() => {
        this.running--;
        this.pump();
      });
    }
  }

  private enqueue(fn: () => Promise<void>): void {
    this.queue.push(fn);
    this.pump();
  }

  private cacheMetadata(path: string, bytes: Uint8Array): void {
    if (bytes.byteLength > 256 * 1024) return;
    const prev = this.metadata.get(path);
    if (prev) this.metadataBytes -= prev.size;
    this.metadata.set(path, { bytes, size: bytes.byteLength });
    this.metadataBytes += bytes.byteLength;
    for (const [key, entry] of this.metadata) {
      if (this.metadataBytes <= METADATA_CACHE_BYTES) break;
      this.metadata.delete(key);
      this.metadataBytes -= entry.size;
    }
  }

  private cacheShardIndex(path: string, bytes: Uint8Array): void {
    const prev = this.shardIndex.get(path);
    if (prev) this.shardIndexBytes -= prev.size;
    this.shardIndex.set(path, { bytes, size: bytes.byteLength });
    this.shardIndexBytes += bytes.byteLength;
    for (const [key, entry] of this.shardIndex) {
      if (this.shardIndexBytes <= SHARD_INDEX_CACHE_BYTES) break;
      this.shardIndex.delete(key);
      this.shardIndexBytes -= entry.size;
    }
  }

  private scheduleBatchFlush(): void {
    if (this.batchScheduled) return;
    this.batchScheduled = true;
    queueMicrotask(() => {
      this.batchScheduled = false;
      const pending = [...this.batches.entries()];
      this.batches.clear();
      for (const [href, batch] of pending) {
        const elementBase = batch.elementBase;
        this.enqueue(() => this.flushBatch(elementBase, href, batch));
      }
    });
  }

  private canCoalesce(a: RangeInterval, b: RangeInterval): boolean {
    if (a.start < 0 || b.start < 0) return false;
    const gap = Math.max(0, Math.max(a.start, b.start) - Math.min(a.end, b.end));
    const span = Math.max(a.end, b.end) - Math.min(a.start, b.start);
    return gap <= COALESCE_GAP_BYTES && span <= COALESCE_MAX_BYTES;
  }

  private commRelForHref(elementBase: string, href: string): string {
    const prefix = commRelativeVolumeBase(elementBase);
    const root = elementBase.endsWith("/") ? elementBase : `${elementBase}/`;
    const rel =
      href.startsWith("http://") || href.startsWith("https://")
        ? new URL(href).pathname.replace(/^\//, "")
        : href.replace(/^\//, "");
    const rootPath =
      root.startsWith("http://") || root.startsWith("https://")
        ? new URL(root).pathname.replace(/^\//, "")
        : root.replace(/^\//, "");
    const tail = rel.startsWith(rootPath) ? rel.slice(rootPath.length) : rel;
    return `${prefix}${tail}`.replace(/\/+/g, "/");
  }

  private async flushBatch(elementBase: string, href: string, batch: BatchJob): Promise<void> {
    const suffixJobs: number[] = [];
    const offsetJobs: number[] = [];
    batch.intervals.forEach((interval, index) => {
      if (interval.start < 0) suffixJobs.push(index);
      else offsetJobs.push(index);
    });

    for (const index of suffixJobs) {
      const interval = batch.intervals[index]!;
      const range: RangeQuery = { suffixLength: -interval.start };
      try {
        const bytes = await this.read(href, this.commRelForHref(elementBase, href), range);
        batch.resolvers[index]!.resolve(bytes);
      } catch (err) {
        batch.resolvers[index]!.reject(err);
      }
    }

    if (!offsetJobs.length) return;

    const groups: { merged: RangeInterval; items: number[] }[] = [];
    for (const index of offsetJobs) {
      const interval = batch.intervals[index]!;
      let placed = false;
      for (const group of groups) {
        if (this.canCoalesce(group.merged, interval)) {
          group.merged = mergeIntervals([group.merged, interval])!;
          group.items.push(index);
          placed = true;
          break;
        }
      }
      if (!placed) groups.push({ merged: interval, items: [index] });
    }

    for (const group of groups) {
      const length = group.merged.end - group.merged.start;
      const range: RangeQuery = { offset: group.merged.start, length };
      try {
        const bytes = await this.read(href, this.commRelForHref(elementBase, href), range);
        for (const index of group.items) {
          const slice = bytes
            ? sliceForInterval(bytes, group.merged, batch.intervals[index]!)
            : undefined;
          batch.resolvers[index]!.resolve(slice);
        }
        if (group.items.length > 1) this._coalescedFetches++;
      } catch (err) {
        for (const index of group.items) batch.resolvers[index]!.reject(err);
      }
    }
  }

  get(
    elementBase: string,
    href: string,
    commRel: string,
    range?: RangeQuery,
  ): Promise<Uint8Array | undefined> {
    if (this.useCommFallback && this.comm) {
      return this.comm.get(commRel, range);
    }
    if (!range) {
      const hit = this.metadata.get(href);
      if (hit) return Promise.resolve(hit.bytes);
      return this.read(href, commRel).then((bytes) => {
        if (bytes) this.cacheMetadata(href, bytes);
        return bytes;
      });
    }
    if ("suffixLength" in range) {
      const hit = this.shardIndex.get(href);
      if (hit) return Promise.resolve(hit.bytes);
    }
    return new Promise((resolve, reject) => {
      const batch = this.batches.get(href) ?? { elementBase, intervals: [], resolvers: [] };
      batch.intervals.push(rangeQueryToInterval(range));
      batch.resolvers.push({ resolve, reject });
      this.batches.set(href, batch);
      this.scheduleBatchFlush();
    });
  }

  private async read(href: string, commRel: string, range?: RangeQuery): Promise<Uint8Array | undefined> {
    try {
      this._httpFetches++;
      const bytes = await readHttp(href, range);
      if (range && "suffixLength" in range && bytes) this.cacheShardIndex(href, bytes);
      return bytes;
    } catch (err) {
      if (!this.comm) throw err;
      this.useCommFallback = true;
      return this.comm.get(commRel, range);
    }
  }
}

class HttpStore implements AsyncReadable {
  constructor(
    private readonly client: VolumeHttpClient,
    private readonly base: string,
  ) {}

  async get(key: AbsolutePath): Promise<Uint8Array | undefined> {
    const href = absoluteObjectUrl(this.base, key);
    return this.client.get(this.base, href, commObjectPath(this.base, key));
  }

  async getRange(key: AbsolutePath, range: RangeQuery): Promise<Uint8Array | undefined> {
    const href = absoluteObjectUrl(this.base, key);
    return this.client.get(this.base, href, commObjectPath(this.base, key), range);
  }
}

export function volumeHttpClientFor(
  imageUrl: string,
  comm: VolumeCommClient | null,
): VolumeHttpClient | null {
  if (!imageUrl || isCommVolumeUrl(imageUrl)) return null;
  return new VolumeHttpClient(comm);
}
