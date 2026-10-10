import type { AbsolutePath, AsyncReadable, RangeQuery } from "@zarrita/storage";

import { bytesFromCommBuffer } from "./comm-buffer";
import { isCommVolumeUrl } from "./volume-url";

export type VolumeCommModel = {
  send(
    content: unknown,
    callbacks?: unknown,
    buffers?: ArrayBuffer[] | DataView[],
  ): void;
  on(event: string, callback: (msg: unknown, buffers?: ArrayBuffer[]) => void): void;
  off?(event: string, callback: (msg: unknown, buffers?: ArrayBuffer[]) => void): void;
};

type VolumeGetResponse = { ok: boolean; status?: number; error?: string };

const COMMAND = "volume_get";
const DEFAULT_CONCURRENCY = 8;
const METADATA_CACHE_BYTES = 4 * 1024 * 1024;

function randomId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}

function invoke(
  model: VolumeCommModel,
  name: string,
  msg: unknown,
  options: { signal?: AbortSignal; buffers?: ArrayBuffer[] } = {},
): Promise<[VolumeGetResponse, ArrayBuffer[]]> {
  const id = randomId();
  const signal = options.signal ?? AbortSignal.timeout(120_000);
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }
    const handler = (raw: unknown, buffers?: ArrayBuffer[]) => {
      const body = raw as { id?: string; response?: VolumeGetResponse };
      if (body?.id !== id) return;
      model.off?.("msg:custom", handler);
      resolve([body.response ?? { ok: false }, buffers ?? []]);
    };
    const onAbort = () => {
      model.off?.("msg:custom", handler);
      reject(signal.reason);
    };
    signal.addEventListener("abort", onAbort, { once: true });
    model.on("msg:custom", handler);
    model.send(
      { id, kind: "anywidget-command", name, msg },
      undefined,
      options.buffers ?? [],
    );
  });
}

function joinStorePath(base: string, key: AbsolutePath): string {
  const root = base.endsWith("/") ? base : `${base}/`;
  return `${root}${key.replace(/^\//, "")}`;
}

/** Batched comm reads for one widget; shared by every CommStore root. */
export class VolumeCommClient {
  private _reads = 0;
  get reads(): number {
    return this._reads;
  }
  private running = 0;
  private readonly queue: {
    path: string;
    range?: RangeQuery;
    resolve: (value: Uint8Array | undefined) => void;
    reject: (reason: unknown) => void;
  }[] = [];
  private readonly metadata = new Map<string, { bytes: Uint8Array; size: number }>();
  private metadataBytes = 0;

  constructor(
    private readonly model: VolumeCommModel,
    private readonly concurrency = DEFAULT_CONCURRENCY,
  ) {}

  createStore(base: string): CommStore {
    return new CommStore(this, base);
  }

  private pump(): void {
    while (this.running < this.concurrency && this.queue.length) {
      const job = this.queue.shift()!;
      this.running++;
      this.fetch(job.path, job.range)
        .then(job.resolve, job.reject)
        .finally(() => {
          this.running--;
          this.pump();
        });
    }
  }

  private enqueue(path: string, range?: RangeQuery): Promise<Uint8Array | undefined> {
    return new Promise((resolve, reject) => {
      this.queue.push({ path, range, resolve, reject });
      this.pump();
    });
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

  private metadataCacheEnabled(): boolean {
    if (typeof window === "undefined") return true;
    return !(window as unknown as { __volumeCommDisableMetadataCache?: boolean }).__volumeCommDisableMetadataCache;
  }

  private async fetch(path: string, range?: RangeQuery): Promise<Uint8Array | undefined> {
    if (!range && this.metadataCacheEnabled()) {
      const hit = this.metadata.get(path);
      if (hit) return hit.bytes;
    }
    this._reads++;
    const msg: { path: string; range?: RangeQuery } = { path };
    if (range) msg.range = range;
    const [response, buffers] = await invoke(this.model, COMMAND, msg);
    if (!response.ok) {
      if (response.status === 404) return undefined;
      const detail =
        typeof response.error === "string" && response.error.length > 0
          ? response.error
          : `volume_get failed (${response.status ?? "error"})`;
      throw new Error(detail);
    }
    const bytes = bytesFromCommBuffer(buffers[0] as ArrayBuffer | ArrayBufferView);
    if (!bytes?.byteLength) return undefined;
    if (!range && this.metadataCacheEnabled()) this.cacheMetadata(path, bytes);
    return bytes;
  }

  get(path: string, range?: RangeQuery): Promise<Uint8Array | undefined> {
    return this.enqueue(path, range);
  }
}

class CommStore implements AsyncReadable {
  constructor(
    private readonly client: VolumeCommClient,
    private readonly base: string,
  ) {}

  async get(key: AbsolutePath): Promise<Uint8Array | undefined> {
    return this.client.get(joinStorePath(this.base, key));
  }

  async getRange(key: AbsolutePath, range: RangeQuery): Promise<Uint8Array | undefined> {
    return this.client.get(joinStorePath(this.base, key), range);
  }
}

export function volumeCommClientFor(model: unknown): VolumeCommClient | null {
  if (!model || typeof model !== "object") return null;
  const m = model as VolumeCommModel;
  if (typeof m.send !== "function" || typeof m.on !== "function") return null;
  return new VolumeCommClient(m);
}

export function hasCommVolume(volume: { image_url?: string } | undefined): boolean {
  return isCommVolumeUrl(volume?.image_url ?? "");
}
