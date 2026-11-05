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

/** Headless Chromium omits the OS cursor; draw a pointer for widget interaction stills (#414). */
async function drawPointerOverlay(page, x, y) {
  await page.evaluate(
    ({ px, py }) => {
      document.getElementById("milume-capture-pointer-overlay")?.remove();
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.id = "milume-capture-pointer-overlay";
      svg.setAttribute("width", "28");
      svg.setAttribute("height", "28");
      svg.setAttribute("viewBox", "0 0 28 28");
      svg.style.cssText = `position:fixed;left:${px}px;top:${py}px;z-index:2147483647;pointer-events:none;filter:drop-shadow(0 1px 2px rgba(0,0,0,0.45));`;
      svg.innerHTML =
        '<path fill="#ffffff" stroke="#111111" stroke-width="1.25" d="M3 2 L3 22 L9.5 16.5 L13.5 26 L16.5 24.5 L12.5 15 L20 15 Z"/>';
      document.body.appendChild(svg);
    },
    { px: x, py: y },
  );
}

async function clearPointerOverlay(page) {
  await page.evaluate(() => document.getElementById("milume-capture-pointer-overlay")?.remove());
}

async function viewportShotWithPointer(page, path, x, y) {
  await drawPointerOverlay(page, x, y);
  await viewportShot(page, path);
  await clearPointerOverlay(page);
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
  .locator('marimo-cell[name="recipe_intro"]')
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
  .locator('marimo-cell[name="niche_sweep_method"]')
  .getByText(/sq\.gr\.spatial_neighbors/i)
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
const pointerK30 = { x: 640, y: 420 };
await viewportShotWithPointer(page, outputs[2], pointerK30.x, pointerK30.y);

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
await page.waitForTimeout(500);
// Same follicle FOV and viewport framing as still 03; only the active niche column changes.
const pointerK8 = { x: 640, y: 420 };
await viewportShotWithPointer(page, outputs[3], pointerK8.x, pointerK8.y);

await page.evaluate(() => {
  window.__landmarksModel.set("selected_kind", "selection");
  window.__landmarksModel.set("selected_index", 0);
  window.__landmarksModel.save_changes();
  window.__landmarksEngine?.panTo?.(-3950, 1300, { animate: false });
});
await page.waitForTimeout(600);
await wide.scrollIntoViewIfNeeded();
await page.waitForTimeout(300);
const pointerGalt = { x: 520, y: 380 };
await viewportShotWithPointer(page, outputs[4], pointerGalt.x, pointerGalt.y);

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
  document
    .querySelector('marimo-cell[name="niche_composition"]')
    ?.scrollIntoView({ block: "center", inline: "nearest" });
});
await page.waitForTimeout(400);
await viewportShot(page, outputs[5]);

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
