/**
 * Records #395 channel-toggle webm using the same harness boot as e2e.
 * MILUME_VOLUME_PROFILE=issue395-3d dev server on :5173 (or playwright webServer).
 */
import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import {
  stabilizeUi,
  waitForEngine,
} from "../e2e/helpers.ts";
import {
  expectCubeMainViewportChangesWhenPanckToggledViaLayers,
  expectMapCubeImageChannelStateAligned,
} from "../e2e/helpers/shader-and-pixels.ts";

const outDir = process.env.CAPTURE_OUT ?? "/opt/cursor/artifacts/issue395";
const videoTmp = join(outDir, "_toggle_video_tmp");

await mkdir(outDir, { recursive: true });
await mkdir(videoTmp, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({
  recordVideo: { dir: videoTmp, size: { width: 1280, height: 900 } },
  viewport: { width: 1280, height: 900 },
  deviceScaleFactor: 1,
  baseURL: "http://127.0.0.1:5173",
});
const page = await context.newPage();

await page.goto("/?noDialkit=1", { waitUntil: "networkidle" });
await waitForEngine(page);
await stabilizeUi(page);

await page.evaluate(() => {
  window.__landmarksModel.set("inspect_cx", 130.5);
  window.__landmarksModel.set("inspect_cy", 170.5);
  window.__landmarksModel.save_changes();
});
await page.getByRole("radio", { name: "Inspect", exact: true }).click();
const plot = page.locator(".landmarks__plot");
const box = await plot.boundingBox();
if (!box) throw new Error("plot missing");
await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
await page.getByRole("dialog", { name: "Cube" }).waitFor({ timeout: 60_000 });
await page
  .locator('[role="dialog"][aria-label="Cube"] .volume-cube__view')
  .waitFor({ state: "attached", timeout: 60_000 });
await page.waitForFunction(
  () =>
    document
      .querySelector('[role="dialog"][aria-label="Cube"] .volume-cube__view')
      ?.getAttribute("data-refining") === "false",
  null,
  { timeout: 120_000 },
);

await page.evaluate(() => {
  const root = document.querySelector(".milume-widget.landmarks");
  if (root instanceof HTMLElement) root.focus();
});
await page.keyboard.press("[");
await page.getByTestId("panel-section-layers").click({ force: true });
const row = page.getByTestId("layers-image-row");
if ((await row.getAttribute("aria-expanded")) !== "true") await row.click({ force: true });

await expectCubeMainViewportChangesWhenPanckToggledViaLayers(page);
await expectMapCubeImageChannelStateAligned(page);

const video = page.video();
await context.close();
if (video) await video.saveAs(join(outDir, "395-channel-toggle-cube.webm"));
await browser.close();
console.log(`Wrote ${join(outDir, "395-channel-toggle-cube.webm")}`);
