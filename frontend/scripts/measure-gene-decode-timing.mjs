#!/usr/bin/env node
/**
 * Browser timing: widget load through first gene colour (gzip vs raw CSC).
 *
 * Usage:
 *   node scripts/measure-gene-decode-timing.mjs [baseUrl]
 *
 * With baseUrl omitted, measures the ileum all-genes payload probe on the assembled
 * docs site (gzip) and a harness fixture export with raw CSC (same 8k-cell subsample).
 */
import { chromium } from "@playwright/test";

const base = process.argv[2] ?? "http://127.0.0.1:8765";
const gzipUrl = `${base}/docs/how-to/recipes/ileum_all_genes_payload/index.html`;
const rawHarnessUrl = `${base.replace(/\/$/, "") === "http://127.0.0.1:8765" ? "http://127.0.0.1:5173" : base}/?fixture=/ileum-all-genes-raw-fixture.json&eagerGenes=1`;

async function measureRecipePage(page, url, label) {
  await page.goto(url, { waitUntil: "networkidle", timeout: 180_000 });
  await page.waitForFunction(() => Boolean(window.__landmarksEngine), undefined, {
    timeout: 180_000,
  });
  return page.evaluate(async (tag) => {
    const model = window.__landmarksModel;
    const eng = window.__landmarksEngine;
    const genes = model.get("gene_names").map((g) => g.name);
    const gene = genes.find((n) => n === "Lgr5") ?? genes[0];
    const t0 = performance.now();
    await new Promise((resolve) => {
      const tick = () => {
        if (eng.getGeneStats().pinnedGenes === genes.length) resolve(undefined);
        else requestAnimationFrame(tick);
      };
      tick();
    });
    const decodeMs = performance.now() - t0;
    model.set({ active_genes: [gene], color_mode: "continuous" });
    await new Promise((resolve) => {
      const tick = () => {
        if (eng.getGeneStats().denseColumns >= 1) resolve(undefined);
        else requestAnimationFrame(tick);
      };
      tick();
    });
    return {
      label: tag,
      codec: model.get("gene_csc_codec") || "(raw)",
      nGenes: genes.length,
      decodeMs: Math.round(decodeMs * 10) / 10,
      colourMs: Math.round((performance.now() - t0) * 10) / 10,
      gene,
    };
  }, label);
}

async function measureHarnessPage(page, url, label) {
  await page.goto(url, { waitUntil: "load", timeout: 180_000 });
  await page.waitForFunction(() => Boolean(window.__landmarksEngine), undefined, {
    timeout: 180_000,
  });
  return page.evaluate(async (tag) => {
    const model = window.__landmarksModel;
    const eng = window.__landmarksEngine;
    const genes = model.get("gene_names").map((g) => g.name);
    const gene = genes.find((n) => n === "Lgr5") ?? genes[0];
    const t0 = performance.now();
    await new Promise((resolve) => {
      const tick = () => {
        if (eng.getGeneStats().pinnedGenes === genes.length) resolve(undefined);
        else requestAnimationFrame(tick);
      };
      tick();
    });
    const decodeMs = performance.now() - t0;
    model.set({ active_genes: [gene], color_mode: "continuous" });
    await new Promise((resolve) => {
      const tick = () => {
        if (eng.getGeneStats().denseColumns >= 1) resolve(undefined);
        else requestAnimationFrame(tick);
      };
      tick();
    });
    return {
      label: tag,
      codec: model.get("gene_csc_codec") || "(raw)",
      nGenes: genes.length,
      decodeMs: Math.round(decodeMs * 10) / 10,
      colourMs: Math.round((performance.now() - t0) * 10) / 10,
      gene,
    };
  }, label);
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

let gzip;
let raw;
try {
  gzip = await measureRecipePage(page, gzipUrl, "gzip-recipe");
} catch (err) {
  console.error("gzip recipe measure failed:", err);
  throw err;
}

try {
  raw = await measureHarnessPage(page, rawHarnessUrl, "raw-harness");
} catch (err) {
  console.warn("raw harness measure failed (dev server may be down):", err.message);
  raw = { label: "raw-harness", error: String(err.message) };
}

await browser.close();
console.log(JSON.stringify({ gzip, raw }, null, 2));
