/**
 * Side-by-side designer reference vs live landing hero; reports mean absolute RGB diff.
 */
import { chromium } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const SITE = process.env.E2E_SITE_URL ?? "http://127.0.0.1:8765";
const REF_URL = process.env.HERO_REF_URL ?? `${SITE}/hero/reference/index.html`;
const OUT = process.env.HERO_AB_OUT ?? "/opt/cursor/artifacts/hero-designer-ab";
const TIMES = [1.5, 9.7];
const MIN_BRIGHT = 50;

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
  const py = spawnSync(
    "python3",
    [
      "-c",
      "import sys; from PIL import Image; w,h=int(sys.argv[1]),int(sys.argv[2]); out=sys.argv[3]; raw=sys.stdin.buffer.read(); Image.frombytes('RGB',(w,h),raw).save(out)",
      String(w),
      String(h),
      join(OUT, "_tmp.png"),
    ],
    { input: rgb },
  );
  if (py.status !== 0) throw new Error(py.stderr?.toString() || "png encode failed");
  return readFileSync(join(OUT, "_tmp.png"));
}

async function readWebglCanvas(page, selector) {
  const stats = await page.evaluate((sel) => {
    const c = document.querySelector(sel);
    const gl = c?.getContext("webgl2") ?? c?.getContext("webgl");
    if (!c || !gl) throw new Error(`no canvas ${sel}`);
    const width = c.width;
    const height = c.height;
    const buf = new Uint8Array(width * height * 4);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    let bright = 0;
    for (let i = 0; i < buf.length; i += 4) {
      if (buf[i] + buf[i + 1] + buf[i + 2] > 40) bright++;
    }
    return { w: width, h: height, px: Array.from(buf), bright };
  }, selector);
  if (stats.bright < MIN_BRIGHT) {
    throw new Error(`canvas ${selector} looks blank (bright=${stats.bright})`);
  }
  return { png: rgbaToPngBuffer(stats.w, stats.h, stats.px), bright: stats.bright };
}

function stitchSideBySide(leftPng, rightPng, outPath) {
  const py = spawnSync(
    "python3",
    [
      "-c",
      `from PIL import Image
import sys
a,b,out=sys.argv[1],sys.argv[2],sys.argv[3]
L,R=Image.open(a).convert('RGB'),Image.open(b).convert('RGB')
assert L.size==R.size
W,H=L.size
combo=Image.new('RGB',(W*2,H))
combo.paste(L,(0,0))
combo.paste(R,(W,0))
combo.save(out)`,
      leftPng,
      rightPng,
      outPath,
    ],
  );
  if (py.status !== 0) throw new Error(py.stderr?.toString() || "stitch failed");
}

function meanAbsDiff(aPng, bPng) {
  const py = spawnSync(
    "python3",
    [
      "-c",
      `from PIL import Image
import numpy as np, json, sys
a,b=sys.argv[1],sys.argv[2]
A=np.asarray(Image.open(a).convert('RGB'),dtype=np.float32)
B=np.asarray(Image.open(b).convert('RGB'),dtype=np.float32)
print(json.dumps({'meanAbsDiff': float(np.mean(np.abs(A-B)))}))`,
      aPng,
      bPng,
    ],
  );
  if (py.status !== 0) throw new Error(py.stderr?.toString() || "diff failed");
  return JSON.parse(py.stdout.toString());
}

function assertAbHalvesNonBlank(comboPath, minBright = MIN_BRIGHT) {
  const py = spawnSync(
    "python3",
    [
      "-c",
      `from PIL import Image
import numpy as np, json, sys
path,min_b=sys.argv[1],int(sys.argv[2])
im=np.asarray(Image.open(path).convert('RGB'))
W,H=im.shape[1],im.shape[0]
half=W//2
def bright_count(slice_):
  s=slice_[:,:,0].astype(np.int32)+slice_[:,:,1].astype(np.int32)+slice_[:,:,2].astype(np.int32)
  return int(np.sum(s>40))
L=bright_count(im[:,:half,:])
R=bright_count(im[:,half:,:])
out={'leftBright':L,'rightBright':R}
if L<min_b or R<min_b:
  raise SystemExit(json.dumps({'error':'blank ab half','data':out}))
print(json.dumps(out))`,
      comboPath,
      String(minBright),
    ],
  );
  if (py.status !== 0) {
    throw new Error(py.stderr?.toString() || py.stdout?.toString() || "ab half check failed");
  }
  return JSON.parse(py.stdout.toString());
}

