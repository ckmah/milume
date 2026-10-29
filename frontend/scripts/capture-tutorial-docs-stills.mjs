#!/usr/bin/env node
/**
 * Capture get-started tutorial stills (ileum 2D + Pyxa small 3D).
 *
 * Prereq:
 *   uv run --group demo python scripts/export-ileum-docs-base.py
 *   npm run dev:fixture:volume-small-if-missing
 *   cd frontend && npm run dev:landmarks &   # :5173 ileum fixture
 *   cd frontend && npm run dev:landmarks-volume-small &  # :5174 volume small
 *   node scripts/capture-tutorial-docs-stills.mjs
 *
 * Env: LANDMARKS_URL (default http://127.0.0.1:5173)
 *      VOLUME_URL (default http://127.0.0.1:5174)
 */
import { mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "@playwright/test";

import {
  DATASET_ID,
  VIEWPORT,
  fitDenseTissueView,
  installDocsCaptureChrome,
  gotoDocsFixture,
  milumeSidecarSha,
  screenshotLandmarks,
  waitForLandmarks,
  writeSidecar,
} from "./lib/docs-tool-media.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const assets = join(root, "website", "content", "assets", "tutorials");
const ileumUrl = process.env.LANDMARKS_URL ?? "http://127.0.0.1:5173";
const volumeUrl = process.env.VOLUME_URL ?? "http://127.0.0.1:5174";
const ileumFixture = "/ileum-docs-base.json";
const sha = milumeSidecarSha(root);

async function setModel(page, patch) {
  await page.evaluate((p) => {
    const model = window.__landmarksModel;
    for (const [k, v] of Object.entries(p)) model.set(k, v);
    model.save_changes();
  }, patch);
}

async function captureIleumPair(browser, relDir, name, setup) {
  const outDir = join(assets, relDir);
  mkdirSync(outDir, { recursive: true });
  for (const theme of ["dark", "light"]) {
    const page = await browser.newPage({ viewport: VIEWPORT });
    await installDocsCaptureChrome(page, theme);
    await gotoDocsFixture(page, ileumUrl, ileumFixture);
    await fitDenseTissueView(page);
    await setup(page, theme);
    await screenshotLandmarks(page, join(outDir, `${name}.${theme}.png`));
    await page.close();
  }
  writeSidecar(join(outDir, `${name}.json`), {
    dataset: DATASET_ID,
    seed: 0,
    milume: sha,
  });
  console.log("still", join("tutorials", relDir, name));
}

async function setObsColor(page, column) {
  await setModel(page, { active_category: column, color_mode: "categorical" });
  await waitForLandmarks(page);
}

async function galtLassoSelection(page) {
  const bounds = await page.evaluate(() => {
    const m = window.__landmarksModel;
    const eng = window.__landmarksEngine;
    const cols = m.get("category_columns") || [];
    const colIdx = cols.findIndex((c) => c.name === "anatomical_layer");
    if (colIdx < 0) return null;
    const galtIdx = cols[colIdx].labels.indexOf("GALT");
    if (galtIdx < 0) return null;
    const b64 = m.get("category_codes");
    if (!b64) return null;
    const raw = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const codes = new Int32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4);
    const pts = eng.getPoints();
    const n = pts.length;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let count = 0;
    for (let i = 0; i < n; i++) {
      if (codes[colIdx * n + i] !== galtIdx) continue;
      const [x, y] = pts[i];
      count += 1;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
    if (count < 20) return null;
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const pad = Math.max(maxX - minX, maxY - minY) * 0.35 + 40;
    return { cx, cy, pad, minX, maxX, minY, maxY };
  });
  if (!bounds) return false;
  await page.evaluate(({ cx, cy }) => {
    window.__landmarksEngine.panTo(cx, cy, { animate: false });
  }, bounds);
  await page.waitForTimeout(400);
  await setModel(page, {
    selections: [
      {
        id: "galt-lasso",
        type: "lasso",
        vertices: [
          [bounds.minX - bounds.pad * 0.2, bounds.minY - bounds.pad * 0.2],
          [bounds.maxX + bounds.pad * 0.2, bounds.minY - bounds.pad * 0.15],
          [bounds.maxX + bounds.pad * 0.15, bounds.maxY + bounds.pad * 0.2],
          [bounds.minX - bounds.pad * 0.15, bounds.maxY + bounds.pad * 0.15],
        ],
      },
    ],
    selected_kind: "selection",
    selected_index: 0,
  });
  await waitForLandmarks(page);
  return true;
}

async function screenshotInspectCube(page, path) {
  const dialog = page.getByRole("dialog", { name: "Cube" });
  await dialog.waitFor({ state: "visible", timeout: 120_000 });
  await dialog.screenshot({ path });
}

async function captureVolumePair(browser, relDir, name, setup, { shot = "landmarks" } = {}) {
  const outDir = join(assets, relDir);
  mkdirSync(outDir, { recursive: true });
  for (const theme of ["dark", "light"]) {
    const page = await browser.newPage({ viewport: VIEWPORT });
    await installDocsCaptureChrome(page, theme);
    await page.goto(`${volumeUrl}/`, { waitUntil: "domcontentloaded", timeout: 300_000 });
    await waitForLandmarks(page);
    await setup(page, theme);
    if (shot === "cube") {
      await screenshotInspectCube(page, join(outDir, `${name}.${theme}.png`));
    } else {
      await screenshotLandmarks(page, join(outDir, `${name}.${theme}.png`));
    }
    await page.close();
  }
  writeSidecar(join(outDir, `${name}.json`), {
    dataset: "hf:Stellaromics/demo:small",
    seed: 0,
    milume: sha,
  });
  console.log("still", join("tutorials", relDir, name));
}

async function openInspectCube(page) {
  await page.getByRole("radio", { name: "Inspect", exact: true }).click();
  const canvas = page.locator("canvas.landmarks__webgl").first();
  const box = await canvas.boundingBox();
  if (!box) throw new Error("no canvas");
  await page.mouse.click(box.x + box.width * 0.52, box.y + box.height * 0.48);
  const view = page.locator('[role="dialog"][aria-label="Cube"] .volume-cube__view');
  await view.waitFor({ state: "visible", timeout: 300_000 });
  await page.waitForFunction(
    () => document.querySelector(".volume-cube__view")?.getAttribute("data-refining") === "false",
    null,
    { timeout: 300_000 },
  );
  const points = page.getByTestId("layer-toggle-points");
  if ((await points.getAttribute("aria-pressed")) === "true") await points.click();
  const labels = page.getByTestId("layer-toggle-labels");
  if ((await labels.getAttribute("aria-pressed")) !== "true") await labels.click();
  const image = page.getByTestId("layer-toggle-image");
  if ((await image.getAttribute("aria-pressed")) !== "true") await image.click();
  await page.waitForFunction(
    () => {
      const el = document.querySelector(".volume-cube__view");
      return el?.getAttribute("data-labels") === "on" && el?.getAttribute("data-image") === "on";
    },
    null,
    { timeout: 120_000 },
  );
  await page.waitForTimeout(600);
}

async function main() {
  const browser = await chromium.launch({
    headless: true,
    args: ["--enable-webgl", "--ignore-gpu-blocklist"],
  });
  try {
    await captureIleumPair(browser, "explore-cells-2d", "still-cell-types", async (page) => {
      await setObsColor(page, "cell_type");
    });

    await captureIleumPair(browser, "explore-cells-2d", "still-anatomical-layer", async (page) => {
      await setObsColor(page, "anatomical_layer");
    });

    // GALT lasso, 3D map and Inspect stills were dropped from #365: the lasso
    // never registered, the 3D map was uncolored, and the Mesh panel (opacity 0.9)
    // covered both 3D shots. Re-add them only once they capture cleanly.
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
