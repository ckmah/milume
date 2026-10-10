/**
 * Pyxa small before (origin/main worktree) vs after (PR branch) with shared zoom.
 * Usage: node scripts/capture-issue-117-pyxa-paired.mjs (see PR #117 Verification)
 * Env: MAIN_CAPTURE_URL (default http://127.0.0.1:5175), AFTER_CAPTURE_URL (5174)
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, unlinkSync, existsSync, mkdirSync } from "node:fs";
import { chromium } from "@playwright/test";

const outDir = "/opt/cursor/artifacts";
const zoomFile = `${outDir}/issue-117-pyxa-iso-zoom.txt`;
const mainUrl = process.env.MAIN_CAPTURE_URL ?? "http://127.0.0.1:5175";
const afterUrl = process.env.AFTER_CAPTURE_URL ?? "http://127.0.0.1:5174";

mkdirSync(outDir, { recursive: true });
if (existsSync(zoomFile)) unlinkSync(zoomFile);

async function captureSet(base, tag) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const paths = {};
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
    await page.waitForFunction(
      () => {
        const el = document.querySelector(".volume-cube__view");
        return (
          el?.getAttribute("data-labels") === "on" &&
          el?.getAttribute("data-image") === "on" &&
          el?.getAttribute("data-coloring") === "groups"
        );
      },
      null,
      { timeout: 120_000 },
    );
    const bar = page.getByTestId("context-inspect-toolbar");
    for (const preset of ["top", "iso", "side"]) {
      const name =
        preset === "top" ? "Top view" : preset === "iso" ? "Oblique view" : "Side view";
      await bar.getByRole("radio", { name }).click();
      await page.waitForTimeout(800);
      if (preset === "iso") {
        const vb = await view.boundingBox();
        if (!vb) throw new Error("no cube view box");
        const cx = vb.x + vb.width * 0.5;
        const cy = vb.y + vb.height * 0.55;
        await page.mouse.move(cx, cy);
        const readZoom = async () => Number(await view.getAttribute("data-zoom"));
        const target = existsSync(zoomFile) ? Number(readFileSync(zoomFile, "utf8")) : null;
        if (target != null && Number.isFinite(target)) {
          for (let n = 0; n < 28; n++) {
            const z = await readZoom();
            if (!Number.isFinite(z)) break;
            if (Math.abs(z - target) < 0.04) break;
            await page.mouse.wheel(0, z < target ? -120 : 120);
            await page.waitForTimeout(60);
          }
        } else {
          for (let w = 0; w < 6; w++) {
            await page.mouse.wheel(0, 140);
            await page.waitForTimeout(80);
          }
          const z = await readZoom();
          if (z) writeFileSync(zoomFile, String(z));
        }
        await page.waitForTimeout(600);
      }
      const path = `${outDir}/issue-117-pyxa-${tag}-${preset}.png`;
      await view.screenshot({ path });
      paths[preset] = path;
      console.log("wrote", path, "from", base);
    }
  } finally {
    await browser.close();
  }
  return paths;
}

function md5(path) {
  return createHash("md5").update(readFileSync(path)).digest("hex");
}

async function diffPixels(beforePath, afterPath) {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  try {
    const b64a = readFileSync(beforePath).toString("base64");
    const b64b = readFileSync(afterPath).toString("base64");
    return await page.evaluate(
      async ({ a, b }) => {
        const load = async (png) => {
          const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${png}`)).blob());
          const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
          const ctx = canvas.getContext("2d");
          ctx.drawImage(bitmap, 0, 0);
          return ctx.getImageData(0, 0, bitmap.width, bitmap.height).data;
        };
        const [da, db] = [await load(a), await load(b)];
        let n = 0;
        for (let i = 0; i < da.length; i += 4) {
          const d =
            Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2]);
          if (d > 24) n++;
        }
        return n;
      },
      { a: b64a, b: b64b },
    );
  } finally {
    await browser.close();
  }
}

console.log("=== BEFORE (main worktree)", mainUrl);
await captureSet(mainUrl, "before");
console.log("=== AFTER (PR branch)", afterUrl);
await captureSet(afterUrl, "after");

const files = ["top", "iso"].flatMap((p) => [
  `${outDir}/issue-117-pyxa-before-${p}.png`,
  `${outDir}/issue-117-pyxa-after-${p}.png`,
]);
const hashes = Object.fromEntries(files.map((f) => [f, md5(f)]));
console.log("\n=== MD5 ===");
for (const [f, h] of Object.entries(hashes)) console.log(h, f);

for (const preset of ["top", "iso"]) {
  const before = `${outDir}/issue-117-pyxa-before-${preset}.png`;
  const after = `${outDir}/issue-117-pyxa-after-${preset}.png`;
  if (hashes[before] === hashes[after]) {
    console.error(`FAIL: ${preset} before/after identical md5 ${hashes[before]}`);
    process.exit(1);
  }
  const changed = await diffPixels(before, after);
  console.log(`${preset} pixel diff (>24):`, changed);
  if (changed < 200) {
    console.error(`FAIL: ${preset} insufficient visible diff (${changed} px)`);
    process.exit(1);
  }
}
console.log("OK: before/after differ");
