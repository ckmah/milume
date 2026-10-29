#!/usr/bin/env node
/**
 * Capture get-started tutorial stills (Pyxa small 3D cluster map + Inspect cube).
 *
 * Prereq:
 *   uv run --group demo python scripts/export-volume-docs-tutorial-fixture.py
 *   npm run dev:fixture:volume-small-if-missing
 *   cd frontend && npm run dev:landmarks-volume-small &  # :5174
 *   node scripts/capture-tutorial-docs-stills.mjs
 *
 * Env: VOLUME_URL (default http://127.0.0.1:5174)
 *
 * The ileum step-4 GALT lasso still is captured manually (see issue #370).
 */
import { mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "@playwright/test";

import {
  VIEWPORT,
  applyDocsHarnessTheme,
  hideDocsHarnessChrome,
  installDocsCaptureChrome,
  milumeSidecarSha,
  screenshotLandmarks,
  waitForLandmarks,
  writeSidecar,
} from "./lib/docs-tool-media.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const assets = join(root, "website", "content", "assets", "tutorials");
const volumeUrl = process.env.VOLUME_URL ?? "http://127.0.0.1:5174";
const volumeQuery = "?fixture=/landmarks-volume-fixture.small-tutorial.json&meshOpacity=0.6";
const sha = milumeSidecarSha(root);

async function setModel(page, patch) {
  await page.evaluate((p) => {
    const model = window.__landmarksModel;
    for (const [k, v] of Object.entries(p)) model.set(k, v);
    model.save_changes();
  }, patch);
}

async function screenshotInspectCube(page, path) {
  const dialog = page.getByRole("dialog", { name: "Cube" });
  await dialog.waitFor({ state: "visible", timeout: 120_000 });
  await hideDocsHarnessChrome(page);
  await dialog.screenshot({ path });
}

async function closeFloatingPanels(page) {
  for (let i = 0; i < 4; i++) {
    await page.keyboard.press("Escape");
    await page.waitForTimeout(80);
  }
}

async function captureVolumePair(browser, relDir, name, setup, { shot = "landmarks" } = {}) {
  const outDir = join(assets, relDir);
  mkdirSync(outDir, { recursive: true });
  for (const theme of ["dark", "light"]) {
    const page = await browser.newPage({ viewport: VIEWPORT });
    await installDocsCaptureChrome(page, theme);
    await page.goto(`${volumeUrl}${volumeQuery}`, { waitUntil: "domcontentloaded", timeout: 300_000 });
    await waitForLandmarks(page);
    await applyDocsHarnessTheme(page, theme);
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
  const at = await page.evaluate(() => {
    const vs = window.__landmarksEngine.getViewState().target;
    return [vs[0], vs[1]];
  });
  await setModel(page, { inspect_cx: at[0], inspect_cy: at[1], inspect_open: true });
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
  await closeFloatingPanels(page);
}

async function prepareClusterMap(page) {
  await setModel(page, { active_category: "cluster", color_mode: "categorical" });
  await waitForLandmarks(page);
  await closeFloatingPanels(page);
  await page.evaluate(() => window.__landmarksEngine.resetZoom());
  await page.waitForTimeout(400);
}

async function main() {
  const browser = await chromium.launch({
    headless: true,
    args: ["--enable-webgl", "--ignore-gpu-blocklist"],
  });
  try {
    await captureVolumePair(browser, "spatialdata-3d", "still-map-clusters", async (page) => {
      await prepareClusterMap(page);
    });

    await captureVolumePair(browser, "spatialdata-3d", "still-inspect-cube", async (page) => {
      await prepareClusterMap(page);
      await openInspectCube(page);
    }, { shot: "cube" });
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
