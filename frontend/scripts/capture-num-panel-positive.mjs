/**
 * Capture num-tab obs heat strip for positive-only column (1280×800 @ 2×).
 *
 *   CAPTURE_URL=http://127.0.0.1:5173 node scripts/capture-num-panel-positive.mjs
 */
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "@playwright/test";

const root = join(import.meta.dirname, "..");
const outDir =
  process.env.CAPTURE_OUT ?? join("/opt/cursor/artifacts/color-api-394-visual", "signed");
const base = process.env.CAPTURE_URL ?? "http://127.0.0.1:5173";

mkdirSync(outDir, { recursive: true });

const obsColor = JSON.parse(
  readFileSync(join(root, "dev/harness-twin-obs-color.json"), "utf8"),
);

async function waitEngine(page) {
  await page.waitForFunction(() => Boolean(window.__landmarksEngine?.getViewState?.()), null, {
    timeout: 120_000,
  });
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 2,
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(`${base}/?fixture=${encodeURIComponent("/fixture.json")}`, {
    waitUntil: "networkidle",
  });
  await waitEngine(page);
  await page.evaluate((patch) => {
    const model = window.__landmarksModel;
    for (const [k, v] of Object.entries(patch)) model.set(k, v);
    model.save_changes();
  }, obsColor);
  const right = page.locator(".landmarks__chrome-dock--right");
  if ((await right.getAttribute("data-collapsed")) === "true") {
    await page.getByRole("button", { name: "Show right panel" }).click();
  }
  await right.getByTestId("explore-color-by").getByRole("tab", { name: "num" }).click();
  await page.getByTestId("num-heat-strip").waitFor({ state: "visible" });
  const strip = page.getByTestId("num-heat-strip");
  const path = join(outDir, "num-panel-positive-only.png");
  await strip.screenshot({ path });
  console.log(path);
  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
