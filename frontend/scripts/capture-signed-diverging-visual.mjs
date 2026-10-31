/**
 * Capture signed-score diverging colour (1280×800 @ 2×, banner hidden).
 *
 *   CAPTURE_URL=http://127.0.0.1:5173 node scripts/capture-signed-diverging-visual.mjs
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "@playwright/test";

const root = join(import.meta.dirname, "..");
const patchDir = join(root, "dev/harness-visual-394");
const outDir = process.env.CAPTURE_OUT ?? join("/opt/cursor/artifacts/color-api-394-visual", "signed");
const base = process.env.CAPTURE_URL ?? "http://127.0.0.1:5173";

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

async function applyPatch(page, patch, sharedCatalog) {
  const lastKeys = [
    "color",
    "_look",
    "_color_state",
    "points_data",
  ];
  await page.evaluate(
    ({ p, catalog, lastKeys: late }) => {
      const model = window.__landmarksModel;
      if (catalog) model.set("_color_options", catalog);
      const entries = Object.entries(p);
      const early = entries.filter(([k]) => !late.includes(k));
      const last = entries.filter(([k]) => late.includes(k));
      for (const [k, v] of early) model.set(k, v);
      for (const [k, v] of last) model.set(k, v);
      model.save_changes();
    },
    { p: patch, catalog: sharedCatalog ?? null, lastKeys },
  );
}

async function captureWidget(page, name) {
  const widget = page.locator(".milume-widget.landmarks").first();
  await widget.waitFor({ state: "visible", timeout: 120_000 });
  await hideHarnessBanner(page);
  await page.waitForTimeout(400);
  const path = join(outDir, `${name}.png`);
  await widget.screenshot({ path });
  return path;
}

const doc = JSON.parse(readFileSync(join(patchDir, "signed.json"), "utf8"));

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 2,
  });
  await page.emulateMedia({ reducedMotion: "reduce" });

  await page.goto(`${base}/?fixture=${encodeURIComponent("/fixture.json")}`, {
    waitUntil: "networkidle",
  });
  await waitEngine(page);

  const beforeLook = { ...doc.colorApi._look, color_diverging: false, color_diverging_override: false };
  beforeLook.color_vmin = 0;
  beforeLook.color_vmax = Math.abs(beforeLook.color_vmax);
  await applyPatch(page, { ...doc.colorApi, _look: beforeLook }, doc.shared?._color_options);
  await page.getByRole("tab", { name: "num" }).click();
  await page.waitForTimeout(800);
  await captureWidget(page, "before-sequential-wrong");

  await page.goto(`${base}/?fixture=${encodeURIComponent("/fixture.json")}`, {
    waitUntil: "networkidle",
  });
  await waitEngine(page);
  await applyPatch(page, doc.colorApi, doc.shared?._color_options);
  await page.getByRole("tab", { name: "num" }).click();
  await page.getByTestId("num-heat-zero").waitFor({ state: "visible", timeout: 30_000 });
  await page.waitForTimeout(400);
  await captureWidget(page, "after-diverging");

  writeFileSync(
    join(outDir, "manifest.json"),
    JSON.stringify(
      { before: "before-sequential-wrong.png", after: "after-diverging.png" },
      null,
      2,
    ) + "\n",
  );
  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
