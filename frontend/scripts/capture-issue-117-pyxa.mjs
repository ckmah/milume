/**
 * Inspect cube screenshots on HF Stellaromics/demo small/ (landmarks-volume-small harness).
 * Usage: ISSUE_117_TAG=before|after node scripts/capture-issue-117-pyxa.mjs
 * Requires: MILUME_VOLUME_PROFILE=small vite on http://127.0.0.1:5173
 */
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const tag = process.env.ISSUE_117_TAG;
if (!tag || !/^(before|after)$/.test(tag)) {
  console.error("Set ISSUE_117_TAG=before or after");
  process.exit(2);
}
const outDir = "/opt/cursor/artifacts";
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
try {
  await page.goto("http://127.0.0.1:5173/?window=100", { waitUntil: "domcontentloaded", timeout: 120_000 });
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
  const bar = page.getByTestId("context-inspect-toolbar");
  for (const [preset, name] of [
    ["top", "Top view"],
    ["iso", "Oblique view"],
  ]) {
    await bar.getByRole("radio", { name }).click();
    await page.waitForTimeout(1200);
    const path = `${outDir}/issue-117-pyxa-${tag}-${preset}.png`;
    await view.screenshot({ path });
    console.log("wrote", path);
  }
} finally {
  await browser.close();
}
