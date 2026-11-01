#!/usr/bin/env node
/** PR #415 Moran recipe static page: Apob default widget + result_figure panels. */
import { mkdirSync } from "node:fs";
import { chromium } from "@playwright/test";

const url =
  process.argv[2] ??
  "http://127.0.0.1:8765/docs/how-to/recipes/squidpy_moran/index.html";
const outDir = process.argv[3] ?? "/opt/cursor/artifacts/recipe-moran-409";
const viewport = { width: 1280, height: 900 };

mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport });
await page.goto(url, { waitUntil: "networkidle", timeout: 120_000 });
await page.locator("canvas").first().waitFor({ state: "visible", timeout: 120_000 });
await page.waitForTimeout(1500);

const wide = page.locator(".milume-recipe-studio-wide").first();
await wide.scrollIntoViewIfNeeded();
await page.waitForTimeout(400);
const wideBox = await wide.boundingBox();
if (!wideBox) throw new Error("widget wide box missing");
await page.screenshot({
  path: `${outDir}/01-static-default-apob.png`,
  clip: {
    x: Math.max(0, wideBox.x - 8),
    y: Math.max(0, wideBox.y - 8),
    width: Math.min(viewport.width - wideBox.x + 8, wideBox.width + 16),
    height: Math.min(viewport.height - wideBox.y + 8, wideBox.height + 16),
  },
});

const resultCell = page.locator('[data-marimo-studio-site][name="result_figure"], marimo-cell[name="result_figure"]').last();
if ((await resultCell.count()) === 0) {
  await page.locator(".milume-recipe-studio-prose marimo-cell").last().scrollIntoViewIfNeeded();
} else {
  await resultCell.scrollIntoViewIfNeeded();
}
await page.waitForTimeout(800);
const plotImg = page.locator(".milume-recipe-studio-prose img").last();
await plotImg.waitFor({ state: "visible", timeout: 120_000 });
const box = await plotImg.boundingBox();
if (!box) throw new Error("result_figure image missing");
const mid = box.x + box.width * 0.52;
await page.screenshot({
  path: `${outDir}/02-static-moran-scatter-apob.png`,
  clip: { x: box.x, y: box.y, width: mid - box.x, height: box.height },
});
await page.screenshot({
  path: `${outDir}/03-static-moran-contrast-apob-erbb3.png`,
  clip: { x: mid, y: box.y, width: box.width - (mid - box.x), height: box.height },
});

await browser.close();
