#!/usr/bin/env node
/**
 * PR visual evidence for ileum GALT lasso (#405): built docs tutorial page + zoomed widget.
 *
 * Prereq:
 *   SITE_ROOT=/tmp/milume-docs-405 (from website/scripts/assemble-pages.sh with zensical on PATH)
 *   cd frontend && npm run dev:landmarks &
 *   node scripts/capture-galt-pr-evidence.mjs
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "@playwright/test";

import {
  applyDocsHarnessTheme,
  hideDocsHarnessChrome,
  installDocsCaptureChrome,
  gotoDocsFixture,
  waitForLandmarks,
} from "./lib/docs-tool-media.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const outDir = process.env.CAPTURE_OUT ?? "/opt/cursor/artifacts";
const siteRoot = process.env.SITE_ROOT ?? "/tmp/milume-docs-405";
const tutorialUrl =
  process.env.TUTORIAL_URL ??
  `file://${siteRoot}/docs/get-started/tutorial-explore-cells-2d/index.html`;
const baseUrl = process.env.LANDMARKS_URL ?? "http://localhost:5173";
const ileumFixture = "/ileum-docs-base.json";
const polygons = JSON.parse(
  readFileSync(join(root, "frontend", "dev", "galt-aggregate-polygons.json"), "utf8"),
);
const pointIndices = JSON.parse(
  readFileSync(join(root, "frontend", "dev", "galt-point-indices.json"), "utf8"),
);

async function setModel(page, patch) {
  await page.evaluate((p) => {
    const model = window.__landmarksModel;
    for (const [k, v] of Object.entries(p)) model.set(k, v);
    model.save_changes();
  }, patch);
}

async function fitWesternLasso(page) {
  await page.evaluate((westVerts) => {
    const eng = window.__landmarksEngine;
    eng.resetZoom();
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const [x, y] of westVerts) {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
    const pad = 90;
    minX -= pad;
    minY -= pad;
    maxX += pad;
    maxY += pad;
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    eng.panTo(cx, cy, { animate: false });
    const span = Math.max(maxX - minX, maxY - minY);
    const targetSpan = 420;
    const steps = Math.max(0, Math.min(10, Math.round(Math.log2(span / targetSpan))));
    for (let i = 0; i < steps; i++) {
      eng.zoomBy(1, { animate: false });
    }
  }, polygons.west);
  await page.waitForTimeout(400);
}

async function captureDocsTutorial(page) {
  await page.goto(tutorialUrl, { waitUntil: "networkidle", timeout: 120_000 });
  await page.evaluate(() => {
    document.body.setAttribute("data-md-color-scheme", "slate");
    document.documentElement.setAttribute("data-md-color-scheme", "slate");
  });
  const heading = page.getByRole("heading", { name: /Lasso GALT cryptopatch aggregates/i });
  await heading.scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await page.mouse.move(640, 420);
  const out = join(outDir, "tutorial-explore-cells-2d-docs-1280.png");
  await page.screenshot({ path: out, fullPage: false });
  console.log("wrote", out);
}

async function captureWidgetCloseup(page) {
  await installDocsCaptureChrome(page, "dark");
  await gotoDocsFixture(page, baseUrl, ileumFixture);
  await applyDocsHarnessTheme(page, "dark");
  await setModel(page, {
    mode: "select",
    render_mode: "points",
    active_category: "cell_type",
    color_mode: "categorical",
    selections: [
      { id: "galt-aggregates-west", type: "polygon", vertices: polygons.west },
      { id: "galt-aggregates-east", type: "polygon", vertices: polygons.east },
      { id: `GALT · ${pointIndices.length}`, point_indices: pointIndices },
    ],
    selected_kind: "selection",
    selected_index: 0,
  });
  await waitForLandmarks(page);
  await fitWesternLasso(page);
  await page.mouse.move(700, 380);
  await hideDocsHarnessChrome(page);
  const out = join(outDir, "galt-lasso-widget-closeup-1280.png");
  await page.locator(".landmarks").first().screenshot({ path: out });
  console.log("wrote", out);
}

async function main() {
  const browser = await chromium.launch({
    headless: true,
    args: ["--enable-webgl", "--ignore-gpu-blocklist"],
  });
  try {
    const docsPage = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await captureDocsTutorial(docsPage);
    await docsPage.close();

    const widgetPage = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await captureWidgetCloseup(widgetPage);
    await widgetPage.close();
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
