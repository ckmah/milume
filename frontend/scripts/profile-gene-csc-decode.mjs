#!/usr/bin/env node
/**
 * Profile gzip CSC decode: base64, inflate (per trait), parallel wall time.
 * Generates harness fixtures on demand (not committed).
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "@playwright/test";

const ROOT = join(import.meta.dirname, "..", "..");
const FIXTURE_DIR =
  process.env.MILUME_ILEUM_FIXTURE_DIR ?? join(ROOT, "frontend", "dev", ".ileum-gene-fixtures-cache");
const gzipPath = join(FIXTURE_DIR, "ileum-all-genes-gzip-fixture.json");

function ensureFixtures() {
  if (existsSync(gzipPath)) return;
  spawnSync(
    "uv",
    [
      "run",
      "--directory",
      ROOT,
      "python",
      join(ROOT, "scripts/export-ileum-all-genes-timing-fixtures.py"),
      "--output-dir",
      FIXTURE_DIR,
    ],
    { stdio: "inherit" },
  );
}

ensureFixtures();
const fixture = JSON.parse(readFileSync(gzipPath, "utf8"));

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.goto("about:blank");
const breakdown = await page.evaluate(async (payload) => {
  const traits = ["gene_csc_indptr", "gene_csc_indices", "gene_csc_data"];
  const b64ToBytes = async (b64) => {
    if (typeof Uint8Array.fromBase64 === "function") {
      return Uint8Array.fromBase64(b64, { alphabet: "base64" });
    }
    const ab = await (await fetch(`data:application/octet-stream;base64,${b64}`)).arrayBuffer();
    return new Uint8Array(ab);
  };
  const inflate = async (bytes) => {
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
    return new Response(stream).arrayBuffer();
  };
  const out = { b64Ms: {}, inflateMs: {}, parallelInflateMs: 0, b64TotalMs: 0 };
  const b64Bytes = {};
  let b64Sum = 0;
  for (const key of traits) {
    const t0 = performance.now();
    b64Bytes[key] = await b64ToBytes(payload[key]);
    const ms = performance.now() - t0;
    b64Sum += ms;
    out.b64Ms[key] = Math.round(ms * 10) / 10;
  }
  out.b64TotalMs = Math.round(b64Sum * 10) / 10;
  const tPar = performance.now();
  await Promise.all(
    traits.map(async (key) => {
      const t0 = performance.now();
      await inflate(b64Bytes[key]);
      out.inflateMs[key] = Math.round((performance.now() - t0) * 10) / 10;
    }),
  );
  out.parallelInflateMs = Math.round((performance.now() - tPar) * 10) / 10;
  return out;
}, fixture);

await browser.close();
console.log(JSON.stringify({ fixtureDir: FIXTURE_DIR, breakdown }, null, 2));
