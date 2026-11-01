/**
 * #395 visual acceptance captures — shares boot/view/toggle with e2e via issue395-cube-flow.
 * DEV_WIDGET=landmarks-volume MILUME_VOLUME_PROFILE=issue395-3d npm run dev:landmarks-volume -- --port 5173
 */
import { chromium } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import {
  bootIssue395LandmarksVolume,
  expectIssue395CubeViewportHealthy,
  openIssue395CubeAtInspectCentre,
  runIssue395ToggleClipFlow,
  setCubeLabels,
  setCubePreset,
} from "../e2e/helpers/issue395-cube-flow.ts";

const outDir = process.env.CAPTURE_OUT ?? "/opt/cursor/artifacts/issue395";
const base = process.env.CAPTURE_BASE ?? "http://127.0.0.1:5173/?noDialkit=1";
const cubeViewSel = '[role="dialog"][aria-label="Cube"] .volume-cube__view';

await mkdir(outDir, { recursive: true });

async function captureStillFrames(page: import("@playwright/test").Page) {
  const widget = page.locator(".milume-widget.landmarks");
  await widget.screenshot({ path: join(outDir, "395-map-band-two-channel-blend.png") });
  await openIssue395CubeAtInspectCentre(page);
  await setCubePreset(page, "Oblique view");
  await setCubeLabels(page, false);
  await expectIssue395CubeViewportHealthy(page, "capture Iso labels off", { requirePanckSites: true });
  await setCubePreset(page, "Top view");
  await page.waitForTimeout(800);
  await widget.screenshot({ path: join(outDir, "395-cube-fullwidget-top-labels-off.png") });
  await page.locator(cubeViewSel).screenshot({ path: join(outDir, "395-cube-two-channel-blend-top.png") });
  await setCubePreset(page, "Oblique view");
  await page.waitForTimeout(1200);
  await widget.screenshot({ path: join(outDir, "395-cube-fullwidget-iso-labels-off.png") });
  await page.locator(cubeViewSel).screenshot({ path: join(outDir, "395-cube-two-channel-blend-iso.png") });
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
  await bootIssue395LandmarksVolume(page);
  await runIssue395ToggleClipFlow(page);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  const rawWebm = join(outDir, "395-channel-toggle-cube-raw.webm");
  const video = page.video();
  await context.close();
  if (video) await video.saveAs(rawWebm);
  await browser.close();
  const trimmed = join(outDir, "395-channel-toggle-cube.webm");
  execFileSync(
    "ffmpeg",
    ["-y", "-i", rawWebm, "-t", "20", "-c:v", "libvpx-vp9", "-b:v", "1M", trimmed],
    { stdio: "inherit" },
  );
}

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1280, height: 900 },
  deviceScaleFactor: 1,
  baseURL: new URL(base).origin,
});
await bootIssue395LandmarksVolume(page);
await captureStillFrames(page);
await browser.close();

await recordToggleClip();
console.log(`Wrote captures under ${outDir}`);
