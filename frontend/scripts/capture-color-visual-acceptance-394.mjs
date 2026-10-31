/**
 * #394 visual acceptance: legacy vs colorApi patches on the same Vite bundle.
 * Same harness fixture.json, 1280×800 @ 2× DPR, full widget, banner hidden.
 *
 *   CAPTURE_URL=http://127.0.0.1:5173 CAPTURE_PHASE=before node scripts/capture-color-visual-acceptance-394.mjs
 *   CAPTURE_URL=http://127.0.0.1:5173 CAPTURE_PHASE=after node scripts/capture-color-visual-acceptance-394.mjs
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "@playwright/test";

const root = join(import.meta.dirname, "..");
const patchDir = join(root, "dev/harness-visual-394");
const phase = process.env.CAPTURE_PHASE ?? "after";
const outDir =
  process.env.CAPTURE_OUT ??
  join("/opt/cursor/artifacts/color-api-394-visual", phase);
const base = process.env.CAPTURE_URL ?? "http://127.0.0.1:5173";
const api = phase === "before" ? "legacy" : "colorApi";

const modes = [
  { id: "categorical", tab: "cat" },
  { id: "numeric", tab: "num" },
  { id: "gene-blend", tab: "genes" },
  { id: "embedding", tab: "embed" },
];

/** Apply data traits first so CSC / options land before color and active_genes. */
const PATCH_ORDER_LAST = new Set([
  "color",
  "active_genes",
  "active_category",
  "color_mode",
  "legend_title",
  "legend_labels",
  "raster_basis",
  "raster_embedding_key",
  "point_palette",
  "color_vmin",
  "color_vmax",
  "gene_scale_mode",
  "gene_log1p",
  "raster_embedding_dims",
  "gene_names",
  "raster_embedding_keys",
]);

mkdirSync(outDir, { recursive: true });

async function hideHarnessBanner(page) {
  await page.addStyleTag({
    content: `[data-testid="harness-banner"], .harness-banner, .harness-toolbar, .landmarks__dev-panel { display: none !important; }`,
  });
}

async function waitEngine(page) {
  await page.waitForFunction(() => Boolean(window.__landmarksEngine?.getViewState?.()), null, {
    timeout: 120_000,
  });
}

async function setModel(page, patch, sharedCatalog) {
  await page.evaluate(
    ({ p, catalog, lastKeys }) => {
      const model = window.__landmarksModel;
      if (catalog) model.set("_color_options", catalog);
      const entries = Object.entries(p);
      const early = entries.filter(([k]) => !lastKeys.includes(k));
      const late = entries.filter(([k]) => lastKeys.includes(k));
      for (const [k, v] of early) model.set(k, v);
      for (const [k, v] of late) model.set(k, v);
      model.save_changes();
    },
    { p: patch, catalog: sharedCatalog ?? null, lastKeys: [...PATCH_ORDER_LAST] },
  );
}

async function waitGeneBlendReady(page) {
  await page.waitForFunction(
    () => {
      const text = document.body.innerText || "";
      return /Abtb3[\s\S]{0,24}(9[0-9]|100)%/.test(text);
    },
    null,
    { timeout: 120_000 },
  );
}

async function captureWidget(page, name) {
  const widget = page.locator(".milume-widget.landmarks").first();
  await widget.waitFor({ state: "visible", timeout: 120_000 });
  await hideHarnessBanner(page);
  await page.waitForTimeout(300);
  const path = join(outDir, `${name}.png`);
  await widget.screenshot({ path });
  return path;
}

function loadPatch(modeId) {
  const raw = readFileSync(join(patchDir, `${modeId}.json`), "utf8");
  const doc = JSON.parse(raw);
  return {
    patch: doc[api],
    catalog: api === "legacy" ? doc.shared?._color_options : undefined,
  };
}

async function captureModes(page) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const { id, tab } of modes) {
    const { patch, catalog } = loadPatch(id);
    await page.goto(`${base}/?fixture=${encodeURIComponent("/fixture.json")}`, {
      waitUntil: "networkidle",
    });
    await waitEngine(page);
    await setModel(page, patch, catalog);
    await page.getByRole("tab", { name: tab }).click();
    if (id === "gene-blend") await waitGeneBlendReady(page);
    else await page.waitForTimeout(500);
    await page.waitForTimeout(800);
    await captureWidget(page, id);
  }
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 2,
  });
  await captureModes(page);
  await browser.close();
  console.log(JSON.stringify({ phase, api, outDir }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
