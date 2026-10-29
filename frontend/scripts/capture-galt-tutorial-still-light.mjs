#!/usr/bin/env node
/**
 * Capture light still-galt-selection for the 2D tutorial (issue #372).
 *
 * Prereq:
 *   uv run --group demo python scripts/export-ileum-docs-base.py --max-cells 0
 *   cd frontend && npm run dev:landmarks &
 *   node scripts/capture-galt-tutorial-still-light.mjs
 *
 * Env: LANDMARKS_URL (default http://127.0.0.1:5173)
 *      GALT_INDICES_JSON (default repo uploads path when present, else none)
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "@playwright/test";

import {
  DATASET_ID,
  VIEWPORT,
  applyDocsHarnessTheme,
  installDocsCaptureChrome,
  gotoDocsFixture,
  milumeSidecarSha,
  screenshotLandmarks,
  waitForLandmarks,
} from "./lib/docs-tool-media.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const assets = join(root, "website", "content", "assets", "tutorials", "explore-cells-2d");
const baseUrl = process.env.LANDMARKS_URL ?? "http://127.0.0.1:5173";
const ileumFixture = "/ileum-docs-base.json";
const indicesPath =
  process.env.GALT_INDICES_JSON ??
  join(root, "frontend", "dev", "galt-point-indices.json");
const pointIndices = JSON.parse(readFileSync(indicesPath, "utf8"));
if (!Array.isArray(pointIndices) || pointIndices.length !== 551) {
  throw new Error(`expected 551 point indices, got ${pointIndices?.length}`);
}

async function setModel(page, patch) {
  await page.evaluate((p) => {
    const model = window.__landmarksModel;
    for (const [k, v] of Object.entries(p)) model.set(k, v);
    model.save_changes();
  }, patch);
}

async function fitViewToSelection(page, indices) {
  await page.evaluate((idx) => {
    const eng = window.__landmarksEngine;
    const pts = eng.getPoints();
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const i of idx) {
      const [x, y] = pts[i];
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
    const pad = Math.max(maxX - minX, maxY - minY) * 0.55 + 80;
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const wantW = maxX - minX + pad * 2;
    const wantH = maxY - minY + pad * 2;
    eng.resetZoom();
    eng.panTo(cx, cy, { animate: false });
    for (let step = 0; step < 48; step++) {
      const b = eng.getViewportWorldBounds();
      if (!b) break;
      const w = b[2] - b[0];
      const h = b[3] - b[1];
      if (w <= wantW && h <= wantH) break;
      eng.zoomBy(0.12, { animate: false });
    }
  }, indices);
  await page.waitForTimeout(450);
}

async function prepareGaltView(page) {
  await setModel(page, {
    mode: "select",
    render_mode: "points",
    active_category: "cell_type",
    color_mode: "categorical",
    active_genes: [],
    selections: [
      {
        id: "galt-follicle",
        point_indices: pointIndices,
      },
    ],
    selected_kind: "selection",
    selected_index: 0,
    landmarks: [],
  });
  await waitForLandmarks(page);
  await fitViewToSelection(page, pointIndices);

  const right = page.locator(".landmarks__chrome-dock--right");
  if ((await right.getAttribute("data-collapsed")) === "true") {
    await page.getByRole("button", { name: "Show right panel" }).click();
  }
  await page.getByRole("tab", { name: "category" }).click();
  await page.getByRole("button", { name: "Expand cell_type" }).click();
  await page.waitForFunction(() => {
    const well = document.querySelector('[data-testid="info-chart-well"]');
    return well && !well.textContent?.includes("No category counts in this scope.");
  });
  await page.waitForTimeout(400);
}

async function main() {
  const browser = await chromium.launch({
    headless: true,
    args: ["--enable-webgl", "--ignore-gpu-blocklist"],
  });
  try {
    const page = await browser.newPage({ viewport: VIEWPORT });
    await installDocsCaptureChrome(page, "light");
    await gotoDocsFixture(page, baseUrl, ileumFixture);
    await applyDocsHarnessTheme(page, "light");
    await prepareGaltView(page);
    const out = join(assets, "still-galt-selection.light.png");
    await screenshotLandmarks(page, out);
    await page.close();
    console.log("wrote", out, "milume", milumeSidecarSha(root), "dataset", DATASET_ID);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
