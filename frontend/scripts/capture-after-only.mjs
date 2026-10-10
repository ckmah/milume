import { chromium } from "@playwright/test";

const outDir = "/opt/cursor/artifacts";
const base = process.env.AFTER_CAPTURE_URL ?? "http://127.0.0.1:5174";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
try {
  await page.goto(`${base}/?window=100`, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await page.waitForFunction(() => Boolean(window.__landmarksEngine?.getViewState?.()), null, {
    timeout: 300_000,
  });
  await page.getByRole("radio", { name: "Inspect", exact: true }).click();
  const canvas = page.locator("canvas.landmarks__webgl").first();
  const box = await canvas.boundingBox();
  if (!box) throw new Error("no canvas");
  await page.mouse.click(box.x + box.width * 0.52, box.y + box.height * 0.48);
  const view = page.locator('[role="dialog"][aria-label="Cube"] .volume-cube__view');
  await view.waitFor({ state: "visible", timeout: 120_000 });
  await page.waitForFunction(
    () => document.querySelector(".volume-cube__view")?.getAttribute("data-refining") === "false",
    null,
    { timeout: 300_000 },
  );
  for (const toggle of ["layer-toggle-labels", "layer-toggle-image"]) {
    const el = page.getByTestId(toggle);
    if ((await el.getAttribute("aria-pressed")) !== "true") await el.click();
  }
  const bar = page.getByTestId("context-inspect-toolbar");
  for (const [preset, name] of [
    ["top", "Top view"],
    ["iso", "Oblique view"],
    ["side", "Side view"],
  ]) {
    await bar.getByRole("radio", { name }).click();
    await page.waitForTimeout(800);
    const path = `${outDir}/issue-117-pyxa-after-${preset}.png`;
    await view.screenshot({ path });
    console.log("wrote", path);
  }
} finally {
  await browser.close();
}
