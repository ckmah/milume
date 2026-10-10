/**
 * Per-frame JS time (performance.measure) for hero simulate+draw.
 * Reports GPU renderer string; notes when SwiftShader / CPU GL is in use.
 */
import { chromium } from "@playwright/test";

const SITE = process.env.E2E_SITE_URL ?? "http://127.0.0.1:8765";
const SAMPLES = 120;

const launchArgs = [
  "--enable-webgl",
  "--ignore-gpu-blocklist",
  "--use-angle=gl",
  "--disable-software-rasterizer",
];

async function main() {
  let browser;
  let mode = "chromium-angle-gl";
  try {
    browser = await chromium.launch({ headless: true, args: launchArgs });
  } catch {
    browser = await chromium.launch({
      headless: true,
      args: ["--enable-webgl", "--ignore-gpu-blocklist"],
    });
    mode = "chromium-default";
  }

  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto(`${SITE}/`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.__milumeHeroHandles?.[0]?.getLastFrameMs);

  const renderer = await page.evaluate(() => {
    const c = document.querySelector(".milume-hero__canvas");
    const gl = c?.getContext("webgl2") ?? c?.getContext("webgl");
    if (!gl) return "none";
    const dbg = gl.getExtension("WEBGL_DEBUG_RENDERER_INFO");
    return dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : "unknown";
  });

  const cpuRendered =
    /swiftshader|llvmpipe|software/i.test(renderer) || mode === "chromium-default";

  await page.evaluate(() => window.__milumeHeroHandles?.[0]?.setTime(3));
  await page.waitForTimeout(500);

  const samples = await page.evaluate(async (n) => {
    const h = window.__milumeHeroHandles?.[0];
    if (!h?.renderOnce) return [];
    const out = [];
    for (let i = 0; i < n; i++) {
      h.renderOnce();
      out.push({
        total: h.getLastFrameMs?.() ?? 0,
        sim: h.getLastSimMs?.() ?? 0,
        draw: h.getLastDrawMs?.() ?? 0,
      });
      await new Promise((r) => requestAnimationFrame(r));
    }
    return out;
  }, SAMPLES);

  await browser.close();

  const meanOf = (key) => samples.reduce((a, b) => a + b[key], 0) / samples.length;
  const sortedTotal = [...samples].map((s) => s.total).sort((a, b) => a - b);

  const result = {
    mode,
    renderer,
    cpuRendered,
    frameMs: {
      mean: meanOf("total"),
      p95: sortedTotal[Math.floor(sortedTotal.length * 0.95)],
      simMean: meanOf("sim"),
      drawMean: meanOf("draw"),
      samples: samples.length,
    },
  };
  console.log(JSON.stringify(result, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
