import type { RangeQuery } from "@zarrita/storage";

const DEFAULT_CDN_TTL_MS = 60 * 60 * 1000;
const MAX_RETRIES = 6;
const BASE_BACKOFF_MS = 250;

export type HttpFetchStats = {
  fetches: number;
  coalesced: number;
  cacheHits: number;
  absentHits: number;
};

function rangeKey(range?: RangeQuery): string {
  if (!range) return "full";
  if ("suffixLength" in range) return `s:${range.suffixLength}`;
  return `o:${range.offset}:${range.length}`;
}

function parseMaxAge(cacheControl: string | null): number | null {
  if (!cacheControl) return null;
  const m = /max-age=(\d+)/i.exec(cacheControl);
  return m ? Number(m[1]) * 1000 : null;
}

function jitter(ms: number): number {
  return ms + Math.random() * ms * 0.25;
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export class VolumeHttpFetcher {
  private readonly absentObjects = new Set<string>();
  private readonly metadata = new Map<string, Uint8Array>();
  private readonly shardIndex = new Map<string, Uint8Array>();
  private readonly cdnByLogical = new Map<string, { url: string; expiresAt: number }>();
  private readonly inflight = new Map<string, Promise<Uint8Array | undefined>>();
  private _fetches = 0;
  private _cacheHits = 0;
  private _absentHits = 0;

  get stats(): HttpFetchStats {
    return {
      fetches: this._fetches,
      coalesced: 0,
      cacheHits: this._cacheHits,
      absentHits: this._absentHits,
    };
  }

  markAbsent(logicalHref: string): void {
    this.absentObjects.add(logicalHref);
  }

  isAbsent(logicalHref: string): boolean {
    return this.absentObjects.has(logicalHref);
  }

  getCachedMetadata(logicalHref: string): Uint8Array | undefined {
    return this.metadata.get(logicalHref);
  }

  getCachedShardIndex(logicalHref: string): Uint8Array | undefined {
    return this.shardIndex.get(logicalHref);
  }

  cacheMetadata(logicalHref: string, bytes: Uint8Array): void {
    this.metadata.set(logicalHref, bytes);
  }

  cacheShardIndex(logicalHref: string, bytes: Uint8Array): void {
    this.shardIndex.set(logicalHref, bytes);
  }

  async fetch(logicalHref: string, range?: RangeQuery): Promise<Uint8Array | undefined> {
    if (this.absentObjects.has(logicalHref)) {
      this._absentHits++;
      return undefined;
    }
    const key = `${logicalHref}|${rangeKey(range)}`;
    const pending = this.inflight.get(key);
    if (pending) {
      this._cacheHits++;
      return pending;
    }
    const job = this.doFetch(logicalHref, range).finally(() => {
      this.inflight.delete(key);
    });
    this.inflight.set(key, job);
    return job;
  }

  private cdnUrlFor(logicalHref: string, now: number): string | null {
    const hit = this.cdnByLogical.get(logicalHref);
    if (hit && hit.expiresAt > now) return hit.url;
    return null;
  }

  private rememberCdn(logicalHref: string, responseUrl: string, cacheControl: string | null, now: number): void {
    const ttl = parseMaxAge(cacheControl) ?? DEFAULT_CDN_TTL_MS;
    this.cdnByLogical.set(logicalHref, { url: responseUrl || logicalHref, expiresAt: now + ttl });
  }

  private async fetchWithRetry(url: string, init: RequestInit): Promise<Response> {
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const res = await fetch(url, init);
      if (res.status !== 429) return res;
      await sleep(jitter(BASE_BACKOFF_MS * 2 ** attempt));
    }
    throw new Error("volume HTTP read failed (429)");
  }

  private async doFetch(logicalHref: string, range?: RangeQuery): Promise<Uint8Array | undefined> {
    const now = Date.now();
    const cachedCdn = this.cdnUrlFor(logicalHref, now);
    const requestUrl = cachedCdn ?? logicalHref;

    const headers = new Headers();
    if (range) {
      if ("suffixLength" in range) headers.set("Range", `bytes=-${range.suffixLength}`);
      else headers.set("Range", `bytes=${range.offset}-${range.offset + range.length - 1}`);
    }

    this._fetches++;
    const response = await this.fetchWithRetry(requestUrl, { headers, redirect: "follow" });
    if (response.status === 404) {
      this.absentObjects.add(logicalHref);
      return undefined;
    }
    if (response.status !== 200 && response.status !== 206) {
      throw new Error(`volume HTTP read failed (${response.status})`);
    }
    if (!cachedCdn) {
      this.rememberCdn(logicalHref, response.url, response.headers.get("Cache-Control"), now);
    }
    const buf = await response.arrayBuffer();
    return buf.byteLength ? new Uint8Array(buf) : undefined;
  }
}
