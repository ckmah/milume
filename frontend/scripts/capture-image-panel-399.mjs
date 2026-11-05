/**
 * Visual acceptance captures for #399 (1280×800, 2× DPR, harness banner hidden, no DialKit).
 * After shots: current branch with landmarks-volume harness (issue122-2d + colon).
 * Before shots: run against main @ 71ef685 on CAPTURE_BEFORE_URL (separate worktree + dev server).
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "@playwright/test";

import { installDocsCaptureChrome } from "./lib/docs-tool-media.mjs";

const outDir = process.env.CAPTURE_OUT ?? "/opt/cursor/artifacts/panel-polish-399";
const afterBase = process.env.CAPTURE_URL ?? "http://127.0.0.1:5173";
const beforeBase = process.env.CAPTURE_BEFORE_URL ?? "http://127.0.0.1:5174";
const viewport = { width: 1280, height: 800 };
const beforeOnly = process.argv.includes("--before-only");
const afterOnly = process.argv.includes("--after-only");
const railOnly = process.argv.includes("--rail-only");

mkdirSync(outDir, { recursive: true });

function withNoDialkit(pathQuery) {
  if (!pathQuery || pathQuery === "/") return "/?noDialkit=1";
  return pathQuery.includes("noDialkit=1")
    ? pathQuery
    : `${pathQuery}${pathQuery.includes("?") ? "&" : "?"}noDialkit=1`;
}

async function hideHarnessBanner(page) {
  await page.addStyleTag({
    content: `[data-testid="harness-banner"], .harness-banner, [data-dialkit-panel] { display: none !important; }`,
  });
}

async function waitEngine(page, requireBackdrop = true) {
  await page.waitForFunction(() => Boolean(window.__landmarksEngine?.getViewState?.()), null, {
    timeout: 120_000,
  });
  if (requireBackdrop) {
    try {
      await page.waitForFunction(
        () => window.__landmarksEngine?.getBackdropPick?.()?.level != null,
        null,
        { timeout: 90_000 },
      );
    } catch {
      /* warming */
    }
  }
  await page.waitForTimeout(600);
}

async function waitBackdropRefined(page, maxLevel = 2) {
  await page.waitForFunction(
    (maxL) => {
      const p = window.__landmarksEngine?.getBackdropPick?.();
      return p != null && p.level <= maxL;
    },
    maxLevel,
    { timeout: 90_000 },
  );
  await page.waitForTimeout(400);
}

async function fitViewToData(page) {
  await page.evaluate(() => {
    const m = window.__landmarksModel;
    const xb = m.get("x_bounds");
    const yb = m.get("y_bounds");
    if (!xb || !yb) return;
    const cx = (xb[0] + xb[1]) / 2;
    const cy = (yb[0] + yb[1]) / 2;
    const span = Math.max(xb[1] - xb[0], yb[1] - yb[0], 1);
    const eng = window.__landmarksEngine;
    const vs = eng.getViewState();
    const { width, height } = eng.getCanvasSize?.() ?? { width: 1280, height: 800 };
    const zoom = Math.log2(Math.min(width, height) / (span * 1.15));
    eng.setViewState({ ...vs, target: [cx, cy, vs.target?.[2] ?? 0], zoom });
  });
  await page.waitForTimeout(700);
}

async function openLayers(page) {
  const left = page.locator(".landmarks__chrome-dock--left");
  if ((await left.getAttribute("data-collapsed")) === "true") {
    await page.getByRole("button", { name: "Show left panel" }).click();
  }
  await page.getByTestId("panel-section-layers").click();
}

async function captureLeftDock(page, name) {
  await hideHarnessBanner(page);
  await page.locator(".landmarks__chrome-dock--left").screenshot({
    path: join(outDir, `${name}.png`),
  });
}

async function captureWidget(page, name, clip) {
  await hideHarnessBanner(page);
  await page.locator(".milume-widget.landmarks").first().screenshot({
    path: join(outDir, `${name}.png`),
    ...(clip ? { clip } : {}),
  });
}

async function loadIssue122(page, base) {
  await page.goto(`${base}${withNoDialkit("/")}`, { waitUntil: "networkidle" });
  await waitEngine(page);
}

