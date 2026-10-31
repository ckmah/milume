/**
 * Visual acceptance captures for depth backdrop (#122).
 *
 * Usage:
 *   cd frontend && npm run dev:landmarks-volume -- --host 127.0.0.1 --port 5173
 *   node scripts/capture-depth-backdrop-122.mjs
 *
 *   cd frontend && npm run dev:landmarks -- --host 127.0.0.1 --port 5174
 *   CAPTURE_URL=http://127.0.0.1:5174 node scripts/capture-depth-backdrop-122.mjs --2d
 *
 * Fixture URLs (harness serves JSON under /):
 * - Toy 3D SpatialData (depth rail + image backdrop): http://127.0.0.1:5173/
 *   (`dev:landmarks-volume`, default export from `dev/landmarks-volume-fixture.json`)
 * - Default 2D harness points: http://127.0.0.1:5173/?fixture=/fixture.json
 * - Ileum 2D (no z): http://127.0.0.1:5173/?fixture=/e2e-galt-lasso-fixture.json
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "@playwright/test";

const outDir = process.env.CAPTURE_OUT ?? "/opt/cursor/artifacts/depth-backdrop-122";
const base = process.env.CAPTURE_URL ?? "http://127.0.0.1:5173";
const only2d = process.argv.includes("--2d");
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
}

async function captureWidget(page, name) {
  const widget = page.locator(".milume-widget.landmarks").first();
  await widget.waitFor({ state: "visible", timeout: 120_000 });
  await hideHarnessBanner(page);
  await widget.screenshot({ path: join(outDir, `${name}.png`) });
}

async function load(page, pathQuery) {
  await page.goto(`${base}${pathQuery}`, { waitUntil: "networkidle" });
  await waitEngine(page);
}

async function captureVolume(page) {
  await load(page, "/");
  await captureWidget(page, "122-volume-rail-and-backdrop");

  const loThumb = page.getByRole("slider", { name: "Lower z bound" });
  const box = await loThumb.boundingBox();
  if (box) {
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx, cy + 20, { steps: 4 });
    await captureWidget(page, "122-volume-rail-drag-lower");
    await page.mouse.up();
  }

  await load(page, "/");
  await page.getByTestId("panel-section-layers").click();
  await page.getByTestId("layer-toggle-image").click();
  await captureWidget(page, "122-volume-image-layer-off");
}

async function capture2d(page) {
  await load(page, "/?fixture=/fixture.json");
  await captureWidget(page, "122-default-2d-no-rail");

  await load(page, `/?fixture=${encodeURIComponent(ILEUM)}`);
  await captureWidget(page, "122-ileum-2d-no-rail");
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

  if (only2d) {
    await capture2d(page);
  } else {
    await captureVolume(page);
  }

  await browser.close();
  console.log(`Wrote captures under ${outDir}`);
  console.log(
    "Fixtures documented in script header (volume /fixture.json /e2e-galt-lasso-fixture.json).",
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
