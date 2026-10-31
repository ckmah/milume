#!/usr/bin/env node
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const url =
  process.argv[2] ??
  "http://127.0.0.1:8765/docs/how-to/recipes/squidpy_color/index.html";
const outDir = "/opt/cursor/artifacts/recipe-niche-pilot";
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await page.goto(url, { waitUntil: "networkidle", timeout: 120_000 });
await page.locator("canvas").first().waitFor({ state: "visible", timeout: 120_000 });
await page.waitForTimeout(2000);

await page.screenshot({
  path: `${outDir}/01-intro-and-squidpy-cell.png`,
  fullPage: true,
});

await page.locator(".milume-recipe-studio-prose").first().scrollIntoViewIfNeeded();
await page.screenshot({
  path: `${outDir}/02-prose-blocks.png`,
  fullPage: true,
});

const wide = page.locator(".milume-recipe-studio-wide");
await wide.scrollIntoViewIfNeeded();
await page.waitForFunction(
  () => {
    const overlay = window.__landmarksEngine?.getSelectionOverlay?.();
    return overlay?.some((row) => row.index === 0 && row.selected && row.pointCount > 0);
  },
  { timeout: 30_000 },
);
await page.waitForTimeout(1500);
await page.screenshot({
  path: `${outDir}/03-widget-default-niche-k30-res0.3.png`,
  fullPage: true,
});

await page.evaluate(() => {
  const root = document.querySelector("marimo-anywidget")?.shadowRoot;
  if (!root) return;
  const tab = [...root.querySelectorAll("button")].find((b) => b.textContent?.trim() === "cat");
  tab?.click();
  const row = [...root.querySelectorAll("button, [role='option']")].find((el) =>
    el.textContent?.trim().startsWith("niche_k8_res0.3"),
  );
  row?.click();
});
await page.waitForFunction(() => {
  const root = document.querySelector("marimo-anywidget")?.shadowRoot;
  const active = root?.querySelector(".landmarks-info__category-active, [data-active-category]");
  return Boolean(active?.textContent?.includes("niche_k8_res0.3"));
}, { timeout: 10_000 }).catch(() => {});
await page.waitForTimeout(1500);
await page.screenshot({
  path: `${outDir}/04-widget-niche-k8-res0.3-column.png`,
  fullPage: true,
});

await page.screenshot({ path: `${outDir}/05-full-page-composition-and-molab.png`, fullPage: true });

await wide.scrollIntoViewIfNeeded();
await page.waitForTimeout(800);
await page.screenshot({
  path: `${outDir}/06-lasso-selection-in-view.png`,
  fullPage: true,
});

await browser.close();
console.log(`wrote screenshots under ${outDir}`);
