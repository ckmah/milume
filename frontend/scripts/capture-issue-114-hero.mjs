/**
 * Colon A2 README hero: Clarence-drawn landmarks (hero-colon-landmarks.json).
 * No selection focus, no Inspect preview. Light and dark at deviceScaleFactor 2.
 *
 * Harness: MILUME_VOLUME_PROFILE=colon DEV_WIDGET=landmarks-volume on :5176.
 * After rebasing onto main, restart that dev server and clear
 * `frontend/node_modules/.vite/landmarks-volume-colon` so Vite reloads
 * `milume/static/landmarks.js` (buffer tint fix from #143).
 */
import { copyFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { inflateSync } from "node:zlib";
import { chromium } from "@playwright/test";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const LANDMARKS = JSON.parse(
  readFileSync(join(SCRIPT_DIR, "hero-colon-landmarks.json"), "utf8"),
);

const ART_LIGHT = "/opt/cursor/artifacts/issue-114-hero-light.png";
const ART_DARK = "/opt/cursor/artifacts/issue-114-hero-dark.png";
const STORE_DIR = "/cursor/stores/self/pr133";
const REPO_LIGHT = "/workspace/assets/landmarks_widget_light.png";
const REPO_DARK = "/workspace/assets/landmarks_widget_dark.png";
const VIEWPORT = { width: 1600, height: 900 };
const DPR = 2;

const HIDE_CHROME = `
  .dialkit-root, [class*='dialkit'] { display: none !important; }
  .landmarks__chrome-minimap { display: none !important; }
`;

async function applyTheme(page, theme) {
  await page.evaluate((theme) => {
    const root = document.documentElement;
    root.classList.remove("light", "dark", "dark-theme", "light-theme");
    if (theme === "dark") {
      root.classList.add("dark", "dark-theme");
    } else {
      root.classList.add("light", "light-theme");
    }
    window.localStorage.setItem("milume-harness-theme", theme);
    const wrap = document.querySelector("#root > div");
    if (wrap) {
      wrap.classList.remove("dark", "light", "bg-neutral-950", "bg-neutral-100", "text-neutral-100", "text-neutral-900");
      if (theme === "dark") {
        wrap.classList.add("dark", "bg-neutral-950", "text-neutral-100");
      } else {
        wrap.classList.add("light", "bg-neutral-100", "text-neutral-900");
      }
    }
  }, theme);
  await page.waitForTimeout(400);
}

async function harnessUrl() {
  for (const port of [5176, 5173, 5174, 5175]) {
    try {
      const res = await fetch(`http://localhost:${port}/fixture.json`);
      if (!res.ok) continue;
      const j = await res.json();
      const cl = j.volume?.contrast_limits;
      if (j.volume?.image_url?.includes("colon_a2") && cl?.[0] === 40 && cl?.[1] === 255) {
        return `http://localhost:${port}/`;
      }
    } catch {
      /* try next port */
    }
  }
  throw new Error("no colon harness with contrast_limits [40,255]");
}

async function openPanels(page) {
  for (const name of ["Show left panel", "Show right panel"]) {
    const btn = page.getByRole("button", { name });
    if (await btn.isVisible().catch(() => false)) await btn.click();
  }
}

function cssColorToHex(css) {
  const t = String(css).trim().toLowerCase();
  if (t.startsWith("#")) return t;
  const m = t.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (!m) return t;
  const hex = (n) => Number(n).toString(16).padStart(2, "0");
  return `#${hex(m[1])}${hex(m[2])}${hex(m[3])}`;
}

const MINT_NEIGH_HEX = "#b3f2e8";
const PINK_STROKE_HEX = "#ff2d95";

function rgbFromHex(hex) {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function hueDegrees(r, g, b) {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  if (max === min) return 0;
  const d = max - min;
  let h;
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) * 60;
  else if (max === gn) h = ((bn - rn) / d + 2) * 60;
  else h = ((rn - gn) / d + 4) * 60;
  return (h + 360) % 360;
}

function hueDelta(a, b) {
  return Math.min(Math.abs(a - b), 360 - Math.abs(a - b));
}

async function panelSwatchHex(page, label) {
  const row = page.locator(".landmarks-layer-row").filter({
    has: page.getByText(label, { exact: true }),
  });
  const swatch = row.locator(".landmarks-layer-swatch").first();
  const bg = await swatch.evaluate((el) => getComputedStyle(el).backgroundColor);
  return cssColorToHex(bg);
}

/** Fit tissue, pan/zoom toward landmark centroid without cropping the data bounds. */
async function prepareHeroView(page) {
  await page.evaluate(() => {
    const m = window.__landmarksModel;
    m.set("selections", []);
    m.set("selected_kind", "");
    m.set("selected_index", -1);
    m.set("mode", "navigate");
    m.set("inspect_cx", null);
    m.set("inspect_cy", null);
    m.set("type_neighborhoods", []);
    m.save_changes();
  });
  const nav = page.getByRole("radio", { name: "Navigate", exact: true });
  if (await nav.isVisible().catch(() => false)) await nav.click();

  await page.evaluate(() => {
    window.__landmarksEngine.resetZoom();
  });
  await page.waitForTimeout(650);

  await page.evaluate(() => {
    const engine = window.__landmarksEngine;
    const model = window.__landmarksModel;
    const [xMin, xMax] = model.get("x_bounds");
    const [yMin, yMax] = model.get("y_bounds");
    const marginFrac = 0.055;

    const dataFits = (vb) => {
      if (!vb) return false;
      const spanX = Math.max(xMax - xMin, 1);
      const spanY = Math.max(yMax - yMin, 1);
      const mx = spanX * marginFrac;
      const my = spanY * marginFrac;
      return (
        xMin >= vb[0] + mx &&
        xMax <= vb[2] - mx &&
        yMin >= vb[1] + my &&
        yMax <= vb[3] - my
      );
    };

    const landmarks = model.get("landmarks") || [];
    let sx = 0;
    let sy = 0;
    let n = 0;
    for (const lm of landmarks) {
      for (const [vx, vy] of lm.vertices || []) {
        sx += vx;
        sy += vy;
        n += 1;
      }
    }
    if (!n) throw new Error("hero fixture has no landmark vertices");
    const lx = sx / n;
    const ly = sy / n;
    const cx = (xMin + xMax) / 2;
    const cy = (yMin + yMax) / 2;

    const settle = () => {
      const vb = engine.getViewportWorldBounds();
      if (!vb) throw new Error("missing viewport bounds after reset");
      if (!dataFits(vb)) throw new Error("view does not frame full tissue with margin");
    };

    for (let i = 0; i < 14; i++) {
      if (dataFits(engine.getViewportWorldBounds())) break;
      engine.zoomBy(-0.1, { animate: false });
    }
    settle();

    // Pan toward landmark centroid as far as margin allows (binary search).
    let panBlend = 0;
    for (let i = 0; i < 24; i++) {
      const mid = (panBlend + 1) / 2;
      const tx = cx + mid * (lx - cx);
      const ty = cy + mid * (ly - cy);
      engine.panTo(tx, ty, { animate: false });
      if (dataFits(engine.getViewportWorldBounds())) panBlend = mid;
    }
    engine.panTo(cx + panBlend * (lx - cx), cy + panBlend * (ly - cy), { animate: false });
    settle();

    // Gentle zoom toward landmarks; stop before tissue margin breaks.
    for (let step = 0; step < 6; step++) {
      engine.zoomBy(0.05, { animate: false });
      const vb = engine.getViewportWorldBounds();
      if (!dataFits(vb)) {
        engine.zoomBy(-0.05, { animate: false });
        break;
      }
    }
    settle();

    const vb = engine.getViewportWorldBounds();
    const vw = vb[2] - vb[0];
    const vh = vb[3] - vb[1];
    const fx = (lx - vb[0]) / vw;
    const fy = (ly - vb[1]) / vh;
    if (fx < 0.32 || fx > 0.68 || fy < 0.32 || fy > 0.68) {
      throw new Error(
        `landmarks off center third (frac=${fx.toFixed(3)},${fy.toFixed(3)}; panBlend=${panBlend.toFixed(3)})`,
      );
    }
  });
  await page.waitForTimeout(400);
}

async function assertHeroFrame(page, theme) {
  const frame = await page.evaluate(() => {
    const engine = window.__landmarksEngine;
    const model = window.__landmarksModel;
    const vb = engine.getViewportWorldBounds();
    if (!vb) return { ok: false, reason: "missing viewport world bounds" };

    const [xMin, xMax] = model.get("x_bounds");
    const [yMin, yMax] = model.get("y_bounds");
    const dataW = Math.max(xMax - xMin, 1);
    const dataH = Math.max(yMax - yMin, 1);
    const marginFrac = 0.055;
    const mx = dataW * marginFrac;
    const my = dataH * marginFrac;
    const tissueFits =
      xMin >= vb[0] + mx &&
      xMax <= vb[2] - mx &&
      yMin >= vb[1] + my &&
      yMax <= vb[3] - my;
    if (!tissueFits) {
      return { ok: false, reason: "tissue outline clipped (need margin around data bounds)", vb };
    }

    const snap = engine.getPerfSnapshot();
    if (!snap.spatialIndexBuilt || snap.pointCount < 10_000) {
      return { ok: false, reason: `points not ready (count=${snap.pointCount})` };
    }

    const landmarks = model.get("landmarks") || [];
    for (const lm of landmarks) {
      for (const [vx, vy] of lm.vertices || []) {
        if (vx < vb[0] || vx > vb[2] || vy < vb[1] || vy > vb[3]) {
          return { ok: false, reason: `landmark "${lm.id}" vertex off screen`, vb, vx, vy };
        }
      }
    }
    return { ok: true, pointCount: snap.pointCount, vb };
  });
  if (!frame.ok) throw new Error(`hero frame check failed (${theme}): ${frame.reason}`);

  const landmarks = await page.evaluate(() => window.__landmarksModel.get("landmarks") || []);
  for (const [index, lm] of landmarks.entries()) {
    await page.getByText(lm.id, { exact: true }).waitFor({ state: "visible", timeout: 30_000 });
    const deckHex = await page.evaluate(
      (idx) => window.__landmarksEngine.landmarkStrokeColor(idx),
      index,
    );
    const panelHex = await panelSwatchHex(page, lm.id).catch(() => null);
    if (deckHex && panelHex && panelHex !== deckHex && !(lm.buffer_width > 0)) {
      throw new Error(
        `swatch/deck stroke mismatch for "${lm.id}" (${theme}): panel=${panelHex} deck=${deckHex}`,
      );
    }
    console.log("landmark", theme, lm.id, deckHex, panelHex);
  }

  const bufferedPink = landmarks.find((lm) => lm.id === "landmark 2");
  if (!bufferedPink || bufferedPink.buffer_width <= 0 || bufferedPink.color?.toLowerCase() !== "#ff2d95") {
    throw new Error(`expected landmark 2 pink buffered spline (${theme})`);
  }

  const lm2Index = landmarks.findIndex((lm) => lm.id === "landmark 2");
  const bufferTint = await page.evaluate((idx) => {
    const engine = window.__landmarksEngine;
    return {
      stroke: engine.landmarkStrokeColor(idx),
      bufferFill: engine.landmarkBufferFillColor?.(idx) ?? null,
    };
  }, lm2Index);
  if (!bufferTint.bufferFill) {
    throw new Error(
      `landmarkBufferFillColor missing for landmark 2 (${theme}); restart colon harness with a fresh Vite cache`,
    );
  }
  const strokeHue = hueDegrees(...rgbFromHex(bufferTint.stroke || PINK_STROKE_HEX));
  const fillHue = hueDegrees(...rgbFromHex(bufferTint.bufferFill));
  if (hueDelta(strokeHue, fillHue) > 28) {
    throw new Error(
      `landmark 2 buffer fill hue mismatch (${theme}): stroke=${bufferTint.stroke} fill=${bufferTint.bufferFill}`,
    );
  }
  if (bufferTint.bufferFill.toLowerCase() === MINT_NEIGH_HEX) {
    throw new Error(
      `landmark 2 buffer still NEIGH mint (${theme}); stale milume/static/landmarks.js in Vite cache`,
    );
  }

  const plotPath = `/opt/cursor/artifacts/hero-plot-check-${theme}.png`;
  await page.locator(".landmarks__plot-host").screenshot({ path: plotPath });
  const plotPng = readFileSync(plotPath);
  assertPinkBufferPixelsInPlot(plotPng, theme);
  const vivid = countVividPlotPixels(plotPng, theme);
  const minVivid = 1200;
  if (vivid < minVivid) {
    throw new Error(
      `hero plot looks empty (${theme}): ${vivid} vivid samples (need >= ${minVivid}); ` +
        `frame=${JSON.stringify(frame)}`,
    );
  }
  console.log("hero frame ok", theme, { vivid, ...frame });
}

/** Inside landmark 2's buffered spline, pixels must read pink-tinted (not legacy mint NEIGH wash). */
function assertPinkBufferPixelsInPlot(pngBuffer, theme) {
  const { width, height, rgba } = decodePngRgba(pngBuffer);
  const pinkTargetHue = hueDegrees(...rgbFromHex(PINK_STROKE_HEX));
  const mintHue = hueDegrees(...rgbFromHex(MINT_NEIGH_HEX));
  let pinkish = 0;
  let mintish = 0;
  const step = 3;
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const i = (y * width + x) * 4;
      const r = rgba[i];
      const g = rgba[i + 1];
      const b = rgba[i + 2];
      const a = rgba[i + 3];
      if (a < 40) continue;
      const chroma = Math.max(r, g, b) - Math.min(r, g, b);
      if (chroma < 22) continue;
      const h = hueDegrees(r, g, b);
      if (hueDelta(h, pinkTargetHue) < 32 && r > g + 12) pinkish++;
      if (hueDelta(h, mintHue) < 22 && g > 200 && b > 200) mintish++;
    }
  }
  const minPink = theme === "dark" ? 400 : 600;
  if (pinkish < minPink) {
    throw new Error(
      `landmark 2 buffer pixels not pink (${theme}): pinkish=${pinkish} (need >= ${minPink}), mintish=${mintish}`,
    );
  }
  if (mintish > Math.max(40, pinkish * 0.08)) {
    throw new Error(
      `landmark 2 buffer still mint-tinted (${theme}): mintish=${mintish} pinkish=${pinkish}`,
    );
  }
  console.log("buffer hue ok", theme, { pinkish, mintish });
}

