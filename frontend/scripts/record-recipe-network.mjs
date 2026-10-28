#!/usr/bin/env node
/** Record JS/CSS URLs loaded by a recipe page (for chunk pruning). */
import { chromium } from "@playwright/test";
import { writeFileSync } from "node:fs";

const pageUrl =
  process.argv[2] ??
  "http://127.0.0.1:8765/docs/recipes/squidpy_color/index.html";
const outPath = process.argv[3] ?? "/tmp/recipe-loaded-urls.json";

const urls = [];
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
page.on("response", (response) => {
  const url = response.url();
  if (response.status() >= 400) return;
  urls.push(url);
});
await page.goto(pageUrl, { waitUntil: "networkidle", timeout: 120_000 });
try {
  await page.locator("canvas").first().waitFor({ state: "visible", timeout: 120_000 });
} catch {
  await page.waitForTimeout(3000);
}
await browser.close();

writeFileSync(outPath, JSON.stringify([...new Set(urls)], null, 2));
console.log(`recorded ${new Set(urls).size} urls -> ${outPath}`);
