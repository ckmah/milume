/**
 * Visual acceptance captures for #394 (color API). 1280x800 viewport, full widget.
 * Usage: CAPTURE_URL=http://127.0.0.1:5173 node scripts/capture-color-api-394.mjs
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "@playwright/test";

const outDir = process.env.CAPTURE_OUT ?? "/opt/cursor/artifacts/color-api-394";
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
  await widget.screenshot({ path: join(outDir, `${name}.png`) });
}

async function main() {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 2,
    recordVideo: { dir: outDir, size: { width: 1280, height: 800 } },
  });
  const page = await context.newPage();
  await page.goto(`${base}/?fixture=${encodeURIComponent("/fixture.json")}`, {
    waitUntil: "networkidle",
  });
  await waitEngine(page);
  await page.evaluate(() => {
    const el = document.createElement("div");
    el.id = "color-probe-overlay";
    el.style.cssText =
      "position:fixed;bottom:12px;left:12px;z-index:99999;font:14px monospace;background:#111;color:#eee;padding:8px 10px;border-radius:6px;pointer-events:none";
    document.body.appendChild(el);
  });

  const showColor = async () => {
    const c = await page.evaluate(() => window.__landmarksModel.get("color"));
    await page.evaluate((color) => {
      document.getElementById("color-probe-overlay").textContent = `w.color = ${JSON.stringify(color)}`;
    }, c);
  };

  await setModel(page, { color: "celltype" });
  await page.getByRole("tab", { name: "cat" }).click();
  await showColor();
  await page.waitForTimeout(400);

  await setModel(page, { color: "compartment" });
  await page.getByRole("tab", { name: "num" }).click();
  await showColor();
  await page.waitForTimeout(400);

  await setModel(page, { color: ["Lgr5", "Cd3e", "Col1a1"] });
  await page.getByRole("tab", { name: "genes" }).click();
  await showColor();
  await page.waitForTimeout(400);

  await setModel(page, { color: "X_pca" });
  await page.getByRole("tab", { name: "embed" }).click();
  await showColor();
  await page.waitForTimeout(400);

  await capture(page, "color-categorical");
  await setModel(page, { color: "compartment" });
  await capture(page, "color-numeric");
  await setModel(page, { color: ["Lgr5", "Cd3e", "Col1a1"] });
  await capture(page, "color-gene-blend");
  await setModel(page, { color: "X_pca" });
  await capture(page, "color-embedding");

  const video = page.video();
  await page.close();
  if (video) {
    await video.saveAs(join(outDir, "color-ui-switch.webm"));
  }
  await context.close();
  await browser.close();
  console.log(`wrote captures under ${outDir}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