async function loadColon(page, base) {
  await page.goto(`${base}${withNoDialkit("/")}`, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await waitEngine(page);
}

async function twoChannelPanel(page) {
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
  await page.waitForTimeout(600);
  await openLayers(page);
  await page.getByTestId("layers-image-row").click();
}

async function manyChannels(page, { rowTestId, listTestId }) {
  const names = ["DAPI", "PanCK", "CD45", "Ki67"];
  for (let i = 4; i < 18; i++) names.push(i < 14 ? `CH${i - 3}` : `Pan-cytokeratin_AE1AE3_lo_${i}`);
  await page.evaluate((channelNames) => {
    const lm = window.__landmarksModel;
    const vol = lm.get("volume") || {};
    const rows = channelNames.map((name, i) => ({
      name,
      visible: i === 0,
      contrast_limits: [0, 255],
      constant_zero: false,
      color: name === "PanCK" ? "#ff8844" : undefined,
    }));
    lm.set("_image_channels", rows);
    lm.set("volume", { ...vol, channels: rows });
    lm.save_changes();
  }, names);
  await page.waitForTimeout(500);
  await openLayers(page);
  await page.getByTestId("layers-image-row").click();
  const row = page.getByTestId(rowTestId("DAPI"));
  if (await row.count()) await row.focus();
  const list = listTestId ? page.getByTestId(listTestId) : page.locator(".landmarks-image-channel-list");
  if (await list.count()) {
    await list.evaluate((el) => {
      el.scrollTop = 48;
    });
  } else {
    await page.locator(".landmarks-layers-stack").evaluate((el) => {
      el.scrollTop = 80;
    });
  }
}

async function waitForBackdropBounds(page) {
  await page.waitForFunction(
    () => {
      const b = window.__landmarksEngine?.getBackdropBounds?.();
      return Array.isArray(b) && b.length === 4;
    },
    null,
    { timeout: 90_000 },
  );
}

async function panSeamView(page) {
  await fitViewToData(page);
  await waitForBackdropBounds(page).catch(async () => {
    await page.waitForTimeout(1200);
  });
  await page.evaluate(async () => {
    const eng = window.__landmarksEngine;
    const lm = window.__landmarksModel;
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    let bounds = eng.getBackdropBounds?.();
    for (let i = 0; i < 20 && !bounds; i++) {
      await sleep(200);
      bounds = eng.getBackdropBounds?.();
    }
    if (!bounds) {
      const [xMin, xMax] = lm.get("x_bounds");
      const [yMin, yMax] = lm.get("y_bounds");
      bounds = [xMin, yMin, xMax, yMax];
    }
    const [left, bottom, right, top] = bounds;
    const cy = (bottom + top) / 2;
    const span = Math.max(right - left, top - bottom, 1);
    const vs = eng.getViewState();
    const { width, height } = eng.getCanvasSize?.() ?? { width: 1280, height: 800 };
    const zoom = Math.log2(Math.min(width, height) / (span * 0.38));
    eng.setViewState({
      ...vs,
      target: [right - span * 0.035, cy, vs.target?.[2] ?? 0],
      zoom,
    });
  });
  await page.waitForTimeout(1400);
  await waitBackdropRefined(page, 2).catch(() => {});
}

async function seamClipOnWidget(page) {
  return page.evaluate(() => {
    const widget = document.querySelector(".milume-widget.landmarks");
    const canvas = document.querySelector("canvas.landmarks__webgl");
    if (!widget || !canvas) throw new Error("widget missing");
    const wRect = widget.getBoundingClientRect();
    const cRect = canvas.getBoundingClientRect();
    const eng = window.__landmarksEngine;
    const vs = eng.getViewState();
    const scale = 2 ** (vs.zoom ?? 0);
    const tx = vs.target?.[0] ?? 0;
    const ty = vs.target?.[1] ?? 0;
    const project = (wx, wy) => ({
      x: (wx - tx) * scale + cRect.width / 2 + cRect.left,
      y: cRect.height / 2 - (wy - ty) * scale + cRect.top,
    });
    const bounds = eng.getBackdropBounds?.();
    let clipCenterX = cRect.left + cRect.width * 0.32;
    if (bounds) {
      const [left, bottom, right, top] = bounds;
      const midY = (bottom + top) / 2;
      const edge = project(right, midY);
      const inner = project(right - (right - left) * 0.07, midY);
      clipCenterX = (edge.x + inner.x) / 2;
    }
    const clipW = 140;
    const clipH = Math.min(cRect.height * 0.62, 460);
    return {
      x: Math.max(0, clipCenterX - wRect.left - clipW / 2),
      y: Math.max(0, cRect.top - wRect.top + cRect.height * 0.14),
      width: clipW,
      height: clipH,
    };
  });
}

async function seamCrop(page, name) {
  await panSeamView(page);
  const clip = await seamClipOnWidget(page);
  await captureWidget(page, name, clip);
  const measure = await page.evaluate(() => {
    const eng = window.__landmarksEngine;
    const lm = window.__landmarksModel;
    const cached = eng.getBackdropBounds?.();
    let left;
    let bottom;
    let right;
    let top;
    if (cached && cached.length === 4) {
      [left, bottom, right, top] = cached;
    } else {
      const cut = lm.get("volume_cut");
      if (!cut || cut.length < 4) return null;
      left = cut[0];
      right = cut[1];
      bottom = cut[2];
      top = cut[3];
    }
    const cy = (bottom + top) / 2;
    const span = Math.max(right - left, top - bottom, 1);
    const canvas = document.querySelector("canvas.landmarks__webgl");
    const gl = canvas?.getContext("webgl2") ?? canvas?.getContext("webgl");
    if (!canvas || !gl) return null;
    const vs = eng.getViewState();
    const cRect = canvas.getBoundingClientRect();
    const scale = 2 ** (vs.zoom ?? 0);
    const tx = vs.target?.[0] ?? 0;
    const ty = vs.target?.[1] ?? 0;
    const project = (wx, wy) => ({
      x: (wx - tx) * scale + cRect.width / 2 + cRect.left,
      y: cRect.height / 2 - (wy - ty) * scale + cRect.top,
    });
    const outsidePt = project(right + span * 0.06, cy);
    const readAtClient = (clientX, clientY) => {
      const x = Math.floor(((clientX - cRect.left) * canvas.width) / cRect.width);
      const y = Math.floor((1 - (clientY - cRect.top) / cRect.height) * canvas.height);
      const px = new Uint8Array(4);
      gl.readPixels(
        Math.max(0, Math.min(canvas.width - 1, x)),
        Math.max(0, Math.min(canvas.height - 1, y)),
        1,
        1,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        px,
      );
      return [px[0], px[1], px[2]];
    };
    const nearBlack = (rgb) => rgb[0] <= 1 && rgb[1] <= 1 && rgb[2] <= 1;
    const insideCandidates = [
      project(right - span * 0.02, cy),
      project(right - span * 0.04, cy),
      project(left + span * 0.93, cy),
      project(left + span * 0.85, cy),
    ];
    let insideEmpty = readAtClient(insideCandidates[0].x, insideCandidates[0].y);
    for (const pt of insideCandidates) {
      const rgb = readAtClient(pt.x, pt.y);
      if (nearBlack(rgb)) {
        insideEmpty = rgb;
        break;
      }
    }
    if (!nearBlack(insideEmpty)) {
      for (let t = 0.05; t <= 0.95; t += 0.05) {
        const pt = project(left + span * t, cy);
        const rgb = readAtClient(pt.x, pt.y);
        if (nearBlack(rgb)) {
          insideEmpty = rgb;
          break;
        }
      }
    }
    return {
      edge: readAtClient(project(right - span * 0.04, cy).x, project(right - span * 0.04, cy).y),
      insideEmpty,
      outside: readAtClient(outsidePt.x, outsidePt.y),
    };
  });
  if (measure) {
    console.log(
      `${name} seam pixels edge=${measure.edge.join(",")} insideEmpty=${measure.insideEmpty.join(",")} outside=${measure.outside.join(",")}`,
    );
  }
}

async function placeCaptureCursorOnThumb(page, ariaLabel) {
  const thumb = page.getByRole("slider", { name: ariaLabel });
  await thumb.waitFor({ state: "visible" });
  const placed = await thumb.evaluate((thumbEl) => {
    const track = thumbEl.closest(".landmarks-depth-rail__track");
    if (!track) return { ok: false };
    const tr = thumbEl.getBoundingClientRect();
    const trackR = track.getBoundingClientRect();
    const centerX = tr.left + tr.width / 2;
    const centerY = tr.top + tr.height / 2;
    document.getElementById("docs-capture-cursor-inline")?.remove();
    const el = document.createElement("div");
    el.id = "docs-capture-cursor-inline";
    el.style.position = "absolute";
    el.style.width = "22px";
    el.style.height = "22px";
    el.style.left = `${centerX - trackR.left}px`;
    el.style.top = `${centerY - trackR.top}px`;
    el.style.transform = "translate(-50%, -50%)";
    el.style.zIndex = "40";
    el.style.border = "2.5px solid #ffffff";
    el.style.borderRadius = "50%";
    el.style.boxShadow = "0 0 0 1.5px rgba(0,0,0,0.85), 0 0 8px rgba(0,0,0,0.5)";
    el.style.background = "rgba(251, 146, 60, 0.9)";
    el.style.pointerEvents = "none";
    track.appendChild(el);
    return { ok: true };
  });
  if (!placed?.ok) throw new Error("capture cursor placement failed");
}

async function railDrag(page) {
  await fitViewToData(page);
  await page.evaluate(() => {
    const eng = window.__landmarksEngine;
    const vs = eng.getViewState();
    eng.setViewState({ ...vs, zoom: vs.zoom + 2.5 });
  });
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    const lm = window.__landmarksModel;
    const focus = Math.round(lm.get("z_focus_um"));
    lm.set("z_focus_um", focus);
    lm.set("z_band_lo_um", focus - 5);
    lm.set("z_band_hi_um", focus + 5);
    lm.save_changes();
  });
  await page.waitForTimeout(1200);
  const lo = page.getByRole("slider", { name: "Lower z bound" });
  const box = await lo.boundingBox();
  if (!box) throw new Error("thumb missing");
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx, cy + 22, { steps: 6 });
  await page.waitForTimeout(250);
  await placeCaptureCursorOnThumb(page, "Lower z bound");
  await captureWidget(page, "399-after-rail-drag");
  await page.mouse.up();
}

