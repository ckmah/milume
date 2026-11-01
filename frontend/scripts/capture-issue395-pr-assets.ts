/**
 * #395 visual acceptance captures — same boot path as landmarks-multichannel-3d-395 e2e.
 * Start dev server: DEV_WIDGET=landmarks-volume MILUME_VOLUME_PROFILE=issue395-3d npm run dev:landmarks-volume -- --port 5173
 */
import { chromium, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import {
  bootLandmarksVolumeHarness,
  stabilizeUi,
  waitForEngine,
} from "../e2e/helpers.ts";
import {
  cubeMainViewportChannelCounts,
  hideMapPointsForImageAssert,
} from "../e2e/helpers/shader-and-pixels.ts";

const outDir = process.env.CAPTURE_OUT ?? "/opt/cursor/artifacts/issue395";
const base = process.env.CAPTURE_BASE ?? "http://127.0.0.1:5173/?noDialkit=1";
const cubeViewSel = '[role="dialog"][aria-label="Cube"] .volume-cube__view';

await mkdir(outDir, { recursive: true });

async function hideHarnessChrome(page: import("@playwright/test").Page) {
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

async function openCubeAtCentre(page: import("@playwright/test").Page) {
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

async function waitMainViewportInk(page: import("@playwright/test").Page) {
  await expect
    .poll(async () => (await cubeMainViewportChannelCounts(page))?.chromatic ?? 0, {
      timeout: 120_000,
    })
    .toBeGreaterThan(800);
}

async function setLabels(page: import("@playwright/test").Page, on: boolean) {
  const btn = page.getByRole("button", { name: "Labels" });
  const pressed = (await btn.getAttribute("aria-pressed")) === "true";
  if (pressed !== on) await btn.click();
  await page.waitForTimeout(on ? 400 : 600);
}

async function openLayersPanel(page: import("@playwright/test").Page) {
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

async function clickPanckSwitch(page: import("@playwright/test").Page) {
  const sw = page.getByTestId("layer-channel-PanCK");
  const box = await sw.boundingBox();
  if (!box) throw new Error("PanCK switch missing");
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx - 100, cy - 60, { steps: 8 });
  await page.waitForTimeout(120);
  await page.mouse.move(cx, cy, { steps: 10 });
  await page.waitForTimeout(100);
  await page.mouse.click(cx, cy);
}

async function capturePreset(
  page: import("@playwright/test").Page,
  preset: "Top view" | "Oblique view",
  widgetName: string,
  viewName: string,
) {
  await page.getByRole("radio", { name: preset }).click();
  await expect(page.locator(cubeViewSel)).toHaveAttribute("data-refining", "false", { timeout: 120_000 });
  await page.waitForTimeout(1500);
  const widget = page.locator(".milume-widget.landmarks");
  await widget.screenshot({ path: join(outDir, widgetName) });
  await page.locator(cubeViewSel).screenshot({ path: join(outDir, viewName) });
}

async function recordToggleClip() {
  const videoTmp = join(outDir, "_toggle_video_tmp");
  await mkdir(videoTmp, { recursive: true });
  const browser = await chromium.launch();
  const context = await browser.newContext({
    baseURL: new URL(base).origin,
    recordVideo: { dir: videoTmp, size: { width: 1280, height: 900 } },
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  await bootLandmarksVolumeHarness(page, "noDialkit=1");
  await hideHarnessChrome(page);
  await hideMapPointsForImageAssert(page);
  await stabilizeUi(page);
  await openCubeAtCentre(page);
  await page.getByRole("radio", { name: "Oblique view" }).click();
  await expect(page.locator(cubeViewSel)).toHaveAttribute("data-refining", "false", { timeout: 120_000 });
  await page.waitForTimeout(800);
  await waitMainViewportInk(page);
  await openLayersPanel(page);
  await page.waitForTimeout(400);
  await clickPanckSwitch(page);
  await expect(page.locator(cubeViewSel)).toHaveAttribute("data-channels", "1", { timeout: 30_000 });
  await page.waitForTimeout(1200);
  await clickPanckSwitch(page);
  await expect(page.locator(cubeViewSel)).toHaveAttribute("data-channels", "2", { timeout: 30_000 });
  await page.waitForTimeout(1200);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);
  const rawWebm = join(outDir, "395-channel-toggle-cube-raw.webm");
  const video = page.video();
  await context.close();
  if (video) await video.saveAs(rawWebm);
  await browser.close();

  const trimmed = join(outDir, "395-channel-toggle-cube.webm");
  execFileSync(
    "ffmpeg",
    ["-y", "-i", rawWebm, "-t", "18", "-c:v", "libvpx-vp9", "-b:v", "1M", trimmed],
    { stdio: "inherit" },
  );
}

const browser = await chromium.launch();
const context = await browser.newContext({
  baseURL: new URL(base).origin,
  viewport: { width: 1280, height: 900 },
  deviceScaleFactor: 1,
});
const page = await context.newPage();

await bootLandmarksVolumeHarness(page, "noDialkit=1");
await hideHarnessChrome(page);
await hideMapPointsForImageAssert(page);
await stabilizeUi(page);

const widget = page.locator(".milume-widget.landmarks");
await widget.screenshot({ path: join(outDir, "395-map-band-two-channel-blend.png") });

await openCubeAtCentre(page);
await page.getByRole("radio", { name: "Oblique view" }).click();
await page.waitForTimeout(800);
await waitMainViewportInk(page);

await setLabels(page, false);
await expect(page.locator(cubeViewSel)).toHaveAttribute("data-points", "0");

await capturePreset(
  page,
  "Top view",
  "395-cube-fullwidget-top-labels-off.png",
  "395-cube-two-channel-blend-top.png",
);
await capturePreset(
  page,
  "Oblique view",
  "395-cube-fullwidget-iso-labels-off.png",
  "395-cube-two-channel-blend-iso.png",
);

await context.close();
await browser.close();

await recordToggleClip();
console.log(`Wrote captures under ${outDir}`);
