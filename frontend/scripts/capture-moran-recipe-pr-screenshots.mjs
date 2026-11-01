#!/usr/bin/env node
/** PR #415 Moran recipe static page: Erbb3 default, Apob contrast, Moran panels. */
import { mkdirSync } from "node:fs";
import { chromium } from "@playwright/test";

const url =
  process.argv[2] ??
  "http://127.0.0.1:8765/how-to/recipes/squidpy_moran/index.html";
const outDir = process.argv[3] ?? "/opt/cursor/artifacts/recipe-moran-409";
const viewport = { width: 1280, height: 900 };

mkdirSync(outDir, { recursive: true });

async function setGeneColor(page, gene) {
  await page.evaluate((g) => {
    const model = window.__landmarksModel;
    if (!model) throw new Error("missing __landmarksModel");
    model.set("color", g);
    model.set("active_genes", [g]);
    model.set("color_mode", "continuous");
    model.save_changes();
  }, gene);
  await page.waitForTimeout(1200);
}

async function captureMap(page, suffix, filename) {
  const wide = page.locator(".milume-recipe-studio-wide").first();
  await wide.scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  const wideBox = await wide.boundingBox();
  if (!wideBox) throw new Error("widget wide box missing");
  await page.screenshot({
    path: `${outDir}/${filename}-${suffix}.png`,
    clip: {
      x: Math.max(0, wideBox.x - 8),
      y: Math.max(0, wideBox.y - 8),
      width: Math.min(viewport.width - wideBox.x + 8, wideBox.width + 16),
      height: Math.min(viewport.height - wideBox.y + 8, wideBox.height + 16),
    },
  });
}

async function captureResultPanels(page, suffix, prefix) {
  const resultCell = page
    .locator('[data-marimo-studio-site][name="result_figure"], marimo-cell[name="result_figure"]')
    .last();
  await resultCell.scrollIntoViewIfNeeded();
  await page.waitForTimeout(800);
  const plotImg = page.locator(".milume-recipe-studio-prose img").last();
  await plotImg.waitFor({ state: "visible", timeout: 120_000 });
  const box = await plotImg.boundingBox();
  if (!box) throw new Error("result_figure image missing");
  const mid = box.x + box.width * 0.52;
  await page.screenshot({
    path: `${outDir}/${prefix}-scatter-${suffix}.png`,
    clip: { x: box.x, y: box.y, width: mid - box.x, height: box.height },
  });
  await page.screenshot({
    path: `${outDir}/${prefix}-villus-profile-${suffix}.png`,
    clip: { x: mid, y: box.y, width: box.width - (mid - box.x), height: box.height },
  });
}

async function captureMode(page, scheme, suffix) {
  await page.goto(url, { waitUntil: "networkidle", timeout: 120_000 });
  await page.evaluate((s) => {
    document.body.setAttribute("data-md-color-scheme", s);
    document.documentElement.setAttribute("data-md-color-scheme", s);
  }, scheme);
  if (scheme === "slate") {
    await page.waitForFunction(
      () => {
        const host = document.querySelector("marimo-anywidget");
        return Boolean(host?.shadowRoot?.querySelector(".landmarks.landmarks--dark"));
      },
      { timeout: 30_000 },
    );
  }
  await page.locator("canvas").first().waitFor({ state: "visible", timeout: 120_000 });
  await page.waitForTimeout(1500);

  await captureMap(page, suffix, "01-static-default-erbb3");
  await captureResultPanels(page, suffix, "02-static-erbb3");

  await setGeneColor(page, "Apob");
  await captureMap(page, suffix, "03-static-contrast-apob");
  await captureResultPanels(page, suffix, "04-static-apob");
}

const browser = await chromium.launch({ headless: true });
for (const [scheme, suffix] of [
  ["default", "light"],
  ["slate", "dark"],
]) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  await captureMode(page, scheme, suffix);
  await context.close();
}
await browser.close();
