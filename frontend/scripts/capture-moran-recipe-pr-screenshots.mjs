#!/usr/bin/env node
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
await page.goto(url, { waitUntil: "load", timeout: 120_000 });
await page.locator("canvas").first().waitFor({ state: "visible", timeout: 120_000 });
await page.waitForTimeout(1500);

await page.locator(".milume-recipe-studio-wide").scrollIntoViewIfNeeded();
await page.waitForTimeout(400);
await page.screenshot({
  path: `${outDir}/01-static-default-apob.png`,
  fullPage: false,
});

const plotsCell = page.locator(".milume-recipe-studio-prose marimo-cell").last();
await plotsCell.scrollIntoViewIfNeeded();
await page.waitForTimeout(800);
const plotImg = plotsCell.locator("img").first();
await plotImg.waitFor({ state: "visible", timeout: 60_000 });
const box = await plotImg.boundingBox();
if (!box) throw new Error("moran_plots image missing");
const scatterHeight = Math.round(box.height * (3.8 / (3.8 + 2.4)));
await page.screenshot({
  path: `${outDir}/02-static-moran-scatter-apob.png`,
  clip: {
    x: box.x,
    y: box.y,
    width: box.width,
    height: scatterHeight,
  },
});
await page.screenshot({
  path: `${outDir}/03-static-moran-expression-apob.png`,
  clip: {
    x: box.x,
    y: box.y + scatterHeight,
    width: box.width,
    height: box.height - scatterHeight,
  },
});

await browser.close();
