/**
 * Local SwiftShader timings for issue #91 (face-hover path + orbit drag).
 * Usage: node scripts/volume-perf-bench.mjs
 * Requires: DEV_WIDGET=landmarks-volume vite on http://127.0.0.1:5173
 */
import { chromium } from "@playwright/test";

const HOVER_STEPS = 40;
const ORBIT_STEPS = 20;

async function bench(page) {
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
  // #83 regression: image under labels + face-hover plates while moving the pointer.
  const labels = page.getByTestId("layer-toggle-labels");
  if (await labels.count()) {
    if ((await labels.getAttribute("aria-pressed")) !== "true") await labels.click();
    await expectLabelsOn(page);
  }
  const side = page.getByRole("radio", { name: "Side view" });
  if (await side.count()) {
    await side.click();
    await page.waitForFunction(
      () => document.querySelector(".volume-cube__view")?.getAttribute("data-pitch") === "0",
      null,
      { timeout: 30_000 },
    );
  }
  await page.waitForFunction(
    () => {
      const centers = document.querySelector(".volume-cube__view")?.getAttribute("data-cut-centers");
      return Boolean(centers && centers.length > 0);
    },
    null,
    { timeout: 60_000 },
  ).catch(() => {});

  const box = await view.boundingBox();
  if (!box) throw new Error("no cube view box");

  await page.evaluate(() => {
    window.__volumeCubeRenderCount = 0;
  });
  const hoverStart = performance.now();
  // Sweep across projected cut faces (top edge toward z1 plate, then along the front face).
  for (let i = 0; i < HOVER_STEPS; i++) {
    const t = i / (HOVER_STEPS - 1);
    const x = box.x + box.width * (0.22 + t * 0.56);
    const y = box.y + box.height * (0.18 + Math.sin(t * Math.PI * 2) * 0.08 + t * 0.35);
    await page.mouse.move(x, y);
  }
  await page.waitForTimeout(300);
  const hoverMs = performance.now() - hoverStart;
  const hoverRenders = await page.evaluate(() => window.__volumeCubeRenderCount ?? 0);

  await page.evaluate(() => {
    window.__volumeCubeRenderCount = 0;
  });
  const orbitStart = performance.now();
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
  await page.mouse.down();
  for (let i = 1; i <= ORBIT_STEPS; i++) {
    await page.mouse.move(box.x + box.width * 0.5 + i * 12, box.y + box.height * 0.5 + i * 6);
  }
  await page.mouse.up();
  await page.waitForTimeout(300);
  const orbitMs = performance.now() - orbitStart;
  const orbitRenders = await page.evaluate(() => window.__volumeCubeRenderCount ?? 0);

  return { hoverMs, hoverRenders, orbitMs, orbitRenders };
}

async function expectLabelsOn(page) {
  await page.waitForFunction(
    () => document.querySelector(".volume-cube__view")?.getAttribute("data-labels") === "on",
    null,
    { timeout: 120_000 },
  );
}

const browser = await chromium.launch();
const context = await browser.newContext();
const page = await context.newPage();
page.on("console", () => {});
try {
  const result = await bench(page);
  console.log(JSON.stringify(result, null, 2));
} catch (err) {
  console.error("Bench failed (is dev:landmarks-volume running on 5173?):", err);
  process.exitCode = 1;
} finally {
  await browser.close();
}
