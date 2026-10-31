/**
 * Visual acceptance captures for depth backdrop (#122).
 *
 * Servers (separate ports):
 *   MILUME_VOLUME_PROFILE=issue122-2d npm run dev:landmarks-volume -- --port 5175
 *   MILUME_VOLUME_PROFILE=colon npm run dev:landmarks-volume -- --port 5176
 *   npm run dev:landmarks -- --port 5174
 *
 *   CAPTURE_URL=http://127.0.0.1:5175 node scripts/capture-depth-backdrop-122.mjs --issue122-2d
 *   CAPTURE_URL=http://127.0.0.1:5176 node scripts/capture-depth-backdrop-122.mjs --colon
 *   CAPTURE_URL=http://127.0.0.1:5174 node scripts/capture-depth-backdrop-122.mjs --ileum
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "@playwright/test";

const outDir = process.env.CAPTURE_OUT ?? "/opt/cursor/artifacts/depth-backdrop-122";
const base = process.env.CAPTURE_URL ?? "http://127.0.0.1:5173";
const mode =
  ["--issue122-2d", "--colon", "--ileum", "--toy"].find((f) => process.argv.includes(f)) ?? "--toy";
const ILEUM = "/e2e-galt-lasso-fixture.json";

mkdirSync(outDir, { recursive: true });

async function hideHarnessBanner(page) {
  await page.addStyleTag({
    content: `[data-testid="harness-banner"], .harness-banner { display: none !important; }`,
  });
}

async function waitEngine(page) {
  await page.waitForFunction(() => Boolean(window.__landmarksEngine?.getViewState?.()), null, {
    timeout: 120_000,
  });
  await page.waitForTimeout(600);
}

async function openLayers(page) {
  const left = page.locator(".landmarks__chrome-dock--left");
  if ((await left.getAttribute("data-collapsed")) === "true") {
    await page.getByRole("button", { name: "Show left panel" }).click();
  }
  await page.getByTestId("panel-section-layers").click();
  const imageRow = page.getByTestId("layers-image-row");
  if (await imageRow.count()) {
    await imageRow.click();
  }
}

async function captureWidget(page, name) {
  const widget = page.locator(".milume-widget.landmarks").first();
  await widget.waitFor({ state: "visible", timeout: 120_000 });
  await hideHarnessBanner(page);
  await widget.screenshot({ path: join(outDir, `${name}.png`) });
}

async function load(page, pathQuery = "/") {
  await page.goto(`${base}${pathQuery}`, { waitUntil: "networkidle" });
  await waitEngine(page);
}

async function zoomIn(page) {
  await page.evaluate(() => {
    const eng = window.__landmarksEngine;
    const vs = eng.getViewState();
    eng.setViewState({ ...vs, zoom: vs.zoom + 1.2 });
  });
  await page.waitForTimeout(400);
}

async function captureIssue122d(page) {
  await load(page);
  await openLayers(page);
  await captureWidget(page, "122-2d-default-dapi-gray");
  await page.evaluate(() => {
    const lm = window.__landmarksModel;
    const vol = lm.get("volume") || {};
    const channels = (vol.channels || []).map((c) => ({
      ...c,
      visible: c.name === "DAPI" || c.name === "PanCK",
    }));
    lm.set("_image_channels", channels);
    lm.save_changes();
  });
  await page.waitForTimeout(600);
  await captureWidget(page, "122-2d-two-channel-blend-layers");
  await zoomIn(page);
  await captureWidget(page, "122-2d-two-channel-zoomed");
}

async function captureColon(page) {
  await load(page);
  await captureWidget(page, "122-colon-backdrop-on-fit");
  await zoomIn(page);
  await captureWidget(page, "122-colon-backdrop-on-zoomed");
  await openLayers(page);
  await page.getByTestId("layer-toggle-image").click();
  await page.waitForTimeout(400);
  await captureWidget(page, "122-colon-backdrop-off-fit");
  await load(page);
  await captureWidget(page, "122-colon-band-rail-faded-points");
  const loThumb = page.getByRole("slider", { name: "Lower z bound" });
  const box = await loThumb.boundingBox();
  if (box) {
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx, cy + 18, { steps: 3 });
    await captureWidget(page, "122-colon-rail-drag-lower");
    await page.mouse.up();
  }
}

async function captureIleum(page) {
  await load(page, `/?fixture=${encodeURIComponent(ILEUM)}`);
  await captureWidget(page, "122-ileum-2d-no-rail");
}

async function captureToy(page) {
  await load(page);
  await captureWidget(page, "122-volume-rail-and-backdrop");
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  if (mode === "--issue122-2d") await captureIssue122d(page);
  else if (mode === "--colon") await captureColon(page);
  else if (mode === "--ileum") await captureIleum(page);
  else await captureToy(page);
  await browser.close();
  console.log(`Wrote captures under ${outDir} (${mode})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
