#!/usr/bin/env node
import { createHash } from "node:crypto";
import { createReadStream, mkdirSync } from "node:fs";
import { chromium } from "@playwright/test";

const url =
  process.argv[2] ??
  "http://127.0.0.1:8765/docs/how-to/recipes/squidpy_color/index.html";
const outDir = "/opt/cursor/artifacts/recipe-niche-pilot";
const viewport = { width: 1280, height: 800 };

const outputs = [
  `${outDir}/01-intro-and-squidpy-cell.png`,
  `${outDir}/02-niche-sweep-cell.png`,
  `${outDir}/03-widget-default-niche-k30-res0.3.png`,
  `${outDir}/04-widget-niche-k8-res0.3-column.png`,
  `${outDir}/05-galt-follicle-selection-focused.png`,
  `${outDir}/06-composition-and-molab-link.png`,
  `${outDir}/07-full-page-static-chrome.png`,
];

mkdirSync(outDir, { recursive: true });

async function md5File(path) {
  const hash = createHash("md5");
  await new Promise((resolve, reject) => {
    createReadStream(path)
      .on("data", (chunk) => hash.update(chunk))
      .on("error", reject)
      .on("end", resolve);
  });
  return hash.digest("hex");
}

async function assertDistinct(paths) {
  const byHash = new Map();
  for (const path of paths) {
    const digest = await md5File(path);
    const other = byHash.get(digest);
    if (other) {
      throw new Error(`duplicate screenshot md5 ${digest}: ${path} and ${other}`);
    }
    byHash.set(digest, path);
  }
  return Object.fromEntries(
    await Promise.all(paths.map(async (p) => [p, await md5File(p)])),
  );
}

async function viewportShot(page, path) {
  await page.screenshot({ path, fullPage: false });
}

async function scrollViewportShot(page, target, path, block = "start") {
  await target.evaluate(
    (el, b) => el.scrollIntoView({ block: b, inline: "nearest" }),
    block,
  );
  await page.waitForTimeout(500);
  await viewportShot(page, path);
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport });
await page.goto(url, { waitUntil: "load", timeout: 120_000 });
await page.locator("canvas").first().waitFor({ state: "visible", timeout: 120_000 });
await page.waitForTimeout(1500);

const introHeading = page
  .locator('marimo-cell[name="cell-1"]')
  .getByRole("heading", { name: /Squidpy neighborhood niches/i });
await introHeading.evaluate((el) =>
  el.scrollIntoView({ block: "start", inline: "nearest" }),
);
await page.waitForTimeout(400);
await page.screenshot({
  path: outputs[0],
  clip: { x: 0, y: 0, width: viewport.width, height: 500 },
});

const nicheSweepAnchor = page
  .locator('marimo-cell[name="cell-1"]')
  .getByText(/Switch k \/ resolution columns/i)
  .first();
await scrollViewportShot(page, nicheSweepAnchor, outputs[1], "center");

const wide = page.locator(".milume-recipe-studio-wide").first();
await wide.scrollIntoViewIfNeeded();
await page.waitForFunction(
  () => {
    const overlay = window.__landmarksEngine?.getSelectionOverlay?.();
    return overlay?.some((row) => row.index === 0 && row.selected && row.pointCount > 0);
  },
  { timeout: 30_000 },
);
await page.waitForTimeout(800);
await viewportShot(page, outputs[2]);

await page.evaluate(() => {
  const root = document.querySelector("marimo-anywidget")?.shadowRoot;
  [...(root?.querySelectorAll("button") ?? [])]
    .find((b) => b.textContent?.trim() === "cat")
    ?.click();
  const row = [...(root?.querySelectorAll("button") ?? [])].find((b) =>
    b.textContent?.includes("niche_k8_res0.3"),
  );
  row?.click();
  window.__landmarksModel.set("color", "niche_k8_res0.3");
  window.__landmarksModel.set("active_category", "niche_k8_res0.3");
  window.__landmarksModel.save_changes();
});
await page.waitForFunction(
  () =>
    window.__landmarksModel?.get?.("color") === "niche_k8_res0.3" &&
    window.__landmarksModel?.get?.("active_category") === "niche_k8_res0.3",
  { timeout: 15_000 },
);
await page.waitForTimeout(800);
await wide.scrollIntoViewIfNeeded();
await page.waitForTimeout(300);
const rightDock = page.locator("marimo-anywidget >> .landmarks__chrome-dock--right").first();
const dockBox = await rightDock.boundingBox();
if (!dockBox) throw new Error("category dock not visible for k8 capture");
await page.screenshot({
  path: outputs[3],
  clip: {
    x: Math.max(0, dockBox.x - 320),
    y: Math.max(0, dockBox.y - 40),
    width: Math.min(viewport.width, dockBox.width + 640),
    height: Math.min(viewport.height, dockBox.height + 80),
  },
});

await page.evaluate(() => {
  window.__landmarksModel.set("selected_kind", "selection");
  window.__landmarksModel.set("selected_index", 0);
  window.__landmarksModel.save_changes();
  window.__landmarksEngine?.panTo?.(-3950, 1300, { animate: false });
});
await page.waitForTimeout(600);
await wide.scrollIntoViewIfNeeded();
await page.waitForTimeout(300);
await viewportShot(page, outputs[4]);

const compositionBlock = page.locator('marimo-cell[name="niche_composition"]').first();
await compositionBlock.scrollIntoViewIfNeeded();
await page.waitForFunction(
  () => {
    const cell = document.querySelector('marimo-cell[name="niche_composition"]');
    return Boolean(cell?.querySelector("img, canvas, svg"));
  },
  { timeout: 30_000 },
);
await page.evaluate(() => {
  const link = document.querySelector('a[href*="molab.marimo.io"]');
  if (!link) throw new Error("Open in molab link missing on recipe page");
  const chart = document.querySelector('marimo-cell[name="niche_composition"]');
  chart?.scrollIntoView({ block: "center", inline: "nearest" });
  const wrap = document.createElement("div");
  wrap.id = "milume-capture-molab-banner";
  wrap.style.cssText =
    "position:fixed;top:64px;left:248px;right:20px;z-index:100000;padding:10px 14px;background:#fff;border:1px solid #d0d7de;font:14px/1.4 system-ui,sans-serif;box-shadow:0 2px 8px rgba(0,0,0,.08);";
  wrap.innerHTML = "<strong>Open in molab:</strong> ";
  wrap.appendChild(link.cloneNode(true));
  document.body.appendChild(wrap);
});
await page.waitForTimeout(400);
await viewportShot(page, outputs[5]);
await page.evaluate(() =>
  document.getElementById("milume-capture-molab-banner")?.remove(),
);

await page.evaluate(() => {
  const style = document.createElement("style");
  style.id = "milume-recipe-capture-static-chrome";
  style.textContent = `
    .md-header,
    .md-nav--primary,
    .md-nav--drawer,
    .md-sidebar--primary {
      position: static !important;
      transform: none !important;
    }
    .md-main { margin-top: 0 !important; }
  `;
  document.head.appendChild(style);
});
await page.waitForTimeout(200);
await page.screenshot({ path: outputs[6], fullPage: true });

await browser.close();

const md5s = await assertDistinct(outputs);
console.log(JSON.stringify({ outDir, md5s }, null, 2));
