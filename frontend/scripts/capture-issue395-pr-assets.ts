/**
 * #395 visual acceptance captures — same boot path as landmarks-multichannel-3d-395 e2e.
 * Start dev server: DEV_WIDGET=landmarks-volume MILUME_VOLUME_PROFILE=issue395-3d npm run dev:landmarks-volume -- --port 5173
 */
import { chromium, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import {
  bootLandmarksVolumeHarness,
  stabilizeUi,
  waitForEngine,
} from "../e2e/helpers.ts";
import {
  cubeMainViewportChannelCounts,
  expectCubeMainViewportChangesWhenPanckToggledViaLayers,
  hideMapPointsForImageAssert,
} from "../e2e/helpers/shader-and-pixels.ts";

const outDir = process.env.CAPTURE_OUT ?? "/opt/cursor/artifacts/issue395";
const base = process.env.CAPTURE_BASE ?? "http://127.0.0.1:5173/?noDialkit=1";
const videoTmp = join(outDir, "_video_tmp");
const cubeViewSel = '[role="dialog"][aria-label="Cube"] .volume-cube__view';

await mkdir(outDir, { recursive: true });
await mkdir(videoTmp, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({
  baseURL: new URL(base).origin,
  recordVideo: { dir: videoTmp, size: { width: 1280, height: 900 } },
  viewport: { width: 1280, height: 900 },
  deviceScaleFactor: 1,
});
const page = await context.newPage();

async function hideHarnessChrome() {
  await page.addStyleTag({
    content: `
      [data-testid="harness-banner"],
      .harness-banner,
      .landmarks-volume-harness__banner,
      .landmarks-volume-harness__controls,
      [data-dialkit-panel],
      .dialkit-root,
      .deckgl-error-overlay { display: none !important; }
    `,
  });
}

async function openCubeAtCentre() {
  await page.evaluate(() => {
    window.__landmarksModel.set("inspect_cx", 130.5);
    window.__landmarksModel.set("inspect_cy", 170.5);
    window.__landmarksModel.save_changes();
  });
  await page.getByRole("radio", { name: "Inspect", exact: true }).click();
  const plotBox = page.locator(".landmarks__plot");
  const box = await plotBox.boundingBox();
  if (!box) throw new Error("plot missing");
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.getByRole("dialog", { name: "Cube" }).waitFor({ timeout: 60_000 });
  await expect(page.locator(cubeViewSel)).toHaveAttribute("data-refining", "false", { timeout: 120_000 });
  await expect(page.locator(cubeViewSel)).toHaveAttribute("data-image-format", /r8unorm|r16unorm|r32float/, {
    timeout: 120_000,
  });
}

async function waitMainViewportInk(label: string) {
  await expect
    .poll(async () => (await cubeMainViewportChannelCounts(page))?.chromatic ?? 0, {
      timeout: 120_000,
      message: label,
    })
    .toBeGreaterThan(800);
}

async function setLabels(on: boolean) {
  const btn = page.getByRole("button", { name: "Labels" });
  const pressed = (await btn.getAttribute("aria-pressed")) === "true";
  if (pressed !== on) await btn.click();
  await page.waitForTimeout(on ? 400 : 600);
  if (on) {
    await expect(page.locator(cubeViewSel)).toHaveAttribute("data-labels", "on", { timeout: 60_000 });
  }
}

async function openLayersPanel() {
  await page.evaluate(() => {
    const root = document.querySelector(".milume-widget.landmarks");
    if (root instanceof HTMLElement) root.focus();
  });
  const left = page.locator(".landmarks__chrome-dock--left");
  if ((await left.getAttribute("data-collapsed")) === "true") {
    await page.getByRole("button", { name: "Show left panel" }).click();
  }
  await page.keyboard.press("[");
  await page.getByTestId("panel-section-layers").click({ force: true });
  const row = page.getByTestId("layers-image-row");
  if ((await row.getAttribute("aria-expanded")) !== "true") await row.click({ force: true });
  await page.getByTestId("layer-channel-PanCK").waitFor({ state: "visible", timeout: 30_000 });
}

async function capturePreset(preset: "Top view" | "Oblique view", widgetName: string, viewName: string) {
  await page.getByRole("radio", { name: preset }).click();
  await expect(page.locator(cubeViewSel)).toHaveAttribute("data-refining", "false", { timeout: 120_000 });
  await page.waitForTimeout(1500);
  const widget = page.locator(".milume-widget.landmarks");
  await widget.screenshot({ path: join(outDir, widgetName) });
  await page.locator(cubeViewSel).screenshot({ path: join(outDir, viewName) });
}

await bootLandmarksVolumeHarness(page, "noDialkit=1");
await hideHarnessChrome();
await hideMapPointsForImageAssert(page);
await stabilizeUi(page);

const widget = page.locator(".milume-widget.landmarks");
await widget.screenshot({ path: join(outDir, "395-map-band-two-channel-blend.png") });

await openCubeAtCentre();
await page.getByRole("radio", { name: "Oblique view" }).click();
await page.waitForTimeout(800);
await waitMainViewportInk("cube open — main viewport tissue ink");

await setLabels(false);
await expect(page.locator(cubeViewSel)).toHaveAttribute("data-points", "0");

await capturePreset("Top view", "395-cube-fullwidget-top-labels-off.png", "395-cube-two-channel-blend-top.png");
await capturePreset(
  "Oblique view",
  "395-cube-fullwidget-iso-labels-off.png",
  "395-cube-two-channel-blend-iso.png",
);

await setLabels(true);
await capturePreset(
  "Oblique view",
  "395-cube-fullwidget-iso-labels-on.png",
  "395-cube-view-iso-labels-on.png",
);

await openLayersPanel();
await expectCubeMainViewportChangesWhenPanckToggledViaLayers(page);

await page.waitForTimeout(800);
const video = page.video();
await context.close();
if (video) await video.saveAs(join(outDir, "395-channel-toggle-cube.webm"));
await browser.close();
console.log(`Wrote captures under ${outDir}`);