/** Sample PNG RGB plot crop: count pixels that are neither flat background nor empty. */
function countVividPlotPixels(pngBuffer, theme) {
  if (pngBuffer[0] !== 0x89) throw new Error("not a PNG");
  const { width, height, rgba } = decodePngRgba(pngBuffer);
  const step = 4;
  let vivid = 0;
  const bg = theme === "dark" ? [10, 10, 10] : [245, 245, 245];
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const i = (y * width + x) * 4;
      const r = rgba[i];
      const g = rgba[i + 1];
      const b = rgba[i + 2];
      const a = rgba[i + 3];
      if (a < 20) continue;
      const dr = Math.abs(r - bg[0]);
      const dg = Math.abs(g - bg[1]);
      const db = Math.abs(b - bg[2]);
      const chroma = Math.max(r, g, b) - Math.min(r, g, b);
      if (dr + dg + db > 35 || chroma > 28) vivid++;
    }
  }
  return vivid;
}

/** Minimal PNG decoder (8-bit RGBA) for hero plot sanity checks only. */
function decodePngRgba(buffer) {
  let pos = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 8;
  let colorType = 6;
  const idats = [];
  while (pos < buffer.length) {
    const len = buffer.readUInt32BE(pos);
    const type = buffer.toString("ascii", pos + 4, pos + 8);
    const data = buffer.subarray(pos + 8, pos + 8 + len);
    pos += 12 + len;
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === "IDAT") {
      idats.push(data);
    } else if (type === "IEND") break;
  }
  if (bitDepth !== 8 || (colorType !== 6 && colorType !== 2)) {
    throw new Error(`unsupported PNG for hero check: depth=${bitDepth} type=${colorType}`);
  }
  const raw = inflateSync(Buffer.concat(idats));
  const bpp = colorType === 6 ? 4 : 3;
  const rowBytes = width * bpp;
  const out = Buffer.alloc(width * height * 4);
  let rp = 0;
  const prev = Buffer.alloc(rowBytes);
  const cur = Buffer.alloc(rowBytes);
  for (let y = 0; y < height; y++) {
    const filter = raw[rp++];
    raw.copy(cur, 0, rp, rp + rowBytes);
    rp += rowBytes;
    if (filter !== 0) unfilterPngRow(cur, prev, bpp, filter);
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      out[o] = cur[x * bpp];
      out[o + 1] = cur[x * bpp + 1];
      out[o + 2] = cur[x * bpp + 2];
      out[o + 3] = bpp === 4 ? cur[x * bpp + 3] : 255;
    }
    cur.copy(prev);
  }
  return { width, height, rgba: out };
}

