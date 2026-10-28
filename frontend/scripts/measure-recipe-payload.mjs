#!/usr/bin/env node
/** Measure recipe page transfer bytes (PerformanceResourceTiming.transferSize). */
import { chromium } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";

const pageUrl =
  process.argv[2] ??
  "http://127.0.0.1:8765/docs/recipes/squidpy_color/index.html";
const outPath = process.argv[3] ?? "/opt/cursor/artifacts/recipe-payload-breakdown.json";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.goto(pageUrl, { waitUntil: "networkidle", timeout: 120_000 });
await page.locator("canvas").first().waitFor({ state: "visible", timeout: 120_000 });
await page.waitForTimeout(1500);

const entries = await page.evaluate(() =>
  performance.getEntriesByType("resource").map((entry) => ({
    name: entry.name,
    transferSize: entry.transferSize || 0,
    encodedBodySize: entry.encodedBodySize || 0,
    decodedBodySize: entry.decodedBodySize || 0,
  })),
);

await browser.close();

function bucket(url) {
  if (url.startsWith("blob:")) return "milume_widget_bundle";
  if (url.includes(".cell.json")) return "prepared_state_data";
  if (
    url.includes("marimo-studio-zero-python") ||
    url.includes("zero-python.js") ||
    url.includes("/zero-python/")
  )
    return "marimo_runtime_js_css";
  if (url.includes("fonts.googleapis") || url.includes("fonts.gstatic")) return "fonts";
  if (url.includes("/assets/stylesheets/") || url.includes("/assets/javascripts/"))
    return "zensical_site";
  return "other";
}

const byBucket = {};
let total = 0;
for (const entry of entries) {
  const size = entry.transferSize || entry.encodedBodySize || entry.decodedBodySize;
  total += size;
  const b = bucket(entry.name);
  byBucket[b] = (byBucket[b] ?? 0) + size;
}

const report = {
  pageUrl,
  total_transfer_bytes: total,
  by_bucket: byBucket,
  top_requests: entries
    .map((e) => ({
      size: e.transferSize || e.encodedBodySize || e.decodedBodySize,
      url: e.name,
    }))
    .sort((a, b) => b.size - a.size)
    .slice(0, 20),
};
mkdirSync("/opt/cursor/artifacts", { recursive: true });
writeFileSync(outPath, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
