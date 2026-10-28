#!/usr/bin/env node
/** Capture integrated recipe page in light and dark (headless Chromium). */
import { chromium } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const outDir = "/opt/cursor/artifacts";
const pageUrl =
  "http://127.0.0.1:8765/docs/recipes/squidpy_color/index.html";

const report = { url: pageUrl, modes: {} };

mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ headless: true });

for (const [scheme, label] of [
  ["default", "light"],
  ["slate", "dark"],
]) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  await page.goto(pageUrl, { waitUntil: "networkidle", timeout: 120_000 });
  await page.evaluate((s) => {
    document.body.setAttribute("data-md-color-scheme", s);
    document.documentElement.setAttribute("data-md-color-scheme", s);
  }, scheme);
  await page.waitForTimeout(3000);
  await page.locator("canvas").first().waitFor({ state: "visible", timeout: 120_000 });
  await page.waitForTimeout(2000);
  const shot = `${outDir}/recipe-squidpy-zensical-${label}.png`;
  await page.screenshot({ path: shot, fullPage: true });
  const perf = await page.evaluate(() =>
    performance.getEntriesByType("resource").reduce((n, e) => n + (e.transferSize || 0), 0),
  );
  report.modes[label] = {
    screenshot: shot,
    console_errors: consoleErrors,
    resource_transfer_bytes: perf,
  };
  await context.close();
}

await browser.close();
writeFileSync(`${outDir}/recipe-zensical-capture.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
if (Object.values(report.modes).some((m) => m.console_errors.length)) process.exit(1);
