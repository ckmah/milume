#!/usr/bin/env node
/** Verify shared recipe widget ESM loads once and renders in light/dark. */
import { chromium } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";

const pageUrl =
  process.argv[2] ??
  "http://127.0.0.1:8765/docs/recipes/squidpy_color/index.html";
const outDir = "/opt/cursor/artifacts";

mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
const page = await context.newPage();

let widgetModuleRequests = 0;
page.on("request", (req) => {
  const url = req.url();
  if (url.includes("/assets/recipe-widgets/") && url.endsWith(".mjs")) {
    widgetModuleRequests += 1;
  }
});

await page.goto(pageUrl, { waitUntil: "networkidle", timeout: 120_000 });
await page.locator("canvas").first().waitFor({ state: "visible", timeout: 120_000 });
const requestsAfterFirstLoad = widgetModuleRequests;

await page.screenshot({
  path: `${outDir}/recipe-shared-esm-light.png`,
  fullPage: false,
});

await page.evaluate(() => {
  document.body.setAttribute("data-md-color-scheme", "slate");
  document.documentElement.setAttribute("data-md-color-scheme", "slate");
});
await page.waitForFunction(
  () => {
    const host = document.querySelector("marimo-anywidget");
    return Boolean(host?.shadowRoot?.querySelector(".landmarks.landmarks--dark"));
  },
  { timeout: 60_000 },
);
await page.screenshot({
  path: `${outDir}/recipe-shared-esm-dark.png`,
  fullPage: false,
});

await page.evaluate(() => performance.clearResourceTimings());
await page.goto(pageUrl, { waitUntil: "networkidle", timeout: 120_000 });
await page.locator("canvas").first().waitFor({ state: "visible", timeout: 120_000 });

const repeatWidgetTransfer = await page.evaluate(() => {
  let total = 0;
  for (const entry of performance.getEntriesByType("resource")) {
    if (!entry.name.includes("/assets/recipe-widgets/")) continue;
    total += entry.transferSize || 0;
  }
  return total;
});

await context.close();
await browser.close();

const report = {
  pageUrl,
  widgetModuleRequestsFirstLoad: requestsAfterFirstLoad,
  repeatNavigationWidgetTransferBytes: repeatWidgetTransfer,
  ok: requestsAfterFirstLoad >= 1 && repeatWidgetTransfer === 0,
};
writeFileSync(`${outDir}/recipe-shared-esm-verify.json`, JSON.stringify(report, null, 2));
if (!report.ok) {
  console.error(JSON.stringify(report, null, 2));
  process.exit(1);
}
console.log(JSON.stringify(report, null, 2));
