#!/usr/bin/env node
/**
 * Applies the 551-cell selection, uses the same wide map framing as sibling ileum
 * docs stills (`fitDenseTissueView`), opens category counts, and captures light PNG.
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
  fitDenseTissueView,
  installDocsCaptureChrome,
  gotoDocsFixture,
  milumeSidecarSha,
  screenshotLandmarks,
  waitForLandmarks,
  writeSidecar,
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
  await fitDenseTissueView(page);

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
    writeSidecar(join(assets, "still-galt-selection.json"), {
      dataset: DATASET_ID,
      seed: 0,
      milume: milumeSidecarSha(root),
    });
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