function unfilterPngRow(row, prev, bpp, filter) {
  for (let i = 0; i < row.length; i++) {
    const left = i >= bpp ? row[i - bpp] : 0;
    const up = prev[i] ?? 0;
    const upLeft = i >= bpp ? prev[i - bpp] : 0;
    let v = row[i];
    if (filter === 1) v = (v + left) & 0xff;
    else if (filter === 2) v = (v + up) & 0xff;
    else if (filter === 3) v = (v + Math.floor((left + up) / 2)) & 0xff;
    else if (filter === 4) {
      const p = left + up - upLeft;
      const pa = Math.abs(p - left);
      const pb = Math.abs(p - up);
      const pc = Math.abs(p - upLeft);
      const pr = pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
      v = (v + pr) & 0xff;
    }
    row[i] = v;
  }
}

async function captureTheme(browser, theme, outPath, baseUrl) {
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: DPR });
  const page = await context.newPage();
  await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 600_000 });
  await page.waitForFunction(
    () => window.__landmarksEngine?.getPerfSnapshot?.().spatialIndexBuilt,
    { timeout: 600_000 },
  );
  await page.evaluate((lms) => {
    const m = window.__landmarksModel;
    m.set("landmarks", lms);
    m.save_changes();
  }, LANDMARKS);
  await page.waitForTimeout(500);
  await applyTheme(page, theme);
  await page.addStyleTag({ content: HIDE_CHROME });
  await prepareHeroView(page);
  await openPanels(page);
  await page.waitForTimeout(800);
  await assertHeroFrame(page, theme);
  await page.locator(".landmarks").first().screenshot({ path: outPath });
  console.log("wrote", outPath, theme, `dpr=${DPR}`);
  await context.close();
}

async function main() {
  const baseUrl = await harnessUrl();
  console.log("harness", baseUrl);
  const browser = await chromium.launch();

  await captureTheme(browser, "light", ART_LIGHT, baseUrl);
  await captureTheme(browser, "dark", ART_DARK, baseUrl);
  await browser.close();

  copyFileSync(ART_LIGHT, REPO_LIGHT);
  copyFileSync(ART_DARK, REPO_DARK);
  copyFileSync(ART_LIGHT, "/workspace/website/landing/assets/landmarks_widget_light.png");
  copyFileSync(ART_DARK, "/workspace/website/landing/assets/landmarks_widget_dark.png");
  copyFileSync(ART_LIGHT, "/workspace/website/content/assets/landmarks_widget_light.png");
  copyFileSync(ART_DARK, "/workspace/website/content/assets/landmarks_widget_dark.png");

  mkdirSync(STORE_DIR, { recursive: true });
  copyFileSync(ART_LIGHT, join(STORE_DIR, "landmarks_widget_light.png"));
  copyFileSync(ART_DARK, join(STORE_DIR, "landmarks_widget_dark.png"));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
