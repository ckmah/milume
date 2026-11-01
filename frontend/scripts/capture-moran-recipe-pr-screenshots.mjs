#!/usr/bin/env node
/** PR #415 Moran recipe static page captures (Erbb3 default, Apob contrast, panels). */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";

const base =
  process.env.MILUME_RECIPE_CAPTURE_BASE?.replace(/\/$/, "") ??
  "http://127.0.0.1:8765";
const url =
  process.argv[2] ??
  `${base}/docs/how-to/recipes/squidpy_moran/index.html`;
const outDir = process.argv[3] ?? "/opt/cursor/artifacts/recipe-moran-409";
const viewport = { width: 1280, height: 900 };
const STRIP_CELLS = "6,486";

mkdirSync(outDir, { recursive: true });

function md5(path) {
  return createHash("md5").update(readFileSync(path)).digest("hex");
}

async function readMapMeta(page) {
  return page.evaluate(() => {
    const host = document.querySelector(".milume-recipe-studio-wide marimo-anywidget");
    const root = host?.shadowRoot;
    const info = root?.querySelector('[data-testid="info-context-row"]')?.textContent?.trim() ?? "";
    const chips = [...(root?.querySelectorAll('[data-slot="combobox-chip"]') ?? [])].map(
      (el) => el.textContent?.trim() ?? "",
    );
    const model = window.__landmarksModel;
    return {
      color: model?.get?.("color") ?? null,
      active_genes: model?.get?.("active_genes") ?? null,
      info,
      chips,
    };
  });
}

async function assertMapState(page, { color, cellsLabel }) {
  await page.waitForFunction(
    () => {
      const m = window.__landmarksModel;
      return m?.get?.("color") === "Erbb3" && m?.get?.("active_genes")?.includes?.("Erbb3");
    },
    { timeout: 60_000 },
  );
  const meta = await readMapMeta(page);
  if (color && meta.color !== color) {
    throw new Error(`expected color ${color}, got ${meta.color} (${url})`);
  }
  if (cellsLabel && !meta.info.includes(cellsLabel)) {
    throw new Error(`expected info row to include "${cellsLabel}", got "${meta.info}" (${url})`);
  }
  return meta;
}

async function setGeneViaModel(page, gene) {
  await page.evaluate((g) => {
    const model = window.__landmarksModel;
    if (!model) throw new Error("missing __landmarksModel");
    model.set("color", g);
    model.set("active_genes", [g]);
    model.set("color_mode", "continuous");
    model.save_changes();
  }, gene);
  await page.waitForFunction(
    (g) => window.__landmarksModel?.get?.("color") === g,
    gene,
    { timeout: 30_000 },
  );
  await page.waitForTimeout(800);
}

async function captureLandmarksWidget(page, path) {
  const wide = page.locator(".milume-recipe-studio-wide").first();
  await wide.scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  const box = await page.evaluate(() => {
    const host = document.querySelector(".milume-recipe-studio-wide marimo-anywidget");
    const landmarks = host?.shadowRoot?.querySelector(".landmarks");
    if (!landmarks) return null;
    const r = landmarks.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  });
  if (!box || box.width < 10 || box.height < 10) {
    throw new Error("landmarks widget bounding box missing");
  }
  await page.screenshot({
    path,
    clip: {
      x: Math.max(0, box.x),
      y: Math.max(0, box.y),
      width: Math.min(viewport.width - box.x, box.width),
      height: Math.min(viewport.height - box.y, box.height),
    },
  });
}

async function captureResultPanels(page, pathScatter, pathProfile) {
  const resultCell = page
    .locator('[data-marimo-studio-site][name="result_figure"], marimo-cell[name="result_figure"]')
    .last();
  await resultCell.scrollIntoViewIfNeeded();
  await page.waitForTimeout(800);
  const plotImg = page.locator(".milume-recipe-studio-prose img").last();
  await plotImg.waitFor({ state: "visible", timeout: 120_000 });
  const box = await plotImg.boundingBox();
  if (!box) throw new Error("result_figure image missing");
  const mid = box.x + box.width * 0.52;
  await page.screenshot({
    path: pathScatter,
    clip: { x: box.x, y: box.y, width: mid - box.x, height: box.height },
  });
  await page.screenshot({
    path: pathProfile,
    clip: { x: mid, y: box.y, width: box.width - (mid - box.x), height: box.height },
  });
}

const report = [];

async function captureMode(page, scheme, suffix) {
  await page.goto(url, { waitUntil: "networkidle", timeout: 120_000 });
  await page.evaluate((s) => {
    document.body.setAttribute("data-md-color-scheme", s);
    document.documentElement.setAttribute("data-md-color-scheme", s);
  }, scheme);
  await page.locator(".milume-recipe-studio-wide canvas").first().waitFor({
    state: "visible",
    timeout: 120_000,
  });
  if (scheme === "slate") {
    await page.waitForFunction(
      () => {
        const host = document.querySelector(".milume-recipe-studio-wide marimo-anywidget");
        return Boolean(host?.shadowRoot?.querySelector(".landmarks.landmarks--dark"));
      },
      { timeout: 60_000 },
    );
  }
  await page.waitForTimeout(1200);

  let meta = await assertMapState(page, { color: "Erbb3", cellsLabel: STRIP_CELLS });
  const mapErbb3 = `${outDir}/01-static-default-erbb3-${suffix}.png`;
  await captureLandmarksWidget(page, mapErbb3);
  report.push({ file: mapErbb3, md5: md5(mapErbb3), ...meta });

  const scatterErbb3 = `${outDir}/02-static-erbb3-scatter-${suffix}.png`;
  const profileErbb3 = `${outDir}/02-static-erbb3-villus-profile-${suffix}.png`;
  await captureResultPanels(page, scatterErbb3, profileErbb3);
  report.push({ file: scatterErbb3, md5: md5(scatterErbb3), panel: "scatter", theme: suffix });
  report.push({ file: profileErbb3, md5: md5(profileErbb3), panel: "distance-to-crypt", theme: suffix });

  await setGeneViaModel(page, "Apob");
  meta = await readMapMeta(page);
  if (meta.color !== "Apob") {
    throw new Error(`Apob switch failed: ${JSON.stringify(meta)}`);
  }
  const mapApob = `${outDir}/03-static-contrast-apob-${suffix}.png`;
  await captureLandmarksWidget(page, mapApob);
  report.push({ file: mapApob, md5: md5(mapApob), ...meta });

  const scatterApob = `${outDir}/04-static-apob-scatter-${suffix}.png`;
  const profileApob = `${outDir}/04-static-apob-villus-profile-${suffix}.png`;
  await captureResultPanels(page, scatterApob, profileApob);
  report.push({ file: scatterApob, md5: md5(scatterApob), panel: "scatter-apob", theme: suffix });
  report.push({ file: profileApob, md5: md5(profileApob), panel: "distance-to-crypt-apob", theme: suffix });
}

const browser = await chromium.launch({ headless: true });
for (const [scheme, suffix] of [
  ["default", "light"],
  ["slate", "dark"],
]) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  await captureMode(page, scheme, suffix);
  await context.close();
}
await browser.close();

const reportPath = `${outDir}/capture-report.json`;
writeFileSync(reportPath, `${JSON.stringify({ url, report }, null, 2)}\n`);
console.log(`wrote ${reportPath}`);
for (const row of report) {
  if (row.info) {
    console.log(`${row.file.split("/").pop()} md5=${row.md5} color=${row.color} info="${row.info}" chips=${JSON.stringify(row.chips)}`);
  }
}
