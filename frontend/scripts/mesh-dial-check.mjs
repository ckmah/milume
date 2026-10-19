// Harness DialKit check (proto-cell-mesh-ts): drag the Mesh sliders live; the look attrs change,
// geometry / worker builds do not. Screenshots the panel. BASE_URL, OUT (dir).
import { chromium } from "@playwright/test";
const BASE = process.env.BASE_URL, OUT = process.env.OUT;
const sel = '[role="dialog"][aria-label="Cube"] .volume-cube__view';
const browser = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await page.goto(`${BASE}/?window=100&fixture=/small-leiden-ts.fixture.json`, { timeout: 180000 });
await page.waitForFunction(() => window.__landmarksEngine?.getViewState?.()?.zoom != null, null, { timeout: 180000 });
// open Inspect as the shot script does
await page.getByRole("radio", { name: "Inspect", exact: true }).click();
const b = await page.locator("canvas.landmarks__webgl").first().boundingBox();
await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
await page.getByRole("dialog", { name: "Cube" }).waitFor({ timeout: 180000 });
await page.waitForFunction((s) => document.querySelector(s)?.getAttribute("data-mesh-shown") === "true", sel, { timeout: 180000 });
await page.waitForTimeout(1500);
const state = () => page.evaluate((s) => { const el = document.querySelector(s); return { look: el.getAttribute("data-mesh-look"), contrast: el.getAttribute("data-image-contrast"), gamma: el.getAttribute("data-image-gamma"), geometryBuilds: el.getAttribute("data-mesh-geometry-builds"), workerBuilds: window.__cellMeshWorker?.builds.length, renders: window.__volumeCubeRenderCount }; }, sel);
const before = await state();
await page.locator(".dialkit-panel").first().screenshot({ path: `${OUT}/dialkit-panel-defaults.png` });
const steps = [];
for (const [label, frac] of [["Opacity", 0.3], ["Fresnel Min", 0.4], ["Shine", 0.5], ["Flat", 0.9], ["Img Boost", 0.2]]) {
  const row = page.locator(".dialkit-root").getByText(label, { exact: true }).first();
  const box = await row.locator("xpath=..").boundingBox();
  await page.mouse.move(box.x + 4, box.y + box.height / 2); await page.mouse.down();
  await page.mouse.move(box.x + box.width * frac, box.y + box.height / 2, { steps: 6 }); await page.mouse.up();
  await page.waitForTimeout(600);
  steps.push({ label, ...(await state()) });
}
console.log(JSON.stringify({ before, steps }, null, 1));
await page.locator(".dialkit-panel").first().screenshot({ path: `${OUT}/dialkit-panel-after-drag.png` });
await page.locator(sel).screenshot({ path: `${OUT}/dialkit-live-after-drag.png` });
await browser.close();
