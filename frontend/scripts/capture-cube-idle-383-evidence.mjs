/**
 * Issue #383 PR evidence: screenshots + screen recording with render overlay.
 * Usage: node scripts/capture-cube-idle-383-evidence.mjs
 * Requires dev:landmarks-volume on :5173 (restart after harness changes).
 *
 * Query: ?window=100&cubeRenderOverlay=1&noDialkit=1 — shipped mesh opacity (DEFAULT_RENDER.cellAlpha), no DialKit chrome.
 */
import { copyFileSync, mkdirSync } from "node:fs";
import { chromium } from "@playwright/test";

const out = process.env.BENCH_ARTIFACT_DIR ?? "/opt/cursor/artifacts";
const videoOut = `${out}/cube-idle-383-demo.webm`;
const stillOut = `${out}/cube-383-settled-after.png`;
mkdirSync(out, { recursive: true });

const CURSOR_INIT = () => {
  if (document.getElementById("__evidence-cursor")) return;
  const el = document.createElement("div");
  el.id = "__evidence-cursor";
  el.setAttribute("aria-hidden", "true");
  el.style.cssText =
    "position:fixed;left:0;top:0;width:0;height:0;z-index:2147483647;pointer-events:none;";
  const dot = document.createElement("div");
  dot.style.cssText =
    "position:absolute;left:-10px;top:-10px;width:20px;height:20px;border-radius:50%;border:2px solid #fff;box-shadow:0 0 0 1px #000,0 2px 8px rgb(0 0 0 / 45%);background:rgb(255 255 255 / 15%);";
  const tail = document.createElement("div");
  tail.style.cssText =
    "position:absolute;left:-2px;top:8px;width:4px;height:14px;border-radius:2px;background:#fff;box-shadow:0 0 0 1px #000;transform:rotate(-35deg);transform-origin:top center;";
  el.append(dot, tail);
  document.documentElement.append(el);
  const move = (x, y) => {
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
  };
  document.addEventListener("mousemove", (e) => move(e.clientX, e.clientY), true);
  document.addEventListener("pointermove", (e) => move(e.clientX, e.clientY), true);
};

async function moveSlow(page, x, y, steps = 24) {
  const from = await page.evaluate(() => {
    const c = document.getElementById("__evidence-cursor");
    if (!c) return { x: 700, y: 450 };
    const left = Number.parseFloat(c.style.left) || 700;
    const top = Number.parseFloat(c.style.top) || 450;
    return { x: left, y: top };
  });
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const cx = from.x + (x - from.x) * t;
    const cy = from.y + (y - from.y) * t;
    await page.mouse.move(cx, cy);
    await page.waitForTimeout(40);
  }
}

async function boxCenter(page, locator) {
  const box = await locator.boundingBox();
  if (!box) throw new Error("missing box for locator");
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

const browser = await chromium.launch({
  headless: false,
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const context = await browser.newContext({
  viewport: { width: 1400, height: 900 },
  recordVideo: { dir: out, size: { width: 1400, height: 900 } },
});
const page = await context.newPage();
await page.addInitScript(CURSOR_INIT);

await page.goto("http://127.0.0.1:5173/?window=100&cubeRenderOverlay=1&noDialkit=1", {
  waitUntil: "networkidle",
});
await page.waitForFunction(() => Boolean(window.__landmarksEngine?.getViewState?.()));

const widget = page.locator(".landmarks").first();
await widget.waitFor();

await page.getByRole("radio", { name: "Inspect", exact: true }).click();
const mapCenter = await page.evaluate(() => {
  const c = document.querySelector("canvas.landmarks__webgl").getBoundingClientRect();
  return { x: c.x + c.width / 2, y: c.y + c.height / 2 };
});
await page.mouse.move(mapCenter.x, mapCenter.y);
await page.mouse.click(mapCenter.x, mapCenter.y);
await page.getByRole("dialog", { name: "Cube" }).waitFor();

for (const layer of ["layer-toggle-labels", "layer-toggle-image"]) {
  const el = page.getByTestId(layer);
  if ((await el.getAttribute("aria-pressed")) !== "true") await el.click();
}
await page.waitForFunction(
  () => document.querySelector(".volume-cube__view")?.getAttribute("data-settled") === "true",
  null,
  { timeout: 120_000 },
);
await page.waitForTimeout(500);

await page.evaluate(() => {
  window.__volumeCubeRenderCount = 0;
});
await page.waitForTimeout(3500);
const idleRenders = await page.evaluate(() => window.__volumeCubeRenderCount ?? 0);

await widget.screenshot({ path: stillOut });

await page.evaluate(() => {
  window.__volumeCubeRenderCount = 0;
});
const imageBtn = page.getByTestId("layer-toggle-image");
const btnCenter = await boxCenter(page, imageBtn);
await moveSlow(page, btnCenter.x, btnCenter.y, 30);
await page.waitForTimeout(400);
const t0 = Date.now();
await page.mouse.click(btnCenter.x, btnCenter.y, { button: "right" });
const adjust = page.getByTestId("adjust-image");
await adjust.waitFor({ state: "visible", timeout: 30_000 });
await page.waitForTimeout(1800);
const menuMs = Date.now() - t0;
const menuRenders = await page.evaluate(() => window.__volumeCubeRenderCount ?? 0);

await adjust.getByRole("slider", { name: "Image gamma" }).click({ force: true });
await page.keyboard.press("ArrowRight");
await page.keyboard.press("ArrowRight");
await page.waitForTimeout(1200);
const gammaRenders = await page.evaluate(() => window.__volumeCubeRenderCount ?? 0);

console.log(JSON.stringify({ idleRenders, menuMs, menuRenders, gammaRenders, stillOut, videoOut }, null, 2));

const video = page.video();
await page.close();
await context.close();
if (video) {
  const raw = await video.path();
  copyFileSync(raw, videoOut);
  console.log("video", videoOut, "(from", raw, ")");
}
await browser.close();
