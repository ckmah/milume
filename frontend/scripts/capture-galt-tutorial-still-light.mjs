#!/usr/bin/env node
/**
 * Capture light still-galt-selection for the 2D tutorial (issue #372).
 *
 * Matches Clarence's hand-capture framing (1068×728): default fit-to-data zoom,
 * galt-follicle + active GALT · 164 selection, category tab with anatomical_layer
 * expanded and cell_type / cell_class collapsed.
 *
 * Prereq:
 *   uv run --group demo python scripts/export-ileum-docs-base.py --max-cells 0
 *   cd frontend && npm run dev:landmarks &
 *   node scripts/capture-galt-tutorial-still-light.mjs
 *
 * Env: LANDMARKS_URL (default http://127.0.0.1:5173)
 *      GALT_INDICES_JSON (default frontend/dev/galt-point-indices.json)
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "@playwright/test";

import {
  DATASET_ID,
  GALT_TUTORIAL_STILL_SIZE,
  applyDocsHarnessTheme,
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
if (!Array.isArray(pointIndices) || pointIndices.length !== 164) {
  throw new Error(`expected 164 point indices, got ${pointIndices?.length}`);
}

const theme = process.env.GALT_STILL_THEME ?? "light";
const { width: stillW, height: stillH } = GALT_TUTORIAL_STILL_SIZE;

async function installGaltStillViewport(page) {
  await page.addInitScript(({ w, h }) => {
    const style = document.createElement("style");
    style.id = "galt-tutorial-still-viewport";
    style.textContent = `
      html, body { margin: 0 !important; padding: 0 !important; overflow: hidden !important; }
      .min-h-screen { min-height: 0 !important; width: ${w}px !important; }
      .harness-shell { height: ${h}px !important; min-height: 0 !important; width: ${w}px !important; padding: 0 !important; }
      .harness-cell-output { height: ${h}px !important; padding: 0 !important; width: ${w}px !important; }
      .harness-cell-output > .w-full { height: ${h}px !important; width: ${w}px !important; }
      .landmarks { box-sizing: border-box !important; height: ${h}px !important; max-height: ${h}px !important; width: ${w}px !important; max-width: ${w}px !important; }
    `;
    document.documentElement.appendChild(style);
  }, { w: stillW, h: stillH });
}

async function lockStillDimensions(page) {
  await page.evaluate(({ w, h }) => {
    for (const sel of [".harness-shell", ".harness-cell-output", ".harness-cell-output > .w-full"]) {
      const el = document.querySelector(sel);
      if (el instanceof HTMLElement) {
        el.style.setProperty("padding", "0", "important");
        el.style.setProperty("margin", "0", "important");
        el.style.setProperty("width", `${w}px`, "important");
        el.style.setProperty("min-height", "0", "important");
        el.style.setProperty("height", `${h}px`, "important");
        el.style.setProperty("box-sizing", "border-box", "important");
      }
    }
    const el = document.querySelector(".landmarks");
    if (el instanceof HTMLElement) {
      el.style.setProperty("height", `${h}px`, "important");
      el.style.setProperty("width", `${w}px`, "important");
    }
    window.__landmarksEngine?.resize?.();
    window.__landmarksEngine?.resetZoom?.();
  }, { w: stillW, h: stillH });
  await page.waitForTimeout(600);
}

async function setModel(page, patch) {
  await page.evaluate((p) => {
    const model = window.__landmarksModel;
    for (const [k, v] of Object.entries(p)) model.set(k, v);
    model.save_changes();
  }, patch);
}

async function fitClarenceMapView(page) {
  await page.evaluate(() => {
    window.__landmarksEngine.resetZoom();
  });
  await page.waitForTimeout(500);
}

async function prepareGaltView(page) {
  await setModel(page, {
    mode: "select",
    render_mode: "points",
    active_category: "cell_type",
    color_mode: "categorical",
    active_genes: [],
    selections: [
      { id: "galt-follicle", point_indices: pointIndices },
      { id: "GALT · 164", point_indices: pointIndices },
    ],
    selected_kind: "selection",
    selected_index: 1,
    landmarks: [],
  });
  await waitForLandmarks(page);
  await fitClarenceMapView(page);

  const right = page.locator(".landmarks__chrome-dock--right");
  if ((await right.getAttribute("data-collapsed")) === "true") {
    await page.getByRole("button", { name: "Show right panel" }).click();
  }
  await page.getByRole("tab", { name: "cat" }).click();
  await page.getByRole("button", { name: "Expand anatomical_layer" }).click();
  await page.waitForFunction(() => {
    const well = document.querySelector('[data-testid="info-chart-well"]');
    return well && !well.textContent?.includes("No category counts in this scope.");
  });
  await page.waitForTimeout(400);
  await lockStillDimensions(page);
}

async function main() {
  const browser = await chromium.launch({
    headless: true,
    args: ["--enable-webgl", "--ignore-gpu-blocklist"],
  });
  try {
    const page = await browser.newPage({ viewport: { width: stillW, height: stillH } });
    await installDocsCaptureChrome(page, theme);
    await installGaltStillViewport(page);
    await gotoDocsFixture(page, baseUrl, ileumFixture);
    await applyDocsHarnessTheme(page, theme);
    await prepareGaltView(page);
    const out = join(assets, `still-galt-selection.${theme}.png`);
    const lm = page.locator(".landmarks").first();
    const box = await lm.boundingBox();
    if (!box || Math.round(box.width) !== stillW || Math.round(box.height) !== stillH) {
      throw new Error(
        `landmarks box ${box?.width}×${box?.height}, expected ${stillW}×${stillH}`,
      );
    }
    await screenshotLandmarks(page, out);
    writeSidecar(join(assets, "still-galt-selection.json"), {
      dataset: DATASET_ID,
      seed: 0,
      milume: milumeSidecarSha(root),
    });
    await page.close();
    console.log("wrote", out, `${stillW}×${stillH}`, "milume", milumeSidecarSha(root));
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
