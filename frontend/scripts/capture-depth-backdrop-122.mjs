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

async function installCaptureCursor(page) {
  await page.evaluate(() => {
    if (document.getElementById("capture-cursor")) return;
    const el = document.createElement("div");
    el.id = "capture-cursor";
    el.style.cssText =
      "position:fixed;width:12px;height:12px;border:2px solid #fff;border-radius:50%;box-shadow:0 0 0 1px #000;pointer-events:none;z-index:99999;transform:translate(-50%,-50%)";
    document.body.appendChild(el);
    window.__captureCursorMove = (x, y) => {
      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
    };
  });
}

async function moveCaptureCursor(page, x, y) {
  await page.evaluate(
    ([px, py]) => {
      window.__captureCursorMove?.(px, py);
    },
    [x, y],
  );
}

async function waitEngine(page, requireBackdrop = true) {
  await page.waitForFunction(() => Boolean(window.__landmarksEngine?.getViewState?.()), null, {
    timeout: 120_000,
  });
  if (requireBackdrop) {
    await page.waitForFunction(
      () => window.__landmarksEngine?.getBackdropPick?.()?.level != null,
      null,
      { timeout: 120_000 },
    );
  }
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

async function load(page, pathQuery = "/", requireBackdrop = true) {
  await page.goto(`${base}${withNoDialkit(pathQuery)}`, { waitUntil: "networkidle" });
  await waitEngine(page, requireBackdrop);
}

async function zoomIn(page, steps = 1) {
  for (let i = 0; i < steps; i++) {
    await page.evaluate(() => {
      const eng = window.__landmarksEngine;
      const vs = eng.getViewState();
      eng.setViewState({ ...vs, zoom: vs.zoom + 1.2 });
    });
    await page.waitForTimeout(350);
  }
}

async function captureIssue122d(page) {
  await load(page);
  await page.evaluate(() => {
    const lm = window.__landmarksModel;
    const vol = lm.get("volume") || {};
    lm.set(
      "_image_channels",
      (vol.channels || []).map((c) => ({
        ...c,
        visible: c.name === "DAPI" || c.name === "PanCK",
      })),
    );
    lm.save_changes();
  });
  await page.waitForTimeout(400);
  await openLayers(page);
  await captureWidget(page, "122-2d-two-channel-blend-layers");
  await page.evaluate(() => {
    const lm = window.__landmarksModel;
    const vol = lm.get("volume") || {};
    lm.set(
      "_image_channels",
      (vol.channels || []).map((c) => ({ ...c, visible: c.name === "DAPI" })),
    );
    lm.save_changes();
  });
  await page.waitForTimeout(600);
  await captureWidget(page, "122-2d-default-dapi-gray");
  await zoomIn(page, 2);
  await captureWidget(page, "122-2d-dapi-zoomed");
}

async function captureColon(page) {
  await load(page);
  await captureWidget(page, "122-colon-backdrop-on-fit");
  await zoomIn(page, 2);
  await captureWidget(page, "122-colon-backdrop-on-zoomed");
  await openLayers(page);
  await page.getByTestId("layer-toggle-image").click();
  await page.waitForTimeout(400);
  await captureWidget(page, "122-colon-backdrop-off-fit");
  await load(page);
  await zoomIn(page, 3);
  await page.evaluate(() => {
    const lm = window.__landmarksModel;
    const lo = lm.get("z_band_lo_um");
    const hi = lm.get("z_band_hi_um");
    const mid = (lo + hi) / 2;
    lm.set("z_band_lo_um", mid - 2.5);
    lm.set("z_band_hi_um", mid + 2.5);
    lm.save_changes();
  });
  await page.waitForTimeout(800);
  await captureWidget(page, "122-colon-band-rail-faded-points");
  await installCaptureCursor(page);
  const loThumb = page.getByRole("slider", { name: "Lower z bound" });
  const box = await loThumb.boundingBox();
  if (box) {
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    await page.mouse.move(cx, cy);
    await moveCaptureCursor(page, cx, cy);
    await page.mouse.down();
    const dragY = cy + 18;
    await page.mouse.move(cx, dragY, { steps: 4 });
    await moveCaptureCursor(page, cx, dragY);
    await captureWidget(page, "122-colon-rail-drag-lower");
    await page.mouse.up();
  }
}

async function captureIleum(page) {
  await load(page, `/?fixture=${encodeURIComponent(ILEUM)}`, false);
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
