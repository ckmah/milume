/**
 * Pyxa small before/after on one Vite port: checkout main vs PR HEAD between captures.
 * Usage: node scripts/capture-issue-117-pyxa-same-server.mjs
 * Env: MILUME_VOLUME_PROFILE=small (vite must use small fixture + zarr).
 */
import { createHash } from "node:crypto";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { chromium } from "@playwright/test";

const outDir = process.env.CAPTURE_OUT ?? "/opt/cursor/artifacts";
const storeDir = process.env.PR120_STORE ?? "/cursor/stores/self/pr120";
const port = Number(process.env.CAPTURE_PORT ?? 5173);
const base = `http://127.0.0.1:${port}`;
const root = new URL("../..", import.meta.url).pathname;
const frontend = `${root}/frontend`;
const session = "volume-vite-pyxa-same";

mkdirSync(outDir, { recursive: true });
mkdirSync(storeDir, { recursive: true });

function sh(cmd, opts = {}) {
  const r = spawnSync(cmd, { shell: true, encoding: "utf8", ...opts });
  if (r.status !== 0) throw new Error(r.stderr || r.stdout || `failed: ${cmd}`);
  return (r.stdout || "").trim();
}

function restartVite() {
  sh(`tmux -f /exec-daemon/tmux.portal.conf kill-session -t ${session} 2>/dev/null || true`);
  sh(
    `tmux -f /exec-daemon/tmux.portal.conf new-session -d -s ${session} -c ${frontend} -- bash -lc ` +
      `"npx cross-env DEV_WIDGET=landmarks-volume MILUME_VOLUME_PROFILE=small npx vite --host 127.0.0.1 --port ${port}"`,
  );
  for (let i = 0; i < 90; i++) {
    try {
      sh(`curl -sf ${base}/ >/dev/null`);
      return;
    } catch {
      spawnSync("sleep", ["1"]);
    }
  }
  throw new Error("vite did not start");
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

async function captureSet(tag) {
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
    const bar = page.getByTestId("context-inspect-toolbar");

    await bar.getByRole("radio", { name: "Top view" }).click();
    await page.waitForTimeout(800);
    paths.uncutTop = `${outDir}/issue-117-pyxa-${tag}-uncut-top.png`;
    await view.screenshot({ path: paths.uncutTop });
    console.log("wrote", paths.uncutTop, tag);

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
    paths.zcutSide = `${outDir}/issue-117-pyxa-${tag}-zcut-side.png`;
    await view.screenshot({ path: paths.zcutSide });
    console.log("wrote", paths.zcutSide, tag);
  } finally {
    await browser.close();
  }
  return paths;
}

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
      const [a, b] = await Promise.all([load(beforeB64), load(afterB64)]);
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

async function writeHeatmap(beforePath, afterPath, outPath, threshold = 18) {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const pngB64 = await page.evaluate(
    async ({ beforeB64, afterB64, threshold }) => {
      const load = async (b64) => {
        const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob());
        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("no 2d");
        ctx.drawImage(bitmap, 0, 0);
        return { data: ctx.getImageData(0, 0, bitmap.width, bitmap.height).data, w: bitmap.width, h: bitmap.height };
      };
      const [a, b] = await Promise.all([load(beforeB64), load(afterB64)]);
      const w = a.w;
      const h = a.h;
      const out = new Uint8ClampedArray(w * h * 4);
      for (let i = 0; i < a.data.length; i += 4) {
        const d =
          Math.abs(a.data[i] - b.data[i]) +
          Math.abs(a.data[i + 1] - b.data[i + 1]) +
          Math.abs(a.data[i + 2] - b.data[i + 2]);
        const px = i;
        if (d > threshold) {
          out[px] = 255;
          out[px + 1] = 40;
          out[px + 2] = 40;
          out[px + 3] = 220;
        } else {
          out[px] = 30;
          out[px + 1] = 30;
          out[px + 2] = 30;
          out[px + 3] = 180;
        }
      }
      const canvas = new OffscreenCanvas(w, h);
      const ctx = canvas.getContext("2d");
      ctx.putImageData(new ImageData(out, w, h), 0, 0);
      const blob = await canvas.convertToBlob({ type: "image/png" });
      const buf = await blob.arrayBuffer();
      let binary = "";
      const bytes = new Uint8Array(buf);
      for (let j = 0; j < bytes.length; j++) binary += String.fromCharCode(bytes[j]);
      return btoa(binary);
    },
    {
      beforeB64: readFileSync(beforePath).toString("base64"),
      afterB64: readFileSync(afterPath).toString("base64"),
      threshold,
    },
  );
  await browser.close();
  writeFileSync(outPath, Buffer.from(pngB64, "base64"));
}