async function captureBefore(page, base) {
  await loadIssue122(page, base);
  await twoChannelPanel(page);
  await captureLeftDock(page, "399-before-2ch-panel");
  await page.getByTestId("layer-channel-CD45").focus();
  await captureLeftDock(page, "399-before-channel-focus");
  await manyChannels(page, {
    rowTestId: (name) => `layer-channel-${name}`,
    listTestId: null,
  });
  await captureLeftDock(page, "399-before-18ch-scroll");
  await seamCrop(page, "399-before-seam-crop");
}

async function captureAfter(page, base) {
  await loadIssue122(page, base);
  await twoChannelPanel(page);
  await captureLeftDock(page, "399-after-2ch-panel");
  await page.getByTestId("layer-channel-row-CD45").focus();
  await captureLeftDock(page, "399-after-channel-focus");
  await manyChannels(page, {
    rowTestId: (name) => `layer-channel-row-${name}`,
    listTestId: "layer-channel-list",
  });
  await captureLeftDock(page, "399-after-18ch-scroll");
  await seamCrop(page, "399-after-seam-crop");
  try {
    await loadColon(page, process.env.CAPTURE_COLON_URL ?? base);
    await railDrag(page);
  } catch (err) {
    console.warn("Skipped colon rail capture:", err?.message ?? err);
  }
}

const browser = await chromium.launch();
const context = await browser.newContext({ viewport, deviceScaleFactor: 2 });
await installDocsCaptureChrome(context);

if (railOnly) {
  const railPage = await context.newPage();
  try {
    await loadIssue122(railPage, process.env.CAPTURE_COLON_URL ?? afterBase);
    await railDrag(railPage);
  } finally {
    await railPage.close();
  }
} else if (!afterOnly) {
  const beforePage = await context.newPage();
  try {
    await captureBefore(beforePage, beforeBase);
  } catch (err) {
    console.warn("Before captures failed:", err?.message ?? err);
    throw err;
  } finally {
    await beforePage.close();
  }
}

if (!beforeOnly && !railOnly) {
  const afterPage = await context.newPage();
  try {
    await captureAfter(afterPage, afterBase);
  } finally {
    await afterPage.close();
  }
}

await browser.close();
console.log(`Wrote captures to ${outDir}`);
