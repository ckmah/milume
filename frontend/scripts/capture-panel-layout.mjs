/**
 * Full-widget harness captures for panel layout PR (#393).
 * Usage: node scripts/capture-panel-layout.mjs
 * Requires: dev server at CAPTURE_URL (default http://127.0.0.1:5173).
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "@playwright/test";

const outDir = process.env.CAPTURE_OUT ?? "/opt/cursor/artifacts/panel-layout";
const base = process.env.CAPTURE_URL ?? "http://127.0.0.1:5173";

mkdirSync(outDir, { recursive: true });

async function hideHarnessBanner(page) {
  await page.addStyleTag({
    content: `[data-testid="harness-banner"], .harness-banner { display: none !important; }`,
  });
}

async function capture(page, name) {
  const widget = page.locator(".milume-widget.landmarks").first();
  await widget.waitFor({ state: "visible", timeout: 120_000 });
  await hideHarnessBanner(page);
  await widget.screenshot({ path: join(outDir, `${name}.png`) });
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

  await page.goto(`${base}/?fixture=/fixture.json`, { waitUntil: "networkidle" });
  await page.waitForFunction(() => Boolean(window.__landmarksEngine?.getViewState?.()), null, {
    timeout: 120_000,
  });
  await capture(page, "panel-layout-3d-default");

  await page.goto(`${base}/?fixture=${encodeURIComponent("/e2e-galt-lasso-fixture.json")}`, {
    waitUntil: "networkidle",
  });
  await page.waitForFunction(() => Boolean(window.__landmarksEngine?.getViewState?.()), null, {
    timeout: 120_000,
  });
  await capture(page, "panel-layout-ileum-2d");

  await browser.close();
  console.log(`Wrote captures under ${outDir}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