async function captureLive(page, t) {
  await page.goto(`${SITE}/`, { waitUntil: "networkidle" });
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.addStyleTag({
    content: `.hero-veil,.hero-copy,.site-header,.hero-media{display:none!important}`,
  });
  await page.waitForFunction(() => window.__milumeHeroHandles?.[0]?.setTime);
  await page.evaluate(async (time) => {
    const h = window.__milumeHeroHandles?.[0];
    h?.setTime(time);
    h?.renderOnce();
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  }, t);
  return readWebglCanvas(page, ".milume-hero__canvas");
}

async function captureRef(page, t) {
  await page.goto(REF_URL, { waitUntil: "networkidle" });
  await page.waitForFunction(() => window.__heroRefReady === true);
  await page.evaluate(async (time) => {
    window.__heroRefDraw(time);
    await window.__heroRefWaitFrame();
  }, t);
  await page.waitForFunction(() => (window.__heroRefLastN ?? 0) > 0);
  const bright = await page.evaluate(() => window.__heroRefCanvasBrightCount?.() ?? 0);
  if (bright < MIN_BRIGHT) {
    throw new Error(`reference canvas blank after draw (bright=${bright})`);
  }
  return readWebglCanvas(page, "#c");
}

async function recordLoopVideo(browser, outDir) {
  const context = await browser.newContext({
    viewport: { width: 1600, height: 900 },
    recordVideo: { dir: outDir, size: { width: 1600, height: 900 } },
  });
  const page = await context.newPage();
  await page.goto(`${SITE}/`, { waitUntil: "networkidle" });
  await page.addStyleTag({
    content: `.hero-veil,.hero-copy,.site-header,.hero-media{display:none!important}`,
  });
  await page.waitForFunction(() => window.__milumeHeroHandles?.[0]?.resume);
  await page.evaluate(() => window.__milumeHeroHandles?.[0]?.resume());
  await page.waitForTimeout(10_500);
  await page.close();
  await context.close();
  const { readdirSync, renameSync } = await import("node:fs");
  const webm = readdirSync(outDir).find((f) => f.endsWith(".webm"));
  const dest = join(outDir, "hero-loop-10s.webm");
  if (webm) renameSync(join(outDir, webm), dest);
  return dest;
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({
    headless: true,
    args: ["--enable-webgl", "--ignore-gpu-blocklist"],
  });
  const report = { times: {}, meanAbsDiff: {} };

  for (const t of TIMES) {
    const refPage = await browser.newPage({ viewport: { width: 1600, height: 900 } });
    const livePage = await browser.newPage({ viewport: { width: 1600, height: 900 } });
    const refPng = join(OUT, `ref-t${t}.png`);
    const livePng = join(OUT, `live-t${t}.png`);
    const comboPng = join(OUT, `ab-t${t}.png`);
    const ref = await captureRef(refPage, t);
    const live = await captureLive(livePage, t);
    writeFileSync(refPng, ref.png);
    writeFileSync(livePng, live.png);
    stitchSideBySide(refPng, livePng, comboPng);
    const halves = assertAbHalvesNonBlank(comboPng);
    const diff = meanAbsDiff(refPng, livePng);
    report.times[t] = {
      refPng,
      livePng,
      comboPng,
      refBright: ref.bright,
      liveBright: live.bright,
      abHalves: halves,
      ...diff,
    };
    report.meanAbsDiff[t] = diff.meanAbsDiff;
    await refPage.close();
    await livePage.close();
  }

  report.loopVideo = await recordLoopVideo(browser, OUT);
  await browser.close();

  const reportPath = join(OUT, "report.json");
  writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
