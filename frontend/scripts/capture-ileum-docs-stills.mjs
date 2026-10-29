#!/usr/bin/env node
/**
 * Capture Tools & modes **stills** on ileum (``demos/data:ileum``).
 *
 * Prereq:
 *   uv run --group demo python scripts/export-ileum-docs-base.py
 *   cd frontend && npm run dev:landmarks &
 *   node scripts/capture-ileum-docs-stills.mjs
 *
 * Env: LANDMARKS_URL (default http://127.0.0.1:5173)
 */
import { mkdirSync, writeFileSync } from "node:fs";
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
const assets = join(root, "website", "content", "assets", "tools");
const baseUrl = process.env.LANDMARKS_URL ?? "http://127.0.0.1:5173";
const fixture = "/ileum-docs-base.json";
const sha = milumeSidecarSha(root);

async function canvasBox(page) {
  const canvas = page.locator("canvas.landmarks__webgl").first();
  const box = await canvas.boundingBox();
  if (!box) throw new Error("canvas box missing");
  return box;
}

async function setModel(page, patch) {
  await page.evaluate((p) => {
    const model = window.__landmarksModel;
    for (const [k, v] of Object.entries(p)) model.set(k, v);
    model.save_changes();
  }, patch);
}

async function captureStillPair(browser, relDir, name, setup) {
  const outDir = join(assets, relDir);
  mkdirSync(outDir, { recursive: true });
  for (const theme of ["dark", "light"]) {
    const page = await browser.newPage({ viewport: VIEWPORT });
    await installDocsCaptureChrome(page, theme);
    await gotoDocsFixture(page, baseUrl, fixture);
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
  console.log("still", join(relDir, name));
}

async function captureMeasureWidgetPane(browser) {
  const out = join("/opt/cursor/artifacts", "measure-widget.dark.png");
  mkdirSync(dirname(out), { recursive: true });
  const page = await browser.newPage({ viewport: VIEWPORT });
  await installDocsCaptureChrome(page, "dark");
  await gotoDocsFixture(page, baseUrl, fixture);
  await fitDenseTissueView(page);
  const bounds = await page.evaluate(() => {
    const m = window.__landmarksModel;
    const xb = m.get("x_bounds");
    const yb = m.get("y_bounds");
    return { x0: xb[0], x1: xb[1], y0: yb[0], y1: yb[1] };
  });
  const cx = (bounds.x0 + bounds.x1) / 2;
  const cy = (bounds.y0 + bounds.y1) / 2;
  const span = Math.max(bounds.x1 - bounds.x0, bounds.y1 - bounds.y0);
  await setModel(page, {
    landmarks: [
      {
        id: "villus-axis",
        type: "spline",
        vertices: [
          [cx - span * 0.18, cy - span * 0.08],
          [cx, cy + span * 0.06],
          [cx + span * 0.2, cy - span * 0.04],
        ],
        tension: 0.35,
        buffer_width: span * 0.07,
        buffer_side: "both",
        line_style: "solid",
        color: "#00e5ff",
      },
    ],
    selected_kind: "landmark",
    selected_index: 0,
  });
  await waitForLandmarks(page);
  await screenshotLandmarks(page, out);
  await page.close();
  writeFileSync(out.replace(".png", "-path.txt"), out);
  console.log("measure widget pane", out);
}

async function main() {
  const browser = await chromium.launch({
    headless: true,
    args: ["--enable-webgl", "--ignore-gpu-blocklist"],
  });
  try {
    await captureStillPair(browser, "probe", "still-pinned", async (page) => {
      await setModel(page, {
        render_mode: "raster",
        active_genes: ["Apob", "Slc5a1", "Nos2"],
        color_mode: "genes",
      });
      await page.getByRole("radio", { name: "Probe", exact: true }).click();
      await waitForLandmarks(page);
      const box = await canvasBox(page);
      await page.mouse.move(box.x + box.width * 0.52, box.y + box.height * 0.46);
      await page.mouse.click(box.x + box.width * 0.52, box.y + box.height * 0.46);
      await page.waitForTimeout(500);
    });

    await captureStillPair(browser, "color-layers", "still-genes", async (page) => {
      await page.getByRole("tab", { name: "genes" }).click();
      await setModel(page, { active_genes: ["Apob", "Slc5a1", "Nos2"], color_mode: "genes" });
      await waitForLandmarks(page);
    });

    await captureStillPair(browser, "color-layers", "still-embed", async (page) => {
      await page.getByRole("tab", { name: "embed" }).click();
      await setModel(page, { color_mode: "embedding", raster_embedding_key: "X_umap" });
      await waitForLandmarks(page);
    });

    await captureMeasureWidgetPane(browser);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
