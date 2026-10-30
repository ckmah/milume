/**
 * Issue #383 PR evidence: screenshots + screen recording with render overlay.
 * Usage: node scripts/capture-cube-idle-383-evidence.mjs
 * Requires dev:landmarks-volume on :5173
 */
import { mkdirSync } from "node:fs";
import { chromium } from "@playwright/test";

const out = process.env.BENCH_ARTIFACT_DIR ?? "/opt/cursor/artifacts";
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({
  headless: false,
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const context = await browser.newContext({
  viewport: { width: 1400, height: 900 },
  recordVideo: { dir: out, size: { width: 1400, height: 900 } },
});
const page = await context.newPage();
await page.goto("http://127.0.0.1:5173/?window=100&cubeRenderOverlay=1", {
  waitUntil: "networkidle",
});
await page.waitForFunction(() => Boolean(window.__landmarksEngine?.getViewState?.()));
await page.getByRole("radio", { name: "Inspect", exact: true }).click();
await page.mouse.click(
  ...(await page.evaluate(() => {
    const c = document.querySelector("canvas.landmarks__webgl").getBoundingClientRect();
    return [c.x + c.width / 2, c.y + c.height / 2];
  })),
);
await page.getByRole("dialog", { name: "Cube" }).waitFor();
const view = page.locator('[role="dialog"][aria-label="Cube"] .volume-cube__view');
for (const layer of ["layer-toggle-labels", "layer-toggle-image"]) {
  const el = page.getByTestId(layer);
  if ((await el.getAttribute("aria-pressed")) !== "true") await el.click();
}
await page.waitForFunction(
  () => document.querySelector(".volume-cube__view")?.getAttribute("data-settled") === "true",
  null,
  { timeout: 120_000 },
);
await view.screenshot({ path: `${out}/cube-383-settled-after.png` });
await page.evaluate(() => {
  window.__volumeCubeRenderCount = 0;
});
await page.waitForTimeout(2000);
const idleRenders = await page.evaluate(() => window.__volumeCubeRenderCount ?? 0);
await page.evaluate(() => {
  window.__volumeCubeRenderCount = 0;
});
const t0 = Date.now();
await page.getByTestId("layer-toggle-image").click({ button: "right" });
await page.getByTestId("adjust-image").waitFor({ timeout: 30_000 });
const menuMs = Date.now() - t0;
const menuRenders = await page.evaluate(() => window.__volumeCubeRenderCount ?? 0);
await page.getByRole("slider", { name: "Image gamma" }).first().focus();
await page.keyboard.press("ArrowRight");
await page.keyboard.press("ArrowRight");
await page.waitForTimeout(800);
await page.evaluate(() => {
  window.__volumeCubeRenderCount = 0;
});
await page.waitForTimeout(500);
const gammaRenders = await page.evaluate(() => window.__volumeCubeRenderCount ?? 0);
console.log(JSON.stringify({ idleRenders, menuMs, menuRenders, gammaRenders }, null, 2));
const video = page.video();
await page.close();
await context.close();
if (video) console.log("video", await video.path());
