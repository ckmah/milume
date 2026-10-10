/**
 * A/B WebGL vs v3 reference: side-by-side PNGs + luminance/saturation stats.
 * WebGL frames use readPixels (Playwright canvas screenshots miss GL updates in headless).
 */
import { chromium } from "@playwright/test";
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const SITE = process.env.E2E_SITE_URL ?? "http://127.0.0.1:8765";
const V3_DIR = process.env.V3_FRAMES_DIR ?? "/opt/cursor/artifacts/v3-frames";
const OUT = process.env.HERO_COMPARE_OUT ?? "/opt/cursor/artifacts/hero-ab";
const TIMES = [0.6, 3.0, 8.0];

function statsPng(path) {
  const py = spawnSync("python3", [
    "-c",
    `from PIL import Image; import json,sys; im=Image.open(sys.argv[1]).convert('RGB'); px=im.getdata(); lum=sat=n=0
for r,g,b in px:
 r,g,b=r/255,g/255,b/255; l=0.2126*r+0.7152*g+0.0722*b; mx=max(r,g,b); mn=min(r,g,b); s=0 if mx<1e-3 else (mx-mn)/mx; lum+=l; sat+=s; n+=1
print(json.dumps({'meanLuminance':lum/n,'meanSaturation':sat/n}))`,
    path,
  ]);
  if (py.status !== 0) throw new Error(py.stderr?.toString() || "stats failed");
  return JSON.parse(py.stdout.toString());
}

function webglOutName(t) {
  return t === 0.6 ? "webgl-t0.6.png" : `webgl-t${t}.png`;
}

function rgbaToPngBuffer(w, h, px) {
  const rgb = Buffer.alloc(w * h * 3);
  for (let y = 0; y < h; y++) {
    const srcRow = (h - 1 - y) * w * 4;
    for (let x = 0; x < w; x++) {
      const si = srcRow + x * 4;
      const di = (y * w + x) * 3;
      rgb[di] = px[si];
      rgb[di + 1] = px[si + 1];
      rgb[di + 2] = px[si + 2];
    }
  }
  const dir = mkdtempSync(join(tmpdir(), "hero-cap-"));
  const out = join(dir, "frame.png");
  const py = spawnSync(
    "python3",
    [
      "-c",
      "import sys; from PIL import Image; w,h=int(sys.argv[1]),int(sys.argv[2]); out=sys.argv[3]; raw=sys.stdin.buffer.read(); Image.frombytes('RGB',(w,h),raw).save(out)",
      String(w),
      String(h),
      out,
    ],
    { input: rgb },
  );
  if (py.status !== 0) throw new Error(py.stderr?.toString() || "png encode failed");
  const buf = readFileSync(out);
  rmSync(dir, { recursive: true, force: true });
  return buf;
}

async function captureWebglReadPixels(page, t) {
  await page.goto(`${SITE}/`, { waitUntil: "networkidle" });
  await page.addStyleTag({
    content: `.hero-veil,.hero-copy,.site-header,.promo-montage{display:none!important}`,
  });
  await page.waitForFunction(() => window.__milumeHeroHandles?.[0]?.setTime);
  await page.evaluate((time) => {
    const h = window.__milumeHeroHandles?.[0];
    h?.setTime(time);
    h?.renderOnce();
  }, t);
  await page.waitForTimeout(80);

  const { w, h, px } = await page.evaluate(() => {
    const c = document.querySelector(".milume-hero__canvas");
    const gl = c?.getContext("webgl2");
    if (!c || !gl) throw new Error("no webgl2 canvas");
    const width = c.width;
    const height = c.height;
    const buf = new Uint8Array(width * height * 4);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    return { w: width, h: height, px: Array.from(buf) };
  });

  return rgbaToPngBuffer(w, h, px);
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
    const webBuf = await captureWebglReadPixels(page, t);
    const webPath = join(OUT, webglOutName(t));
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
