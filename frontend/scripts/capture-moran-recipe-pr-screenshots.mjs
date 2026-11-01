#!/usr/bin/env node
import { mkdirSync } from "node:fs";
import { chromium } from "@playwright/test";

const url =
  process.argv[2] ??
  "http://127.0.0.1:8765/docs/how-to/recipes/squidpy_moran/index.html";
const outDir = "/opt/cursor/artifacts/recipe-moran-409";
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

await page.locator(".milume-recipe-studio-prose marimo-cell").last().scrollIntoViewIfNeeded();
await page.waitForTimeout(800);
await page.screenshot({
  path: `${outDir}/02-static-moran-plots-apob.png`,
  fullPage: false,
});

await browser.close();
