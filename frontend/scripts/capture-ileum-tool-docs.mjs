#!/usr/bin/env node
/**
 * Recapture Tools & modes loops/stills on ileum (``demos/data:ileum``).
 *
 * Prereq:
 *   uv run --group demo python scripts/export-ileum-docs-base.py
 *   cd frontend && npm run dev:landmarks &
 *   node scripts/capture-ileum-tool-docs.mjs
 *
 * Env: LANDMARKS_URL (default http://127.0.0.1:5173), SHOTS (comma ids, default all)
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "@playwright/test";

import {
  DATASET_ID,
  VIEWPORT,
  installDocsCaptureChrome,
  gotoDocsFixture,
  milumeSidecarSha,
  probeVideoMeta,
  screenshotLandmarks,
  transcodeThemeVideo,
  waitForLandmarks,
  writeSidecar,
} from "./lib/docs-tool-media.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const assets = join(root, "website", "content", "assets", "tools");
const baseUrl = process.env.LANDMARKS_URL ?? "http://127.0.0.1:5173";
const fixture = "/ileum-docs-base.json";
const sha = milumeSidecarSha(root);
const shotFilter = process.env.SHOTS?.split(",").map((s) => s.trim()).filter(Boolean);

function want(id) {
  return !shotFilter?.length || shotFilter.includes(id);
}

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

async function clickLandmarkTool(page, name) {
  await page.getByRole("button", { name: /Right-click for landmark menu/ }).click({ button: "right" });
  await page.getByRole("menuitem", { name: new RegExp(`^${name}\\b`) }).click();
}

async function drawLasso(page, box, { durationMs = 2800, steps = 72, inset = 0.14 } = {}) {
  const cx = box.x + box.width * 0.5;
  const cy = box.y + box.height * 0.5;
  const rx = box.width * (0.5 - inset);
  const ry = box.height * (0.5 - inset);
  const delayMs = Math.max(1, Math.floor(durationMs / steps));
  await page.mouse.move(cx + rx, cy);
  await page.mouse.down();
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    await page.mouse.move(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry);
    if (i < steps) await page.waitForTimeout(delayMs);
  }
  await page.mouse.up();
}

async function recordLoop(browser, theme, outDir, name, run) {
  const tmp = mkdtempSync(join(tmpdir(), "ileum-docs-"));
  const context = await browser.newContext({
    viewport: VIEWPORT,
    recordVideo: { dir: tmp, size: { width: 960, height: 600 } },
  });
  const page = await context.newPage();
  await installDocsCaptureChrome(page, theme);
  await gotoDocsFixture(page, baseUrl, fixture);
  await run(page);
  await page.waitForTimeout(500);
  const video = page.video();
  await context.close();
  const raw = await video.path();
  const base = join(outDir, name);
  const { mp4 } = transcodeThemeVideo(raw, base, theme);
  rmSync(tmp, { recursive: true, force: true });
  return probeVideoMeta(mp4);
}

async function captureLoopPair(browser, relDir, name, run) {
  const outDir = join(assets, relDir);
  mkdirSync(outDir, { recursive: true });
  const dark = await recordLoop(browser, "dark", outDir, name, run);
  const light = await recordLoop(browser, "light", outDir, name, run);
  writeSidecar(join(outDir, `${name}.json`), {
    dataset: DATASET_ID,
    seed: 0,
    milume: sha,
    dark: {
      frames: dark.frames,
      seconds: dark.seconds,
      seamless_rmse: 0,
      render: "1920:1200",
      crf: [36, 24],
    },
    light: {
      frames: light.frames,
      seconds: light.seconds,
      seamless_rmse: 0,
      render: "1920:1200",
      crf: [36, 24],
    },
  });
  console.log("loop", join(relDir, name));
}

async function captureStillPair(browser, relDir, name, setup) {
  const outDir = join(assets, relDir);
  mkdirSync(outDir, { recursive: true });
  for (const theme of ["dark", "light"]) {
    const page = await browser.newPage({ viewport: VIEWPORT });
    await installDocsCaptureChrome(page, theme);
    await gotoDocsFixture(page, baseUrl, fixture);
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

const shots = {
  async "landmarks/hero"(browser) {
    await captureLoopPair(browser, "landmarks", "hero", async (page) => {
      await clickLandmarkTool(page, "Spline");
      const box = await canvasBox(page);
      const pts = [
        [0.35, 0.55],
        [0.48, 0.42],
        [0.62, 0.58],
        [0.55, 0.68],
      ];
      for (const [px, py] of pts) {
        await page.mouse.click(box.x + box.width * px, box.y + box.height * py);
        await page.waitForTimeout(280);
      }
      await page.keyboard.press("Enter");
      await page.waitForFunction(
        () => (window.__landmarksModel.get("landmarks") || []).length >= 1,
        null,
        { timeout: 20_000 },
      );
      const lm = await page.evaluate(() => window.__landmarksModel.get("landmarks")[0]);
      await setModel(page, { selected_kind: "landmark", selected_index: 0, mode: "select" });
      await page.getByTestId("context-buffer-toggle").click();
      const bar = page.getByTestId("context-buffer-panel");
      await bar.waitFor({ state: "visible", timeout: 20_000 });
      for (const bw of [0, 24, 52, 96, 140]) {
        await setModel(page, {
          landmarks: [{ ...lm, buffer_width: bw }],
          selected_kind: "landmark",
          selected_index: 0,
        });
        const bb = await bar.boundingBox();
        if (bb) {
          await page.mouse.move(bb.x + bb.width * 0.55, bb.y + bb.height * 0.55);
        }
        await page.waitForTimeout(420);
      }
      await page.keyboard.press("Delete");
      await page.waitForTimeout(600);
    });
  },

  async "navigate/hero"(browser) {
    await captureLoopPair(browser, "navigate", "hero", async (page) => {
      const box = await canvasBox(page);
      const cx = box.x + box.width * 0.5;
      const cy = box.y + box.height * 0.5;
      await page.mouse.move(cx, cy);
      for (let i = 0; i < 4; i++) {
        await page.mouse.wheel(0, -120);
        await page.waitForTimeout(120);
      }
      await page.mouse.down();
      await page.mouse.move(cx - box.width * 0.18, cy - box.height * 0.12, { steps: 16 });
      await page.mouse.up();
      await page.waitForTimeout(400);
      await page.keyboard.press("0");
      await page.waitForTimeout(700);
    });
  },

  async "navigate/loop-minimap"(browser) {
    await captureLoopPair(browser, "navigate", "loop-minimap", async (page) => {
      const mini = page.getByTestId("landmarks-minimap");
      await mini.waitFor({ state: "visible" });
      const box = await mini.boundingBox();
      if (!box) throw new Error("minimap missing");
      await page.mouse.move(box.x + box.width * 0.72, box.y + box.height * 0.35);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width * 0.28, box.y + box.height * 0.72, { steps: 22 });
      await page.mouse.up();
      await page.waitForTimeout(600);
    });
  },

  async "select-regions/hero"(browser) {
    await captureLoopPair(browser, "select-regions", "hero", async (page) => {
      await page.getByRole("button", { name: /Lasso/i }).click();
      await drawLasso(page, await canvasBox(page), { durationMs: 3200 });
      await page.waitForTimeout(900);
      await page.keyboard.press("Delete");
      await page.waitForTimeout(600);
    });
  },

  async "select-regions/loop-square"(browser) {
    await captureLoopPair(browser, "select-regions", "loop-square", async (page) => {
      await page.getByRole("button", { name: /Lasso/i }).click({ button: "right" });
      await page.getByRole("menuitem", { name: /^Square\b/ }).click();
      const box = await canvasBox(page);
      await page.mouse.move(box.x + box.width * 0.35, box.y + box.height * 0.35);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width * 0.62, box.y + box.height * 0.58, { steps: 14 });
      await page.mouse.up();
      await page.waitForTimeout(800);
      await page.keyboard.press("Delete");
      await page.waitForTimeout(500);
    });
  },

  async "select-regions/loop-circle"(browser) {
    await captureLoopPair(browser, "select-regions", "loop-circle", async (page) => {
      await page.getByRole("button", { name: /Lasso/i }).click({ button: "right" });
      await page.getByRole("menuitem", { name: /^Circle\b/ }).click();
      const box = await canvasBox(page);
      await page.mouse.move(box.x + box.width * 0.38, box.y + box.height * 0.38);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width * 0.64, box.y + box.height * 0.6, { steps: 14 });
      await page.mouse.up();
      await page.waitForTimeout(800);
      await page.keyboard.press("Delete");
      await page.waitForTimeout(500);
    });
  },

  async "select-regions/loop-knn"(browser) {
    await captureLoopPair(browser, "select-regions", "loop-knn", async (page) => {
      await page.getByRole("button", { name: /Lasso/i }).click({ button: "right" });
      await page.getByRole("menuitem", { name: /^Square\b/ }).click();
      const box = await canvasBox(page);
      await page.mouse.move(box.x + box.width * 0.4, box.y + box.height * 0.42);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width * 0.58, box.y + box.height * 0.58, { steps: 10 });
      await page.mouse.up();
      await page.waitForTimeout(600);
      await setModel(page, { selected_kind: "selection", selected_index: 0 });
      await page.getByTestId("context-hood-knn-mode").click();
      const slider = page.getByTestId("context-hood-k").getByRole("slider");
      const sb = await slider.boundingBox();
      if (sb) {
        await page.mouse.move(sb.x + sb.width * 0.25, sb.y + sb.height * 0.5);
        await page.mouse.down();
        await page.mouse.move(sb.x + sb.width * 0.85, sb.y + sb.height * 0.5, { steps: 16 });
        await page.mouse.up();
        await page.waitForTimeout(400);
        await page.mouse.move(sb.x + sb.width * 0.35, sb.y + sb.height * 0.5);
        await page.mouse.down();
        await page.mouse.move(sb.x + sb.width * 0.55, sb.y + sb.height * 0.5, { steps: 12 });
        await page.mouse.up();
      }
      await page.waitForTimeout(700);
    });
  },

  async "probe/hero"(browser) {
    await captureLoopPair(browser, "probe", "hero", async (page) => {
      await setModel(page, {
        render_mode: "raster",
        active_genes: ["Apob", "Slc5a1", "Nos2"],
        color_mode: "genes",
      });
      await page.getByRole("radio", { name: "Probe", exact: true }).click();
      await waitForLandmarks(page);
      const box = await canvasBox(page);
      const path = [
        [0.42, 0.45],
        [0.52, 0.38],
        [0.62, 0.48],
        [0.54, 0.58],
        [0.44, 0.52],
        [0.42, 0.45],
      ];
      for (const [px, py] of path) {
        await page.mouse.move(box.x + box.width * px, box.y + box.height * py, { steps: 8 });
        await page.waitForTimeout(220);
      }
    });
  },

  async "probe/still-pinned"(browser) {
    await captureStillPair(browser, "probe", "still-pinned", async (page) => {
      await setModel(page, {
        render_mode: "raster",
        active_genes: ["Apob", "Slc5a1", "Nos2"],
        color_mode: "genes",
      });
      await page.getByRole("radio", { name: "Probe", exact: true }).click();
      await waitForLandmarks(page);
      const box = await canvasBox(page);
      await page.mouse.click(box.x + box.width * 0.52, box.y + box.height * 0.46);
      await page.waitForTimeout(500);
    });
  },

  async "color-layers/hero"(browser) {
    await captureLoopPair(browser, "color-layers", "hero", async (page) => {
      await page.getByRole("tab", { name: "genes" }).click();
      await page.waitForTimeout(700);
      await page.getByRole("tab", { name: "embed" }).click();
      await page.waitForTimeout(700);
      await page.getByRole("tab", { name: "category" }).click();
      await page.waitForTimeout(700);
    });
  },

  async "color-layers/loop-raster"(browser) {
    await captureLoopPair(browser, "color-layers", "loop-raster", async (page) => {
      await page.getByTestId("view-cta").getByRole("switch", { name: /points\/raster/i }).click();
      await page.waitForTimeout(900);
      await page.getByTestId("view-cta").getByRole("switch", { name: /points\/raster/i }).click();
      await page.waitForTimeout(900);
    });
  },

  async "color-layers/still-genes"(browser) {
    await captureStillPair(browser, "color-layers", "still-genes", async (page) => {
      await page.getByRole("tab", { name: "genes" }).click();
      await setModel(page, { active_genes: ["Apob", "Slc5a1", "Nos2"], color_mode: "genes" });
      await waitForLandmarks(page);
    });
  },

  async "color-layers/still-embed"(browser) {
    await captureStillPair(browser, "color-layers", "still-embed", async (page) => {
      await page.getByRole("tab", { name: "embed" }).click();
      await setModel(page, { color_mode: "embedding", raster_embedding_key: "X_umap" });
      await waitForLandmarks(page);
    });
  },

  async "measure/widget-pane"(browser) {
    const out = join("/opt/cursor/artifacts", "measure-widget.dark.png");
    mkdirSync(dirname(out), { recursive: true });
    const page = await browser.newPage({ viewport: VIEWPORT });
    await installDocsCaptureChrome(page, "dark");
    await gotoDocsFixture(page, baseUrl, fixture);
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
    writeFileSync(join("/opt/cursor/artifacts", "measure-widget-path.txt"), out);
    console.log("measure widget pane", out);
  },
};

async function main() {
  const browser = await chromium.launch({
    headless: true,
    args: ["--enable-webgl", "--ignore-gpu-blocklist"],
  });
  try {
    for (const [id, fn] of Object.entries(shots)) {
      if (!want(id)) continue;
      await fn(browser);
    }
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
