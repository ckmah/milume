/**
 * Pyxa small before (main worktree) vs after (PR branch): uncut + Z-cut through cells.
 * Usage: node scripts/capture-issue-117-pyxa-paired.mjs
 * Env: MAIN_CAPTURE_URL (5175), AFTER_CAPTURE_URL (5174), MILUME_VOLUME_PROFILE=small on both servers.
 */
import { createHash } from "node:crypto";
import { readFileSync, mkdirSync } from "node:fs";
import { chromium } from "@playwright/test";

const outDir = "/opt/cursor/artifacts";
const mainUrl = process.env.MAIN_CAPTURE_URL ?? "http://127.0.0.1:5175";
const afterUrl = process.env.AFTER_CAPTURE_URL ?? "http://127.0.0.1:5174";

mkdirSync(outDir, { recursive: true });

async function captureSet(base, tag) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  try {
    await page.goto(`${base}/?window=100`, { waitUntil: "domcontentloaded", timeout: 120_000 });
    await page.waitForFunction(() => Boolean(window.__landmarksEngine?.getViewState?.()), null, {
      timeout: 300_000,
    });
    await page.getByRole("radio", { name: "Inspect", exact: true }).click();
    const canvas = page.locator("canvas.landmarks__webgl").first();
    const box = await canvas.boundingBox();
    if (!box) throw new Error("no canvas");
    await page.mouse.click(box.x + box.width * 0.52, box.y + box.height * 0.48);
    const view = page.locator('[role="dialog"][aria-label="Cube"] .volume-cube__view');
    await view.waitFor({ state: "visible", timeout: 120_000 });
    await page.waitForFunction(
      () => document.querySelector(".volume-cube__view")?.getAttribute("data-refining") === "false",
      null,
      { timeout: 300_000 },
    );
    for (const toggle of ["layer-toggle-labels", "layer-toggle-image"]) {
      const el = page.getByTestId(toggle);
      if ((await el.getAttribute("aria-pressed")) !== "true") await el.click();
    }
    const bar = page.getByTestId("context-inspect-toolbar");

    await bar.getByRole("radio", { name: "Top view" }).click();
    await page.waitForTimeout(800);
    const uncutTop = `${outDir}/issue-117-pyxa-${tag}-uncut-top.png`;
    await view.screenshot({ path: uncutTop });
    console.log("wrote", uncutTop, "from", base);

    await page.evaluate(() => {
      const m = window.__landmarksModel;
      if (m) m.set("volume_cut", [0, 1e9, 0, 1e9, 12, 18]);
      m?.save_changes?.();
    });
    await page.waitForFunction(
      () => document.querySelector(".volume-cube__view")?.getAttribute("data-refining") === "false",
      null,
      { timeout: 300_000 },
    );
    await bar.getByRole("radio", { name: "Side view" }).click({ timeout: 120_000 });
    await page.waitForTimeout(800);
    const zcutSide = `${outDir}/issue-117-pyxa-${tag}-zcut-side.png`;
    await view.screenshot({ path: zcutSide });
    console.log("wrote", zcutSide, "from", base);
  } finally {
    await browser.close();
  }
}

function md5(path) {
  return createHash("md5").update(readFileSync(path)).digest("hex");
}

console.log("=== BEFORE (main worktree)", mainUrl);
await captureSet(mainUrl, "before");
console.log("=== AFTER (PR branch)", afterUrl);
await captureSet(afterUrl, "after");

const shots = ["uncut-top", "zcut-side"];
console.log("\n=== MD5 ===");
for (const shot of shots) {
  const before = `${outDir}/issue-117-pyxa-before-${shot}.png`;
  const after = `${outDir}/issue-117-pyxa-after-${shot}.png`;
  const hb = md5(before);
  const ha = md5(after);
  console.log("before", shot, hb);
  console.log("after ", shot, ha);
  if (hb === ha) {
    console.error(`FAIL: ${shot} before/after identical`);
    process.exit(1);
  }
}
console.log("OK: paired captures differ");
