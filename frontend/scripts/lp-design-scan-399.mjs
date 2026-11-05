/**
 * Design scan for #399 visual-acceptance frames (impeccable detect + overlap census).
 * Requires landmarks-volume dev server on DESIGN_SCAN_PORT (issue122-2d; colon for rail frame).
 *
 *   DESIGN_SCAN_STRICT=1 node scripts/lp-design-scan-399.mjs
 */
import { execFile } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";

const scriptDir = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = join(scriptDir, "..", "..");
const bin = join(repoRoot, ".cursor/skills/impeccable/scripts/impeccable");
const cwd = join(repoRoot, "frontend");
const port = Number(process.env.DESIGN_SCAN_PORT || 5173);
const outDir = join(cwd, "test-results", "lp-design-scan-399");
mkdirSync(outDir, { recursive: true });

function detectOnPort(cdp) {
  return new Promise((resolve) => {
    execFile(
      bin,
      ["detect", "--json", "--cdp", String(cdp)],
      { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
      (_err, stdout) => resolve(stdout || "[]"),
    );
  });
}

async function waitEngine(page) {
  await page.waitForFunction(
    () => Boolean(window.__landmarksEngine?.getViewState?.()),
    null,
    { timeout: 120_000 },
  );
}

async function hideBanner(page) {
  await page.addStyleTag({
    content: `[data-testid="harness-banner"], .harness-banner, [data-dialkit-panel] { display: none !important; }`,
  });
}

function overlapCensus(page) {
  return page.evaluate(() => {
    const sel = [
      ".landmarks__tool-band",
      ".landmarks__view-cluster",
      ".landmarks__chrome-dock--left",
      ".landmarks__chrome-dock--right",
      ".landmarks__minimap",
      ".landmarks__chrome-depth-rail",
    ];
    const seen = new Set();
    const boxes = sel
      .flatMap((s) => [...document.querySelectorAll(s)])
      .filter((el) => {
        if (seen.has(el)) return false;
        seen.add(el);
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      })
      .map((el) => {
        const r = el.getBoundingClientRect();
        return { x: r.left, y: r.top, w: r.width, h: r.height, tag: el.className?.slice?.(0, 40) ?? "?" };
      });
    let overlaps = 0;
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i];
        const b = boxes[j];
        const ix = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
        const iy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
        if (ix * iy > 4) overlaps++;
      }
    }
    const offscreen = boxes.filter(
      (b) => b.x + b.w < 0 || b.y + b.h < 0 || b.x > innerWidth || b.y > innerHeight,
    ).length;
    return { overlaps, offscreen, boxes: boxes.length };
  });
}

async function openLayersImage(page) {
  const left = page.locator(".landmarks__chrome-dock--left");
  if ((await left.getAttribute("data-collapsed")) === "true") {
    await page.getByRole("button", { name: "Show left panel" }).click();
  }
  await page.getByTestId("panel-section-layers").click();
  await page.getByTestId("layers-image-row").click();
}

async function setTwoChannel(page) {
  await page.evaluate(() => {
    const lm = window.__landmarksModel;
    lm.set("_image_channels", [
      { name: "DAPI", visible: true, contrast_limits: [0, 255], color: "#9a9a9a" },
      { name: "PanCK", visible: true, contrast_limits: [0, 255], color: "#ff8844" },
      { name: "CD45", visible: false, contrast_limits: [0, 165] },
      { name: "Ki67", visible: false, contrast_limits: [0, 152] },
    ]);
    lm.save_changes();
  });
  await page.waitForTimeout(500);
  await openLayersImage(page);
}

