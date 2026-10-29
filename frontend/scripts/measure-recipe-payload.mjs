#!/usr/bin/env node
/** Measure recipe page transfer bytes (PerformanceResourceTiming.transferSize). */
import { chromium } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";

const pageUrl =
  process.argv[2] ??
  "http://127.0.0.1:8765/docs/how-to/recipes/squidpy_color/index.html";
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

/** Split prepared cell JSON into widget JS vs widget state/data bytes (decoded). */
function cellJsonBudgetSplit(text) {
  const json = JSON.parse(text);
  const enc = (s) => new TextEncoder().encode(s).length;
  let widgetJs = 0;
  let data = 0;
  for (const [key, val] of Object.entries(json.resources?.files ?? {})) {
    if (typeof val !== "string") continue;
    const n = enc(val);
    if (val.startsWith("data:") && (key.includes("anywidget") || val.startsWith("data:text/javascript"))) {
      widgetJs += n;
    } else {
      data += n;
    }
  }
  for (const val of Object.values(json.resources?.functions ?? {})) {
    if (typeof val === "string") data += enc(val);
  }
  data += enc(JSON.stringify(json.resources?.modelNotifications ?? []));
  data += enc(JSON.stringify(json.resources?.uiValues ?? {}));
  data += enc(
    JSON.stringify({
      cell: json.cell,
      console: json.console,
      outcome: json.outcome,
      output: json.output,
    }),
  );
  return { widgetJs, data, decoded: enc(text) };
}

const cellJsonSplits = await page.evaluate(async () => {
  const urls = performance
    .getEntriesByType("resource")
    .map((e) => e.name)
    .filter((u) => u.includes(".cell.json"));
  const out = {};
  for (const url of urls) {
    const resp = await fetch(url);
    const text = await resp.text();
    out[url] = { decodedBytes: new TextEncoder().encode(text).length, text };
  }
  return out;
});

await browser.close();

function entryBytes(entry) {
  return entry.transferSize || entry.encodedBodySize || entry.decodedBodySize;
}

function baseCategory(url) {
  if (url.startsWith("blob:")) return "widget_js";
  if (url.includes("/assets/recipe-widgets/") && url.endsWith(".mjs")) return "widget_js";
  if (url.includes(".cell.json")) return "cell_json";
  if (
    url.includes("marimo-studio-zero-python") ||
    url.includes("zero-python.js") ||
    url.includes("/zero-python/")
  ) {
    return "marimo_runtime";
  }
  if (url.includes("fonts.googleapis") || url.includes("fonts.gstatic")) return "fonts";
  if (url.includes("/assets/stylesheets/") || url.includes("/assets/javascripts/")) return "zensical_site";
  if (url.includes(".cell.json")) return "cell_json";
  return "other";
}

const byCategory = {
  widget_js: 0,
  marimo_runtime: 0,
  widget_state_and_data: 0,
  zensical_site: 0,
  fonts: 0,
  other: 0,
};

let total = 0;
let dataTransfer = 0;

for (const entry of entries) {
  const size = entryBytes(entry);
  total += size;
  const url = entry.name;
  let category = baseCategory(url);

  if (category === "cell_json") {
    const split = cellJsonSplits[url];
    let widgetJs = 0;
    let dataPart = 0;
    if (split?.text) {
      try {
        ({ widgetJs, data: dataPart } = cellJsonBudgetSplit(split.text));
      } catch {
        widgetJs = 0;
        dataPart = size;
      }
    }
    const decoded = split?.decodedBytes || size;
    const jsTransfer = decoded > 0 ? Math.round((size * widgetJs) / decoded) : 0;
    const dataTransferPart =
      decoded > 0 ? Math.round((size * dataPart) / decoded) : Math.max(0, size - jsTransfer);
    byCategory.widget_js += jsTransfer;
    byCategory.widget_state_and_data += dataTransferPart;
    continue;
  }

  byCategory[category] = (byCategory[category] ?? 0) + size;
}

dataTransfer = byCategory.widget_state_and_data;

const report = {
  pageUrl,
  total_transfer_bytes: total,
  data_transfer_bytes: dataTransfer,
  by_category: byCategory,
  top_requests: entries
    .map((e) => ({
      size: entryBytes(e),
      url: e.name,
      category: baseCategory(e.name),
    }))
    .sort((a, b) => b.size - a.size)
    .slice(0, 20),
};
mkdirSync("/opt/cursor/artifacts", { recursive: true });
writeFileSync(outPath, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
