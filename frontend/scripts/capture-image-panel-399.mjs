/**
 * Visual acceptance captures for #399 (1280×800, harness banner hidden).
 * Run with landmarks-volume harness: issue122-2d and colon profiles.
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "@playwright/test";

import { installDocsCaptureChrome } from "./lib/docs-tool-media.mjs";

const outDir = process.env.CAPTURE_OUT ?? "/opt/cursor/artifacts/panel-polish-399";
const base = process.env.CAPTURE_URL ?? "http://127.0.0.1:5173";
const viewport = { width: 1280, height: 800 };

mkdirSync(outDir, { recursive: true });

function withNoDialkit(pathQuery) {
  if (!pathQuery || pathQuery === "/") return "/?noDialkit=1";
  return pathQuery.includes("noDialkit=1")
    ? pathQuery
    : `${pathQuery}${pathQuery.includes("?") ? "&" : "?"}noDialkit=1`;
}

async function hideHarnessBanner(page) {
  await page.addStyleTag({
    content: `[data-testid="harness-banner"], .harness-banner { display: none !important; }`,
  });
}

async function waitEngine(page, requireBackdrop = true) {
  await page.waitForFunction(() => Boolean(window.__landmarksEngine?.getViewState?.()), null, {
    timeout: 120_000,
  });
  if (requireBackdrop) {
    try {
      await page.waitForFunction(
        () => window.__landmarksEngine?.getBackdropPick?.()?.level != null,
        null,
        { timeout: 90_000 },
      );
    } catch {
      /* volume harness may still be warming the pyramid */
    }
  }
  await page.waitForTimeout(600);
}

async function openLayers(page) {
  const left = page.locator(".landmarks__chrome-dock--left");
  if ((await left.getAttribute("data-collapsed")) === "true") {
    await page.getByRole("button", { name: "Show left panel" }).click();
  }
  await page.getByTestId("panel-section-layers").click();
}

async function captureWidget(page, name, clip) {
  const widget = page.locator(".milume-widget.landmarks").first();
  await hideHarnessBanner(page);
  await widget.screenshot({
    path: join(outDir, `${name}.png`),
    ...(clip ? { clip } : {}),
  });
}

async function captureLeftDock(page, name) {
  const dock = page.locator(".landmarks__chrome-dock--left");
  await hideHarnessBanner(page);
  await dock.screenshot({ path: join(outDir, `${name}.png`) });
}

async function loadIssue122(page) {
  process.env.E2E_HARNESS = "landmarks-volume";
  process.env.MILUME_VOLUME_PROFILE = "issue122-2d";
  await page.goto(`${base}${withNoDialkit("/")}`, { waitUntil: "networkidle" });
  await waitEngine(page);
}

async function loadColon(page) {
  process.env.E2E_HARNESS = "landmarks-volume";
  process.env.MILUME_VOLUME_PROFILE = "colon";
  await page.goto(`${base}${withNoDialkit("/")}`, { waitUntil: "networkidle" });
  await waitEngine(page);
}

async function twoChannelPanel(page) {
  await page.evaluate(() => {
    const lm = window.__landmarksModel;
    lm.set("_image_channels", [
      { name: "DAPI", visible: true, contrast_limits: [0, 255], color: "#9a9a9a" },
      { name: "PanCK", visible: true, contrast_limits: [0, 255], color: "#ff8844" },
      { name: "CD45", visible: false, contrast_limits: [0, 165] },
      { name: "Ki67", visible: false, contrast_limits: [0, 152] },
    ]);
    lm.save_changes();
  });
  await page.waitForTimeout(600);
  await openLayers(page);
  await page.getByTestId("layers-image-row").click();
}

async function manyChannels(page) {
  const names = ["DAPI", "PanCK", "CD45", "Ki67"];
  for (let i = 4; i < 18; i++) names.push(i < 14 ? `CH${i - 3}` : `Pan-cytokeratin_AE1AE3_lo_${i}`);
  await page.evaluate((channelNames) => {
    const lm = window.__landmarksModel;
    const vol = lm.get("volume") || {};
    const rows = channelNames.map((name, i) => ({
      name,
      visible: i === 0,
      contrast_limits: [0, 255],
      constant_zero: false,
      color: name === "PanCK" ? "#ff8844" : undefined,
    }));
    lm.set("_image_channels", rows);
    lm.set("volume", { ...vol, channels: rows });
    lm.save_changes();
  }, names);
  await page.waitForTimeout(400);
  await openLayers(page);
  await page.getByTestId("layers-image-row").click();
  await page.getByTestId("layer-channel-list").evaluate((el) => {
    el.scrollTop = 48;
  });
}

async function seamCrop(page) {
  const canvas = page.locator("canvas.landmarks__webgl").first();
  const box = await canvas.boundingBox();
  if (!box) throw new Error("canvas missing");
  const clip = {
    x: Math.max(0, box.x - 4),
    y: box.y + box.height * 0.2,
    width: Math.min(420, box.width * 0.55),
    height: Math.min(280, box.height * 0.45),
  };
  await captureWidget(page, "399-after-seam-crop", clip);
}

async function railDrag(page) {
  const lo = page.getByRole("slider", { name: "Lower z bound" });
  const box = await lo.boundingBox();
  if (!box) throw new Error("thumb missing");
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx, cy + 22, { steps: 6 });
  await page.waitForTimeout(200);
  const rail = page.getByTestId("depth-rail");
  await hideHarnessBanner(page);
  await rail.screenshot({ path: join(outDir, "399-after-rail-drag.png") });
  await page.mouse.up();
}

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport,
  deviceScaleFactor: 2,
});
await installDocsCaptureChrome(context);
const page = await context.newPage();

await loadIssue122(page);
await twoChannelPanel(page);
await captureLeftDock(page, "399-after-2ch-panel");
await page.getByTestId("layer-channel-row-CD45").focus();
await captureLeftDock(page, "399-after-channel-focus");

await manyChannels(page);
await captureLeftDock(page, "399-after-18ch-scroll");

await page.evaluate(() => {
  const eng = window.__landmarksEngine;
  const vs = eng.getViewState();
  eng.setViewState({ ...vs, zoom: vs.zoom + 2 });
});
await page.waitForTimeout(800);
await seamCrop(page);

try {
  await loadColon(page);
  await railDrag(page);
} catch (err) {
  console.warn("Skipped colon rail capture (colon harness not on this server):", err?.message ?? err);
}

await browser.close();
console.log(`Wrote captures to ${outDir}`);
