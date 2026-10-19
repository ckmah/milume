#!/usr/bin/env node
/**
 * Records a short minimap interaction clip (click + drag) for PR evidence.
 * Run with landmarks-volume dev server on :5173 and a display (headed Chromium).
 */
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "@playwright/test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "..", "evidence", "inspect-minimap-218");
mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, "inspect-minimap-demo.mp4");

const browser = await chromium.launch({
  headless: false,
  args: ["--window-size=1280,800"],
});
const context = await browser.newContext({
  viewport: { width: 1280, height: 800 },
  recordVideo: { dir: outDir, size: { width: 1280, height: 800 } },
});
const page = await context.newPage();
await page.goto("http://127.0.0.1:5173/?points=0&labelAlpha=0.4", {
  waitUntil: "networkidle",
});
await page.locator(".landmarks").first().waitFor({ state: "visible" });
await page.waitForFunction(() => {
  const eng = window.__landmarksEngine;
  return Boolean(eng?.getViewState?.()?.zoom);
});
const target = await page.evaluate(() => window.__landmarksEngine.getViewState().target);
await page.evaluate(([x, y]) => {
  const model = window.__landmarksModel;
  model.set("inspect_cx", x);
  model.set("inspect_cy", y);
  model.set("inspect_open", true);
  model.save_changes();
}, target);
await page.getByRole("dialog", { name: "Cube" }).waitFor({ state: "visible" });
await page.getByTestId("inspect-minimap-canvas").waitFor({ state: "visible" });
await page.waitForTimeout(800);

const canvas = page.getByTestId("inspect-minimap-canvas");
const box = await canvas.boundingBox();
if (!box) throw new Error("minimap box missing");

await page.mouse.move(box.x + box.width * 0.75, box.y + box.height * 0.3, { steps: 12 });
await page.waitForTimeout(400);
await page.mouse.click(box.x + box.width * 0.75, box.y + box.height * 0.3);
await page.waitForTimeout(600);
await page.mouse.move(box.x + box.width * 0.25, box.y + box.height * 0.75, { steps: 20 });
await page.mouse.down();
await page.mouse.move(box.x + box.width * 0.85, box.y + box.height * 0.2, { steps: 24 });
await page.mouse.up();
await page.waitForTimeout(800);

const video = await page.video();
await context.close();
await browser.close();
if (video) {
  await video.saveAs(outPath);
  console.log(`Wrote ${outPath}`);
} else {
  console.error("No video recorded");
  process.exit(1);
}
