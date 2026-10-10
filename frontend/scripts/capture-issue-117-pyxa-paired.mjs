/**
 * Pyxa small before (main worktree) vs after (PR branch): uncut + Z-cut through cells.
 * Usage: node scripts/capture-issue-117-pyxa-paired.mjs
 * Env: MAIN_CAPTURE_URL (5175), AFTER_CAPTURE_URL (5174), MILUME_VOLUME_PROFILE=small on both servers.
 */
import { createHash } from "node:crypto";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";

const outDir = process.env.CAPTURE_OUT ?? "/opt/cursor/artifacts";
const mainUrl = process.env.MAIN_CAPTURE_URL ?? "http://127.0.0.1:5175";
const afterUrl = process.env.AFTER_CAPTURE_URL ?? "http://127.0.0.1:5174";

mkdirSync(outDir, { recursive: true });

async function countDiffPixels(beforePath, afterPath, threshold = 18) {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const n = await page.evaluate(
    async ({ beforeB64, afterB64, threshold }) => {
      const load = async (b64) => {
        const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob());
        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("no 2d");
        ctx.drawImage(bitmap, 0, 0);
        return ctx.getImageData(0, 0, bitmap.width, bitmap.height).data;
      };
      const [a, b] = [await load(beforeB64), await load(afterB64)];
      let n = 0;
      for (let i = 0; i < a.length; i += 4) {
        const d = Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
        if (d > threshold) n++;
      }
      return n;
    },
    {
      beforeB64: readFileSync(beforePath).toString("base64"),
      afterB64: readFileSync(afterPath).toString("base64"),
      threshold,
    },
  );
  await browser.close();
  return n;
}

async function applyZCutThroughCells(page) {
  await page.evaluate(() => {
    const m = window.__landmarksModel;
    if (!m) return;
    const cut = [...m.get("volume_cut")];
    const z0 = cut[4];
    const z1 = cut[5];
    const span = z1 - z0;
    const mid = (z0 + z1) / 2;
    const thick = Math.max(6, span * 0.04);
    cut[4] = mid - thick / 2;
    cut[5] = mid + thick / 2;
    m.set("volume_cut", cut);
    m.save_changes();
  });
}

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

    await applyZCutThroughCells(page);
    await page.waitForFunction(
      () => document.querySelector(".volume-cube__view")?.getAttribute("data-refining") === "false",
      null,
      { timeout: 300_000 },
    );
    await bar.getByRole("radio", { name: "Side view" }).click({ timeout: 120_000 });
    await page.waitForFunction(
      () => document.querySelector(".volume-cube__view")?.getAttribute("data-pitch") === "0",
      null,
      { timeout: 60_000 },
    );
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
const report = [];
console.log("\n=== MD5 ===");
for (const shot of shots) {
  const before = `${outDir}/issue-117-pyxa-before-${shot}.png`;
  const after = `${outDir}/issue-117-pyxa-after-${shot}.png`;
  const hb = md5(before);
  const ha = md5(after);
  const diffPx = await countDiffPixels(before, after);
  console.log(shot, "before", hb, "after", ha, "diffPx", diffPx);
  report.push({ shot, before: hb, after: ha, diffPx });
  if (shot === "uncut-top" && diffPx > 800) {
    console.warn(`WARN: uncut-top differs from main (diffPx ${diffPx}); check harness dialkit labelAlpha and stacked PR chrome`);
  }
  if (shot === "zcut-side" && diffPx < 200) {
    console.error(`FAIL: zcut-side before/after pixel diff too low (${diffPx})`);
    process.exit(1);
  }
}
writeFileSync(`${outDir}/issue-117-pyxa-paired-report.json`, JSON.stringify(report, null, 2));
console.log("OK: paired captures validated");
