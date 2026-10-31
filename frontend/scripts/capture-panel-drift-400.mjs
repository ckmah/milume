/**
 * Visual acceptance captures for #400 (1280×800, 2× DPR, harness banner hidden).
 * Usage: node scripts/capture-panel-drift-400.mjs
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "@playwright/test";

const outDir = process.env.CAPTURE_OUT ?? "/opt/cursor/artifacts/panel-drift-400";
const prefix = process.env.CAPTURE_PREFIX ?? "after";
const base = process.env.CAPTURE_URL ?? "http://127.0.0.1:5173";

mkdirSync(outDir, { recursive: true });

async function hideHarnessBanner(page) {
  await page.addStyleTag({
    content: `[data-testid="harness-banner"], .harness-banner { display: none !important; }`,
  });
}

async function waitEngine(page) {
  await page.waitForFunction(() => Boolean(window.__landmarksEngine?.getViewState?.()), null, {
    timeout: 120_000,
  });
}

async function setModel(page, patch) {
  await page.evaluate((p) => {
    const model = window.__landmarksModel;
    for (const [k, v] of Object.entries(p)) model.set(k, v);
    model.save_changes();
  }, patch);
}

async function capture(page, name) {
  const widget = page.locator(".milume-widget.landmarks").first();
  await widget.waitFor({ state: "visible", timeout: 120_000 });
  await hideHarnessBanner(page);
  await widget.screenshot({ path: join(outDir, `${prefix}-${name}.png`) });
}

async function load(page) {
  await page.goto(`${base}/?fixture=/fixture.json`, { waitUntil: "networkidle" });
  await waitEngine(page);
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 2,
  });

  await load(page);
  await setModel(page, { selected_kind: "landmark", selected_index: 0 });
  await page.getByTestId("toggle-minimise-panels").click();
  await capture(page, "minimise-landmark");

  await load(page);
  await page.getByTestId("toggle-minimise-panels").hover();
  await capture(page, "minimise-toggle-expanded");

  await load(page);
  await setModel(page, { selected_kind: "selection", selected_index: 0 });
  await page.getByRole("tab", { name: "cat" }).click();
  await capture(page, "cat-selection");

  await load(page);
  await setModel(page, { selected_kind: "", selected_index: -1 });
  await page.getByRole("tab", { name: "cat" }).click();
  await capture(page, "cat-all-cells");

  await browser.close();
  console.log(`Wrote captures under ${outDir}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
