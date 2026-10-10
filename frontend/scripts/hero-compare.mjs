/**
 * A/B WebGL vs v3 reference: side-by-side PNGs + luminance/saturation stats.
 * Prereq: assembled site + v3 frames in V3_DIR (default /opt/cursor/artifacts/v3-frames).
 */
import { chromium } from "@playwright/test";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const SITE = process.env.E2E_SITE_URL ?? "http://127.0.0.1:8765";
const V3_DIR = process.env.V3_FRAMES_DIR ?? "/opt/cursor/artifacts/v3-frames";
const OUT = process.env.HERO_COMPARE_OUT ?? "/opt/cursor/artifacts/hero-ab";
const TIMES = [0.6, 3.0, 8.0];

function statsPng(path) {
  const { PNG } = require("pngjs");
  const data = readFileSync(path);
  const png = PNG.sync.read(data);
  let lum = 0;
  let sat = 0;
  let n = 0;
  for (let i = 0; i < png.data.length; i += 4) {
    const r = png.data[i] / 255;
    const g = png.data[i + 1] / 255;
    const b = png.data[i + 2] / 255;
    const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const mx = Math.max(r, g, b);
    const mn = Math.min(r, g, b);
    const s = mx < 0.001 ? 0 : (mx - mn) / mx;
    lum += l;
    sat += s;
    n++;
  }
  return { meanLuminance: lum / n, meanSaturation: sat / n };
}

async function captureWebgl(page, t) {
  await page.goto(`${SITE}/`, { waitUntil: "networkidle" });
  await page.addStyleTag({
    content: `.hero-veil,.hero-copy,.site-header,.promo-montage{display:none!important}`,
  });
  await page.waitForFunction(() => window.__milumeHeroHandles?.[0]?.setTime);
  await page.evaluate((t) => {
    window.__milumeHeroHandles?.[0]?.setTime(t);
  }, t);
  await page.waitForTimeout(120);
  const canvas = page.locator(".milume-hero__canvas");
  return await canvas.screenshot({ type: "png" });
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({
    headless: true,
    args: ["--enable-webgl", "--ignore-gpu-blocklist"],
  });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  const report = [];

  for (const t of TIMES) {
    const webBuf = await captureWebgl(page, t);
    const webPath = join(OUT, `webgl-t${t}.png`);
    writeFileSync(webPath, webBuf);
    const v3Path = join(V3_DIR, `v3-t${t.toFixed(1)}.png`);
    const v3 = statsPng(v3Path);
    const wg = statsPng(webPath);
    report.push({
      t,
      v3,
      webgl: wg,
      deltaLum: wg.meanLuminance - v3.meanLuminance,
      deltaSat: wg.meanSaturation - v3.meanSaturation,
      webPath,
      v3Path,
    });
  }
  await browser.close();
  writeFileSync(join(OUT, "metrics.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
