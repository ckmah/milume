/**
 * Measure cube canvas ink inside wireframe inset (GL + screenshot readback).
 * Usage: npx tsx scripts/issue395-viewport-ink.ts [dapi-only|panck-only|dual]
 */
import { chromium } from "@playwright/test";

import {
  bootIssue395LandmarksVolume,
  expectDapiVisible,
  expectPanckVisible,
  ISSUE395_INSPECT_CX,
  ISSUE395_INSPECT_CY,
  openIssue395CubeAtInspectCentre,
  openLayersPanelWithCubeOpen,
  clickPanckLayerSwitch,
  setCubeLabels,
  setCubePreset,
  waitCubeRefined,
} from "../e2e/helpers/issue395-cube-flow.ts";
import {
  cubeGlInkStats,
  cubeScreenshotInkStats,
  CUBE_VOLUME_INSET,
  rejectCubeViewportEmpty,
  type CubeViewportInkMode,
} from "../e2e/helpers/shader-and-pixels.ts";

type Mode = CubeViewportInkMode;

const mode = (process.argv[2] ?? "dual") as Mode;

async function applyMode(page: import("@playwright/test").Page, m: Mode) {
  if (m === "dual") {
    await expectDapiVisible(page, true);
    await expectPanckVisible(page, true);
    return;
  }
  await openLayersPanelWithCubeOpen(page);
  if (m === "dapi-only") {
    await clickPanckLayerSwitch(page);
    await expectPanckVisible(page, false);
    await expectDapiVisible(page, true);
  } else {
    await expectPanckVisible(page, true);
    await expectDapiVisible(page, false);
  }
}

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1280, height: 900 },
  baseURL: "http://127.0.0.1:5173",
});

await bootIssue395LandmarksVolume(page);
await openIssue395CubeAtInspectCentre(page);
await setCubeLabels(page, false);
await applyMode(page, mode);
await setCubePreset(page, "Oblique view");
await waitCubeRefined(page);
await page.waitForTimeout(900);

const attrs = await page.locator('[role="dialog"][aria-label="Cube"] .volume-cube__view').evaluate((el) => ({
  channels: el.getAttribute("data-channels"),
  refining: el.getAttribute("data-refining"),
  sums: el.getAttribute("data-volume-sums"),
  format: el.getAttribute("data-image-format"),
}));

await rejectCubeViewportEmpty(page, `bisect ${mode}`, mode);
const gl = await cubeGlInkStats(page, CUBE_VOLUME_INSET);
const shot = await cubeScreenshotInkStats(page, CUBE_VOLUME_INSET);

const outPath = `/opt/cursor/artifacts/issue395/bisect-${mode}-iso.png`;
await page.locator('[role="dialog"][aria-label="Cube"] .volume-cube__view').screenshot({ path: outPath });

console.log(
  JSON.stringify(
    {
      commit: process.env.GIT_COMMIT ?? "unknown",
      mode,
      inspect: { cx: ISSUE395_INSPECT_CX, cy: ISSUE395_INSPECT_CY },
      attrs,
      gl,
      screenshotInk: shot,
      screenshot: outPath,
    },
    null,
    2,
  ),
);

await browser.close();
