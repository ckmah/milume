/**
 * Full-widget harness captures for panel layout PR (#393).
 * Usage: node scripts/capture-panel-layout.mjs
 * Requires: `npm run dev:landmarks -- --host 127.0.0.1 --port 5173` or Playwright webServer.
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "@playwright/test";

const outDir = process.env.CAPTURE_OUT ?? "/opt/cursor/artifacts/panel-layout";
const base = process.env.CAPTURE_URL ?? "http://127.0.0.1:5173";
const ILEUM = "/e2e-galt-lasso-fixture.json";

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
  await widget.screenshot({ path: join(outDir, `${name}.png`) });
}

async function loadFixture(page, fixturePath) {
  await page.goto(`${base}/?fixture=${encodeURIComponent(fixturePath)}`, {
    waitUntil: "networkidle",
  });
  await waitEngine(page);
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

  await loadFixture(page, "/fixture.json");
  await capture(page, "panel-layout-3d-default");

  await loadFixture(page, ILEUM);
  await capture(page, "panel-layout-ileum-2d");

  await loadFixture(page, "/fixture.json");
  await setModel(page, { selected_kind: "selection", selected_index: 0 });
  await page.getByTestId("panel-section-landmarks").click();
  await capture(page, "panel-layout-left-collapsed-pin");

  await loadFixture(page, "/fixture.json");
  await setModel(page, { selected_kind: "selection", selected_index: 0 });
  await page.getByRole("tab", { name: "cat" }).click();
  await capture(page, "panel-layout-cat-selection-bars");

  await loadFixture(page, ILEUM);
  await page.getByRole("tab", { name: "num" }).click();
  await capture(page, "panel-layout-num-strip");

  await loadFixture(page, "/fixture.json");
  const genes3 = ["Abtb3", "Adamts2", "Adcyap1"];
  await setModel(page, { active_genes: genes3, color_mode: "continuous" });
  await page.getByRole("tab", { name: "genes" }).click();
  await capture(page, "panel-layout-genes-3");

  const geneNames = await page.evaluate(() =>
    (window.__landmarksModel.get("gene_names") ?? []).slice(0, 20).map((g) => g.name),
  );
  await setModel(page, { active_genes: geneNames, color_mode: "continuous" });
  await capture(page, "panel-layout-genes-20");

  await loadFixture(page, "/fixture.json");
  await page.getByRole("tab", { name: "embed" }).click();
  await capture(page, "panel-layout-embed");

  await loadFixture(page, "/fixture.json");
  await setModel(page, { selected_kind: "landmark", selected_index: 0 });
  await page.getByTestId("toggle-minimise-panels").click();
  await capture(page, "panel-layout-minimise-landmark");

  await loadFixture(page, "/fixture.json");
  await setModel(page, { selected_kind: "selection", selected_index: 0 });
  await page.getByTestId("toggle-minimise-panels").click();
  await capture(page, "panel-layout-minimise-selection");

  await browser.close();
  console.log(`Wrote captures under ${outDir}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
