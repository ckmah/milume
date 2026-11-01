/**
 * Record #395 visual acceptance: full-widget PNGs + contrast drag webm (cube open, cursor visible).
 * Run with production preview: npm run build && node scripts/capture-issue395-pr-assets.mjs
 * Env: MILUME_VOLUME_PROFILE=issue395-3d (required). CAPTURE_BASE=http://127.0.0.1:5173/?noDialkit=1
 */
import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

const base = process.env.CAPTURE_BASE ?? "http://127.0.0.1:5173/?noDialkit=1";
const outDir = process.env.CAPTURE_OUT ?? "/opt/cursor/artifacts/issue395";
const videoTmp = join(outDir, "_video_tmp");

await mkdir(outDir, { recursive: true });
await mkdir(videoTmp, { recursive: true });

const browser = await chromium.launch({
  args: ["--enable-gpu", "--ignore-gpu-blocklist", "--disable-lcd-text"],
});
const context = await browser.newContext({
  recordVideo: { dir: videoTmp, size: { width: 1280, height: 800 } },
  viewport: { width: 1280, height: 800 },
  deviceScaleFactor: 2,
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

async function waitReady() {
  await page.goto(base, { waitUntil: "networkidle" });
  await page.waitForFunction(() => Boolean(window.__landmarksEngine?.getViewState?.()));
  await hideHarnessChrome();
  await page.evaluate(() => {
    window.__landmarksModel.set("point_size", 0);
    window.__landmarksModel.save_changes();
  });
  await page.waitForTimeout(600);
}

async function openCube() {
  await page.getByRole("radio", { name: "Inspect", exact: true }).click();
  const plot = page.locator(".landmarks__plot");
  const box = await plot.boundingBox();
  if (!box) throw new Error("no plot");
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.getByRole("dialog", { name: "Cube" }).waitFor({ timeout: 60_000 });
  await page.waitForFunction(
    () => document.querySelector(".volume-cube__view")?.getAttribute("data-refining") === "false",
    null,
    { timeout: 120_000 },
  );
  await page.waitForFunction(
    () => {
      const fmt = document.querySelector(".volume-cube__view")?.getAttribute("data-image-format");
      return fmt === "r8unorm" || fmt === "r16unorm" || fmt === "r32float";
    },
    null,
    { timeout: 120_000 },
  );
  const err = await page.evaluate(() => document.body.innerText.includes("Compilation error"));
  if (err) throw new Error("cube shader compile overlay visible");
  await page.getByRole("radio", { name: "Oblique view" }).click();
  await page.waitForTimeout(1200);
}

async function openPerChannelContrastInLayers() {
  await page.waitForTimeout(1000);
  await page.evaluate(() => {
    const root = document.querySelector(".milume-widget.landmarks");
    if (root instanceof HTMLElement) root.focus();
  });
  await page.keyboard.press("[");
  await page.waitForTimeout(400);
  await page.getByTestId("panel-section-layers").click({ force: true });
  const row = page.getByTestId("layers-image-row");
  await row.waitFor({ state: "attached", timeout: 30_000 });
  if ((await row.getAttribute("aria-expanded")) !== "true") await row.click({ force: true });
}

await waitReady();
const widget = page.locator(".milume-widget.landmarks");
await page.waitForTimeout(1500);
await widget.screenshot({ path: join(outDir, "395-map-band-two-channel-blend.png") });

await openCube();
await page.waitForTimeout(800);
const cubeView = page.locator('[role="dialog"][aria-label="Cube"] .volume-cube__view');
await cubeView.screenshot({ path: join(outDir, "395-cube-two-channel-blend-iso.png") });
await widget.screenshot({ path: join(outDir, "395-cube-widget-iso.png") });

await openPerChannelContrastInLayers();
const hiThumb = page.getByRole("slider", { name: "DAPI contrast, maximum" });
await hiThumb.scrollIntoViewIfNeeded();
const hiBox = await hiThumb.boundingBox();
if (!hiBox) throw new Error("no hi slider");
await page.mouse.move(hiBox.x + hiBox.width / 2, hiBox.y + hiBox.height / 2);
await page.waitForTimeout(300);
await page.mouse.down();
for (let i = 1; i <= 16; i++) {
  await page.mouse.move(hiBox.x - i * 4, hiBox.y + hiBox.height / 2);
  await page.waitForTimeout(55);
}
await page.mouse.up();
await page.waitForTimeout(1200);

const video = page.video();
const webmOut = join(outDir, "395-contrast-drag-cube.webm");
await context.close();
if (video) {
  await video.saveAs(webmOut);
}
await browser.close();
console.log(`Wrote captures under ${outDir}`);