const FRAMES = [
  {
    tag: "399-2ch-panel",
    file: "399-after-2ch-panel.png",
    async prep(page) {
      await setTwoChannel(page);
    },
    shot: async (page) => page.locator(".landmarks__chrome-dock--left").screenshot(),
  },
  {
    tag: "399-channel-focus",
    file: "399-after-channel-focus.png",
    async prep(page) {
      await setTwoChannel(page);
      await page.getByTestId("layer-channel-row-CD45").focus();
    },
    shot: async (page) => page.locator(".landmarks__chrome-dock--left").screenshot(),
  },
  {
    tag: "399-18ch-scroll",
    file: "399-after-18ch-scroll.png",
    async prep(page) {
      const names = ["DAPI", "PanCK", "CD45", "Ki67"];
      for (let i = 4; i < 18; i++) names.push(`CH${i - 3}`);
      await page.evaluate((channelNames) => {
        const lm = window.__landmarksModel;
        const rows = channelNames.map((name, i) => ({
          name,
          visible: i === 0,
          contrast_limits: [0, 255],
          constant_zero: false,
        }));
        lm.set("_image_channels", rows);
        lm.save_changes();
      }, names);
      await openLayersImage(page);
      await page.getByTestId("layer-channel-row-DAPI").focus();
      await page.getByTestId("layer-channel-list").evaluate((el) => {
        el.scrollTop = 48;
      });
    },
    shot: async (page) => page.locator(".landmarks__chrome-dock--left").screenshot(),
  },
  {
    tag: "399-seam-crop",
    file: "399-after-seam-crop.png",
    async prep(page) {
      await setTwoChannel(page);
      await page.evaluate(() => {
        const eng = window.__landmarksEngine;
        const lm = window.__landmarksModel;
        const [xMin, xMax] = lm.get("x_bounds");
        const [yMin, yMax] = lm.get("y_bounds");
        const cy = (yMin + yMax) / 2;
        const spanX = Math.max(xMax - xMin, 1);
        const vs = eng.getViewState();
        const { width, height } = eng.getCanvasSize?.() ?? { width: 900, height: 700 };
        const zoom = Math.log2(Math.min(width, height) / (spanX * 0.12));
        eng.setViewState({
          ...vs,
          target: [xMin + spanX * 0.06, cy, vs.target?.[2] ?? 0],
          zoom,
        });
      });
      await page.waitForTimeout(900);
    },
    shot: async (page) => page.locator(".milume-widget.landmarks").first().screenshot(),
  },
];

async function scanFrame(frame, cdp, baseUrl) {
  const out = join(outDir, frame.file);
  const browser = await chromium.launch({
    args: [
      "--use-gl=angle",
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
      `--remote-debugging-port=${cdp}`,
      "--remote-debugging-address=127.0.0.1",
    ],
  });
  try {
    const page = await browser.newPage({
      viewport: { width: 1280, height: 800 },
      deviceScaleFactor: 2,
      colorScheme: "dark",
    });
    await hideBanner(page);
    const q = baseUrl.includes("?") ? "&" : "?";
    await page.goto(`${baseUrl}${q}noDialkit=1`, { waitUntil: "networkidle" });
    await waitEngine(page);
    await frame.prep(page);
    await hideBanner(page);
    await page.waitForTimeout(400);
    await frame.shot(page).then((buf) => writeFileSync(out, buf));
    const census = await overlapCensus(page);
    const raw = await detectOnPort(cdp);
    writeFileSync(out.replace(/\.png$/, ".json"), raw);
    writeFileSync(out.replace(/\.png$/, ".census.json"), JSON.stringify(census));
    const findings = JSON.parse(raw || "[]");
    return {
      tag: frame.tag,
      out,
      primary: findings.filter((x) => !x.advisory).length,
      advisory: findings.filter((x) => x.advisory).length,
      overlaps: census.overlaps,
      offscreen: census.offscreen,
    };
  } finally {
    await browser.close();
  }
}

async function main() {
  const baseUrl = `http://127.0.0.1:${port}/`;
  let totalPrimary = 0;
  let totalAdvisory = 0;
  let totalOverlaps = 0;
  for (let i = 0; i < FRAMES.length; i++) {
    const summary = await scanFrame(FRAMES[i], 9360 + i, baseUrl);
    console.log(JSON.stringify(summary));
    totalPrimary += summary.primary;
    totalAdvisory += summary.advisory;
    totalOverlaps += summary.overlaps;
  }
  console.log(
    `lp-design-scan-399: primary=${totalPrimary} advisory=${totalAdvisory} overlap_pairs=${totalOverlaps}`,
  );
  if (process.env.DESIGN_SCAN_STRICT === "1" && (totalPrimary > 0 || totalAdvisory > 0 || totalOverlaps > 0)) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
