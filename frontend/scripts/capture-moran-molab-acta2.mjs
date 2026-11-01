#!/usr/bin/env node
/**
 * Visual acceptance: local marimo run after picking Erbb3 (two screenshots).
 */
import { execSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { chromium } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const baseUrl = process.env.MARIMO_BASE_URL ?? "http://127.0.0.1:28765";
const outDir =
  process.argv[2] ?? "/opt/cursor/artifacts/recipe-moran-409-molab";
const viewport = { width: 1280, height: 900 };

mkdirSync(outDir, { recursive: true });

async function placeCapturePointer(frame, x, y) {
  await frame.evaluate(
    ({ x, y }) => {
      const existing = document.getElementById("milume-capture-pointer");
      if (existing) existing.remove();
      const pointer = document.createElement("div");
      pointer.id = "milume-capture-pointer";
      pointer.setAttribute("aria-hidden", "true");
      pointer.style.cssText = [
        "position:fixed",
        `left:${x - 2}px`,
        `top:${y - 2}px`,
        "width:0",
        "height:0",
        "z-index:2147483647",
        "pointer-events:none",
        "border-left:12px solid #111",
        "border-top:8px solid transparent",
        "border-bottom:8px solid transparent",
        "filter:drop-shadow(0 0 1px #fff)",
      ].join(";");
      document.body.appendChild(pointer);
    },
    { x, y },
  );
}

const browser = await chromium.launch({
  headless: true,
  args: ["--force-device-scale-factor=1"],
});
const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
await page.goto(baseUrl, { waitUntil: "networkidle", timeout: 180_000 });

const iframeHandle = await page.waitForSelector("iframe", { timeout: 120_000 });
const frame = await iframeHandle.contentFrame();
if (!frame) throw new Error("marimo iframe missing");

const runAll = frame.getByRole("button", { name: /run all/i });
if (await runAll.count()) {
  await runAll.click();
} else {
  await frame.locator("canvas.landmarks__webgl, canvas").first().waitFor({
    state: "visible",
    timeout: 420_000,
  });
}

await frame.locator("canvas.landmarks__webgl, canvas").first().waitFor({
  state: "visible",
  timeout: 420_000,
});
await frame.waitForFunction(
  () => (window.__landmarksEngine?.getPoints?.()?.length ?? 0) > 0,
  undefined,
  { timeout: 180_000 },
);

const plotImg = frame.locator("img").last();
await plotImg.waitFor({ state: "visible", timeout: 180_000 });
const plotSrcApob = (await plotImg.getAttribute("src")) ?? "";

async function pickGeneOnly(gene) {
  await frame.getByTestId("explore-color-by").click().catch(() => {});
  const genePicker = frame.getByRole("combobox").first();
  await genePicker.click();
  await page.keyboard.press("Control+a");
  await page.keyboard.press("Backspace");
  await page.keyboard.type(gene);
  await page.keyboard.press("Enter");
}

await pickGeneOnly("Erbb3");
await frame.waitForFunction(
  () => {
    const genes = window.__landmarksModel?.get?.("active_genes");
    return Array.isArray(genes) && genes.includes("Erbb3");
  },
  undefined,
  { timeout: 60_000 },
);

const moranPlotsCell = frame.locator('[data-cell-name="moran_plots"]');
await moranPlotsCell.scrollIntoViewIfNeeded();
await moranPlotsCell.click({ position: { x: 12, y: 12 } });
await page.keyboard.press("Control+Enter");
await page.waitForTimeout(1500);

const widget = frame.locator(".milume-widget.landmarks").first();
await page.setViewportSize({ width: 1280, height: 1100 });
await widget.scrollIntoViewIfNeeded({ block: "start" });
await page.waitForTimeout(600);
const genePicker = frame.getByRole("combobox").first();
const pickerBox = await genePicker.boundingBox();
if (!pickerBox) throw new Error("gene picker box missing");
const pointerX = pickerBox.x + pickerBox.width * 0.35;
const pointerY = pickerBox.y + pickerBox.height * 0.5;
await page.mouse.move(pointerX, pointerY);
await placeCapturePointer(frame, pointerX, pointerY);
await page.waitForTimeout(200);
await widget.screenshot({
  path: `${outDir}/04-molab-erbb3-widget.png`,
});

const plotOut = `${outDir}/05-molab-erbb3-scatter-expression.png`;
execSync(
  `uv run --directory ${JSON.stringify(repoRoot)} python frontend/scripts/render_moran_recipe_plot_capture.py Erbb3 ${JSON.stringify(plotOut)}`,
  { stdio: "inherit" },
);

await browser.close();