function md5(path) {
  return createHash("md5").update(readFileSync(path)).digest("hex");
}

const branch = sh(`git -C ${root} rev-parse --abbrev-ref HEAD`);
const prSha = sh(`git -C ${root} rev-parse HEAD`);
const mainSha = sh(`git -C ${root} rev-parse ${process.env.BENCH_MAIN_REF || "origin/main"}`);

console.log("=== BEFORE (origin/main)", mainSha);
sh(`git -C ${root} checkout --quiet ${mainSha}`);
restartVite();
spawnSync("sleep", ["3"]);
await captureSet("before");

console.log("=== AFTER (PR HEAD)", prSha);
sh(`git -C ${root} checkout --quiet ${prSha}`);
restartVite();
spawnSync("sleep", ["3"]);
await captureSet("after");

sh(`git -C ${root} checkout --quiet ${branch}`);

const shots = ["uncut-top", "zcut-side"];
const report = { mainSha, prSha, shots: {} };
console.log("\n=== MD5 / diff ===");
for (const shot of shots) {
  const before = `${outDir}/issue-117-pyxa-before-${shot}.png`;
  const after = `${outDir}/issue-117-pyxa-after-${shot}.png`;
  const heat = `${outDir}/issue-117-pyxa-${shot}-diff-heatmap.png`;
  const hb = md5(before);
  const ha = md5(after);
  const diffPx = await countDiffPixels(before, after);
  await writeHeatmap(before, after, heat);
  console.log(shot, "before", hb, "after", ha, "diffPx", diffPx, "heatmap", heat);
  report.shots[shot] = { before: hb, after: ha, diffPx, heatmap: heat };
  if (shot === "uncut-top" && diffPx > 800) {
    console.warn(`WARN: uncut-top differs from main (diffPx ${diffPx})`);
  }
  if (shot === "zcut-side" && diffPx < 200) {
    console.error(`FAIL: zcut-side before/after pixel diff too low (${diffPx})`);
    process.exit(1);
  }
}

const copyNames = {
  "uncut-top": { before: "issue-117-pyxa-before-uncut-top.png", after: "issue-117-pyxa-after-uncut-top.png" },
  "zcut-side": { before: "issue-117-pyxa-before-zcut-side.png", after: "issue-117-pyxa-after-zcut-side.png" },
};
for (const shot of shots) {
  const b = `${outDir}/issue-117-pyxa-before-${shot}.png`;
  const a = `${outDir}/issue-117-pyxa-after-${shot}.png`;
  sh(`cp ${b} ${storeDir}/${copyNames[shot].before}`);
  sh(`cp ${a} ${storeDir}/${copyNames[shot].after}`);
}
sh(`cp ${outDir}/issue-117-pyxa-uncut-top-diff-heatmap.png ${storeDir}/issue-117-pyxa-uncut-top-diff-heatmap.png 2>/dev/null || true`);

writeFileSync(`${outDir}/issue-117-pyxa-same-server-report.json`, JSON.stringify(report, null, 2));
console.log("OK: same-server paired captures", storeDir);
