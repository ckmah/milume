/**
 * Visual acceptance for #395 (1280×800, harness banner hidden, full-widget PNG + contrast webm).
 * Run: E2E_VOLUME_PROFILE=issue395-3d node frontend/scripts/capture-issue395-pr-assets.mjs
 * Requires dev server: MILUME_VOLUME_PROFILE=issue395-3d npm run dev:landmarks-volume -- --host 127.0.0.1 --port 5173 --strictPort
 */
import { chromium } from "@playwright/test";
import { mkdir, rename, copyFile } from "node:fs/promises";
import { readdir } from "node:fs/promises";
import { join } from "node:path";

const base = process.env.CAPTURE_BASE ?? "http://127.0.0.1:5173/?noDialkit=1";
const outDir = process.env.CAPTURE_OUT ?? "/opt/cursor/artifacts/issue395";
const videoTmp = join(outDir, "_video_tmp");

await mkdir(outDir, { recursive: true });
await mkdir(videoTmp, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({
  recordVideo: { dir: videoTmp, size: { width: 1280, height: 800 } },
  viewport: { width: 1280, height: 800 },
  deviceScaleFactor: 2,
});
const page = await context.newPage();

async function hideHarnessChrome(page) {
  await page.addStyleTag({
    content: `
      .landmarks-volume-harness__banner,
      .landmarks-volume-harness__controls,
      [data-testid="harness-banner"],
      .harness-banner,
      [data-dialkit-panel],
      .dialkit-root { display: none !important; }
      .deckgl-error-overlay, .deck-tooltip { display: none !important; }
    `,
  });
}

async function waitReady(page) {
  await page.goto(base, { waitUntil: "networkidle" });
  await page.waitForFunction(() => Boolean(window.__landmarksEngine?.getViewState?.()));
  await hideHarnessChrome(page);
  await page.waitForTimeout(400);
}

async function openCube(page) {
  await page.getByRole("radio", { name: "Inspect", exact: true }).click();
  const plot = page.locator(".landmarks__plot");
  const box = await plot.boundingBox();
  if (!box) throw new Error("no plot box");
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.getByRole("dialog", { name: "Cube" }).waitFor({ timeout: 60_000 });
  await page.waitForFunction(
    () => document.querySelector(".volume-cube__view")?.getAttribute("data-refining") === "false",
    null,
    { timeout: 120_000 },
  );
}

async function openImagePanel(page) {
  const left = page.locator(".landmarks__chrome-dock--left");
  if ((await left.getAttribute("data-collapsed")) === "true") {
    await page.evaluate(() => {
      const root = document.querySelector(".milume-widget.landmarks");
      if (root instanceof HTMLElement) root.focus();
    });
    await page.keyboard.press("[");
    await page.waitForFunction(
      () => document.querySelector(".landmarks__chrome-dock--left")?.getAttribute("data-collapsed") === "false",
      null,
      { timeout: 15_000 },
    );
  }
  await page.getByTestId("panel-section-layers").click({ force: true });
  const row = page.getByTestId("layers-image-row");
  if ((await row.getAttribute("aria-expanded")) !== "true") await row.click({ force: true });
}

await waitReady(page);
const widget = page.locator(".milume-widget.landmarks");
await widget.screenshot({ path: join(outDir, "395-map-band-two-channel-blend.png") });

await openCube(page);
await page.waitForTimeout(600);
await widget.screenshot({ path: join(outDir, "395-cube-two-channel-blend.png") });

await openImagePanel(page);
await page.getByTestId("layer-channel-row-DAPI").focus();
const hiThumb = page.getByRole("slider", { name: "DAPI contrast, maximum" });
await hiThumb.scrollIntoViewIfNeeded();
const box = await hiThumb.boundingBox();
if (!box) throw new Error("no contrast slider");
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await page.waitForTimeout(200);
await page.mouse.down();
for (let i = 1; i <= 20; i++) {
  await page.mouse.move(box.x - i * 4, box.y + box.height / 2);
  await page.waitForTimeout(60);
}
await page.mouse.up();
await page.waitForTimeout(800);
await widget.screenshot({ path: join(outDir, "395-contrast-drag-cursor.png") });

await context.close();
await browser.close();

const webm = (await readdir(videoTmp)).find((f) => f.endsWith(".webm"));
if (webm) {
  await rename(join(videoTmp, webm), join(outDir, "395-contrast-drag-cube.webm"));
}
console.log(`Wrote captures under ${outDir}`);
