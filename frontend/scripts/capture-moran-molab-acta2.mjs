#!/usr/bin/env node
/**
 * Visual acceptance: local marimo run of squidpy_moran after picking Acta2 in the widget.
 */
import { mkdirSync } from "node:fs";
import { chromium } from "@playwright/test";

const baseUrl = process.env.MARIMO_BASE_URL ?? "http://127.0.0.1:28765";
const outDir =
  process.argv[2] ?? "/opt/cursor/artifacts/recipe-moran-409-molab";
const viewport = { width: 1280, height: 900 };

mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport });
await page.goto(baseUrl, { waitUntil: "networkidle", timeout: 180_000 });

const iframeHandle = await page.waitForSelector("iframe", { timeout: 120_000 });
const content = await iframeHandle.contentFrame();
if (!content) throw new Error("marimo iframe missing");
const frame = content;
const runAll = frame.getByRole("button", { name: /run all/i });
if (await runAll.count()) {
  await runAll.click();
}

const canvas = frame.locator("canvas.landmarks__webgl, canvas").first();
await canvas.waitFor({ state: "visible", timeout: 420_000 });
await frame.waitForFunction(
  () => (window.__landmarksEngine?.getPoints?.()?.length ?? 0) > 0,
  undefined,
  { timeout: 180_000 },
);

const genePicker = frame.getByRole("combobox").first();
await genePicker.waitFor({ state: "visible", timeout: 120_000 });
await frame.getByTestId("explore-color-by").click().catch(() => {});
await genePicker.click();
await page.keyboard.type("Acta2");
await page.keyboard.press("Enter");
await page.waitForTimeout(6000);

await frame.getByText(/not expressed in .*5%.*enterocytes/i).first().waitFor({
  state: "visible",
  timeout: 180_000,
});

await page.mouse.move(640, 420);
await page.waitForTimeout(300);
await page.screenshot({
  path: `${outDir}/03-molab-acta2-widget-and-plots.png`,
  fullPage: true,
});

await browser.close();
