/**
 * Issue #383 idle / layer-menu render counts (SwiftShader-friendly).
 * Usage: node scripts/measure-cube-idle-383.mjs
 */
import { chromium } from "@playwright/test";

async function openCube(page) {
  await page.goto("http://127.0.0.1:5173/?window=100", { waitUntil: "networkidle" });
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
  await view.waitFor();
  await page.waitForFunction(
    () => document.querySelector(".volume-cube__view")?.getAttribute("data-refining") === "false",
    null,
    { timeout: 120_000 },
  );
  for (const layer of ["layer-toggle-labels", "layer-toggle-image"]) {
    const el = page.getByTestId(layer);
    if ((await el.getAttribute("aria-pressed")) !== "true") await el.click();
  }
  await page.waitForFunction(
    () => document.querySelector(".volume-cube__view")?.getAttribute("data-labels") === "on",
    null,
    { timeout: 120_000 },
  );
  return view;
}

async function waitSettled(page) {
  await page.waitForFunction(
    () => document.querySelector(".volume-cube__view")?.getAttribute("data-settled") === "true",
    null,
    { timeout: 120_000 },
  );
}

async function measureIdle(page) {
  await waitSettled(page);
  await page.evaluate(() => {
    window.__volumeCubeRenderCount = 0;
  });
  await page.waitForTimeout(2000);
  return page.evaluate(() => window.__volumeCubeRenderCount ?? 0);
}

async function measureMenu(page) {
  await waitSettled(page);
  await page.evaluate(() => {
    window.__volumeCubeRenderCount = 0;
  });
  const t0 = Date.now();
  await page.getByTestId("layer-toggle-image").click({ button: "right" });
  await page.getByTestId("adjust-image").waitFor({ timeout: 30_000 });
  const ms = Date.now() - t0;
  const renders = await page.evaluate(() => window.__volumeCubeRenderCount ?? 0);
  return { ms, renders };
}

const browser = await chromium.launch({
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
await openCube(page);
const idleOnlyRefining = await (async () => {
  await page.waitForFunction(
    () => document.querySelector(".volume-cube__view")?.getAttribute("data-refining") === "false",
  );
  await page.evaluate(() => {
    window.__volumeCubeRenderCount = 0;
  });
  await page.waitForTimeout(2000);
  return page.evaluate(() => window.__volumeCubeRenderCount ?? 0);
})();
const idleSettled = await measureIdle(page);
const menu = await measureMenu(page);
console.log(JSON.stringify({ idleOnlyRefining, idleSettled, menu }, null, 2));
await browser.close();
