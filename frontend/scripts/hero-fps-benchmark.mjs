/**
 * Measure hero rAF fps (10s) at 1280x720 DPR1 and DPR2; CPU when paused.
 * Prereq: assembled site served at E2E_SITE_URL (default http://127.0.0.1:8765).
 */
import { chromium } from "@playwright/test";

const SITE = process.env.E2E_SITE_URL ?? "http://127.0.0.1:8765";

async function measure(page, dpr) {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.addInitScript((dpr) => {
    Object.defineProperty(window, "devicePixelRatio", { get: () => dpr, configurable: true });
  }, dpr);
  await page.goto(`${SITE}/`, { waitUntil: "networkidle" });
  await page.waitForFunction(() => (window.__milumeHeroHandles?.[0]?.getFrameId?.() ?? 0) > 5);
  const fps = await page.evaluate(async () => {
    const start = performance.now();
    const f0 = window.__milumeHeroHandles?.[0]?.getFrameId?.() ?? 0;
    await new Promise((r) => setTimeout(r, 10_000));
    const f1 = window.__milumeHeroHandles?.[0]?.getFrameId?.() ?? 0;
    const sec = (performance.now() - start) / 1000;
    return (f1 - f0) / sec;
  });
  await page.evaluate(() => window.scrollTo(0, window.innerHeight * 1.5));
  await page.waitForFunction(() => window.__milumeHeroHandles?.[0]?.isPaused?.() === true);
  const pausedDelta = await page.evaluate(async () => {
    const f0 = window.__milumeHeroHandles?.[0]?.getFrameId?.() ?? 0;
    await new Promise((r) => setTimeout(r, 2000));
    const f1 = window.__milumeHeroHandles?.[0]?.getFrameId?.() ?? 0;
    return f1 - f0;
  });
  return { dpr, fps, pausedDelta };
}

async function main() {
  const browser = await chromium.launch({
    headless: true,
    args: ["--enable-webgl", "--ignore-gpu-blocklist"],
  });
  const page = await browser.newPage();
  await page.goto(`${SITE}/`, { waitUntil: "domcontentloaded" });
  const renderer = await page.evaluate(() => {
    const c = document.querySelector(".milume-hero__canvas");
    const gl = c?.getContext("webgl2") ?? c?.getContext("webgl");
    if (!gl) return "none";
    const dbg = gl.getExtension("WEBGL_DEBUG_RENDERER_INFO");
    return dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : "unknown";
  });
  console.log("GPU:", renderer);
  const r1 = await measure(await browser.newPage(), 1);
  const r2 = await measure(await browser.newPage(), 2);
  await browser.close();
  console.log(JSON.stringify({ renderer, results: [r1, r2] }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
