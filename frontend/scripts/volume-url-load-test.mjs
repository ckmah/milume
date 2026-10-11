/**
 * Stress-read a public SpatialData zarr store like Inspect (metadata, shard indexes, chunk ranges).
 *
 * Usage:
 *   node scripts/volume-url-load-test.mjs \
 *     --url https://huggingface.co/datasets/.../small.sdata.zarr/images/mosaic_image/s0/ \
 *     --duration 300 --readers 30
 */
import { setTimeout as sleep } from "node:timers/promises";

const args = new Map(
  process.argv
    .slice(2)
    .map((arg) => {
      const [key, value] = arg.replace(/^--/, "").split("=");
      return [key, value ?? "true"];
    }),
);

const storeUrl = args.get("url");
if (!storeUrl) {
  console.error("missing --url=<https://…/images/mosaic_image/s0/>");
  process.exit(1);
}
const durationSec = Number(args.get("duration") ?? 300);
const readers = Number(args.get("readers") ?? 30);
const gapMs = Number(args.get("gap-ms") ?? 120);
const MAX_RETRIES = 6;
const BASE_BACKOFF_MS = 250;
const CDN_TTL_MS = 60 * 60 * 1000;

const base = storeUrl.endsWith("/") ? storeUrl : `${storeUrl}/`;

function jitter(ms) {
  return ms + Math.random() * ms * 0.25;
}

function parseMaxAge(cacheControl) {
  if (!cacheControl) return null;
  const m = /max-age=(\d+)/i.exec(cacheControl);
  return m ? Number(m[1]) * 1000 : null;
}

function percentile(samples, p) {
  if (!samples.length) return 0;
  const sorted = [...samples].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1);
  return sorted[idx];
}

const absent = new Set();
const cdnByLogical = new Map();

async function fetchWithRetry(url, init) {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const res = await fetch(url, init);
    if (res.status !== 429) return res;
    await sleep(jitter(BASE_BACKOFF_MS * 2 ** attempt));
  }
  throw new Error("429 after retries");
}

async function volumeRangeGet(logicalHref, range) {
  if (absent.has(logicalHref)) {
    return { status: 404, ms: 0, bytes: 0, cachedAbsent: true };
  }
  const now = Date.now();
  const cached = cdnByLogical.get(logicalHref);
  const requestUrl = cached && cached.expiresAt > now ? cached.url : logicalHref;
  const headers = { Range: `bytes=${range.offset}-${range.offset + range.length - 1}` };
  const started = performance.now();
  try {
    const res = await fetchWithRetry(requestUrl, { headers, redirect: "follow" });
    const ms = performance.now() - started;
    if (!cached || cached.expiresAt <= now) {
      const ttl = parseMaxAge(res.headers.get("cache-control")) ?? CDN_TTL_MS;
      cdnByLogical.set(logicalHref, { url: res.url || logicalHref, expiresAt: now + ttl });
    }
    if (res.status === 404) {
      absent.add(logicalHref);
      return { status: 404, ms, bytes: 0 };
    }
    if (res.status !== 200 && res.status !== 206) {
      return { status: res.status, ms, bytes: 0 };
    }
    const buf = await res.arrayBuffer();
    return { status: res.status, ms, bytes: buf.byteLength };
  } catch {
    return { status: 0, ms: performance.now() - started, bytes: 0 };
  }
}

function hfTreeUrl(storeBase) {
  const m = /\/datasets\/([^/]+)\/([^/]+)\/resolve\/main\/(.+)$/.exec(storeBase.replace(/\/$/, ""));
  if (!m) return null;
  const [, org, name, subpath] = m;
  return `https://huggingface.co/api/datasets/${org}/${name}/tree/main/${subpath}/c?recursive=true`;
}

async function discoverShardObjects() {
  const metaRes = await fetch(`${base}zarr.json`);
  if (!metaRes.ok) throw new Error(`zarr.json ${metaRes.status}`);
  const meta = await metaRes.json();
  const isSharded = meta.codecs?.some((c) => c.name === "sharding_indexed");
  const paths = [{ href: `${base}zarr.json`, size: 0 }];
  if (!isSharded) return paths;

  const treeUrl = hfTreeUrl(base);
  if (!treeUrl) {
    paths.push({ href: `${base}c/0/0/0/0`, size: 0 });
    return paths;
  }
  const treeRes = await fetch(treeUrl);
  if (!treeRes.ok) {
    paths.push({ href: `${base}c/0/0/0/0`, size: 0 });
    return paths;
  }
  const tree = await treeRes.json();
  const prefix = /\/resolve\/main\/(.+)$/.exec(base.replace(/\/$/, ""))?.[1] ?? "";
  for (const entry of tree) {
    if (entry.type !== "file") continue;
    const rel = entry.path.startsWith(prefix) ? entry.path.slice(prefix.length + 1) : entry.path.split("/c/").pop();
    if (rel) paths.push({ href: `${base}${rel}`, size: Number(entry.size) || 0 });
  }
  return paths.length > 1 ? paths : [{ href: `${base}c/0/0/0/0`, size: 0 }];
}

function pickInspectRead(objects) {
  const obj = objects[Math.floor(Math.random() * objects.length)];
  const { href, size } = obj;
  if (href.endsWith("zarr.json")) {
    return { href, range: { offset: 0, length: 4096 } };
  }
  const kind = Math.random();
  if (kind < 0.4) {
    const length = Math.min(65536, size || 65536);
    return { href, range: { offset: 0, length } };
  }
  if (kind < 0.65) {
    const suffixLen = Math.min(8192, size || 8192);
    const offset = Math.max(0, (size || suffixLen) - suffixLen);
    return { href, range: { offset, length: suffixLen } };
  }
  const length = Math.min(262144, Math.max(4096, size || 262144));
  const maxStart = Math.max(0, (size || length) - length);
  const offset = Math.floor(Math.random() * (maxStart + 1));
  return { href, range: { offset, length: Math.min(length, (size || length) - offset) } };
}

const objects = await discoverShardObjects();
const histogram = new Map();
const allMs = [];
const stopAt = Date.now() + durationSec * 1000;

async function readerLoop(id) {
  let errors = 0;
  while (Date.now() < stopAt) {
    const { href, range } = pickInspectRead(objects);
    const outcome = await volumeRangeGet(href, range);
    allMs.push(outcome.ms);
    histogram.set(outcome.status, (histogram.get(outcome.status) ?? 0) + 1);
    if (
      outcome.status === 0 ||
      (outcome.status !== 200 && outcome.status !== 206 && outcome.status !== 404 && outcome.status !== 416)
    ) {
      errors++;
    }
    await sleep(gapMs + (id % 5) * 7);
  }
  return { id, errors };
}

const results = await Promise.all(Array.from({ length: readers }, (_, id) => readerLoop(id)));
const summary = {
  url: storeUrl,
  duration_sec: durationSec,
  readers,
  shard_objects: objects.length,
  absent_cached: absent.size,
  cdn_entries: cdnByLogical.size,
  total_requests: allMs.length,
  errors: results.reduce((n, r) => n + r.errors, 0),
  throttled_429: histogram.get(429) ?? 0,
  status_histogram: Object.fromEntries([...histogram.entries()].sort((a, b) => a[0] - b[0])),
  latency_ms: {
    p50: Math.round(percentile(allMs, 0.5)),
    p95: Math.round(percentile(allMs, 0.95)),
  },
};
console.log(JSON.stringify(summary, null, 2));
if (summary.throttled_429 > 0) process.exit(2);
