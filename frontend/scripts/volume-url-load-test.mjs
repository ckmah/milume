/**
 * Stress-read a public SpatialData zarr store like a browser panning Inspect.
 *
 * Usage:
 *   node scripts/volume-url-load-test.mjs --url https://…/colon_a2.zarr/images/mosaic/ --duration 300 --readers 30
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
  console.error("missing --url=<https://…/store.zarr/images/mosaic/>");
  process.exit(1);
}
const durationSec = Number(args.get("duration") ?? 300);
const readers = Number(args.get("readers") ?? 30);
const gapMs = Number(args.get("gap-ms") ?? 120);

const base = storeUrl.endsWith("/") ? storeUrl : `${storeUrl}/`;

async function fetchRange(href, range) {
  const headers = { Range: `bytes=${range.offset}-${range.offset + range.length - 1}` };
  const started = performance.now();
  const res = await fetch(href, { headers });
  const ms = performance.now() - started;
  if (res.status === 429) {
    return { status: 429, ms, bytes: 0 };
  }
  if (!res.ok && res.status !== 206) {
    return { status: res.status, ms, bytes: 0 };
  }
  const buf = await res.arrayBuffer();
  return { status: res.status, ms, bytes: buf.byteLength };
}

async function readerLoop(id, stopAt) {
  const samples = [];
  let errors = 0;
  let throttled = 0;
  while (Date.now() < stopAt) {
    const href = `${base}zarr.json`;
    const outcome = await fetchRange(href, { offset: 0, length: 4096 }).catch(() => ({
      status: 0,
      ms: 0,
      bytes: 0,
    }));
    samples.push(outcome.ms);
    if (outcome.status === 429) throttled++;
    if (outcome.status === 0 || (outcome.status !== 200 && outcome.status !== 206)) errors++;
    await sleep(gapMs + (id % 5) * 7);
  }
  samples.sort((a, b) => a - b);
  const median = samples[Math.floor(samples.length / 2)] ?? 0;
  return { id, requests: samples.length, errors, throttled, median_ms: Math.round(median) };
}

const stopAt = Date.now() + durationSec * 1000;
const results = await Promise.all(
  Array.from({ length: readers }, (_, id) => readerLoop(id, stopAt)),
);
const summary = {
  url: storeUrl,
  duration_sec: durationSec,
  readers,
  total_requests: results.reduce((n, r) => n + r.requests, 0),
  errors: results.reduce((n, r) => n + r.errors, 0),
  throttled_429: results.reduce((n, r) => n + r.throttled, 0),
  median_ms_per_reader: results.map((r) => r.median_ms),
};
console.log(JSON.stringify(summary, null, 2));
if (summary.throttled_429 > 0) process.exit(2);
