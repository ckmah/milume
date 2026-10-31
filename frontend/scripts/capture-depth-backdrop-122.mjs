/**
 * Visual acceptance captures for depth backdrop (#122).
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "@playwright/test";

import { installDocsCaptureChrome } from "./lib/docs-tool-media.mjs";

const outDir = process.env.CAPTURE_OUT ?? "/opt/cursor/artifacts/depth-backdrop-122";
const base = process.env.CAPTURE_URL ?? "http://127.0.0.1:5173";
const mode =
  ["--issue122-2d", "--colon", "--colon-rail-drag", "--ileum", "--toy"].find((f) =>
    process.argv.includes(f),
  ) ?? "--toy";
const ILEUM = "/e2e-galt-lasso-fixture.json";

mkdirSync(outDir, { recursive: true });

function withNoDialkit(pathQuery) {
  if (!pathQuery || pathQuery === "/") return "/?noDialkit=1";
  return pathQuery.includes("noDialkit=1")
    ? pathQuery
    : `${pathQuery}${pathQuery.includes("?") ? "&" : "?"}noDialkit=1`;
}

async function hideHarnessBanner(page) {
  await page.addStyleTag({
    content: `[data-testid="harness-banner"], .harness-banner { display: none !important; }`,
  });
}

async function waitEngine(page, requireBackdrop = true) {
  await page.waitForFunction(() => Boolean(window.__landmarksEngine?.getViewState?.()), null, {
    timeout: 120_000,
  });
  if (requireBackdrop) {
    await page.waitForFunction(
      () => window.__landmarksEngine?.getBackdropPick?.()?.level != null,
      null,
      { timeout: 120_000 },
    );
  }
  await page.waitForTimeout(400);
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
  await page.waitForTimeout(500);
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
  const imageRow = page.getByTestId("layers-image-row");
  if (await imageRow.count()) {
    const expanded = await imageRow.getAttribute("aria-expanded");
    if (expanded !== "true") await imageRow.click();
  }
}

async function placeCaptureCursorOnThumb(page, ariaLabel) {
  const track = page.locator(".landmarks-depth-rail__track").first();
  const thumb = page.getByRole("slider", { name: ariaLabel });
  const trbox = await track.boundingBox();
  const tbox = await thumb.boundingBox();
  if (!trbox || !tbox) return;
  const x = tbox.x - trbox.x + tbox.width / 2;
  const y = tbox.y - trbox.y + tbox.height / 2;
  await track.evaluate(
    ({ left, top }) => {
      document.getElementById("docs-capture-cursor-inline")?.remove();
      const el = document.createElement("div");
      el.id = "docs-capture-cursor-inline";
      el.style.position = "absolute";
      el.style.width = "22px";
      el.style.height = "22px";
      el.style.margin = "-6px 0 0 -6px";
      el.style.left = `${left}px`;
      el.style.top = `${top}px`;
      el.style.zIndex = "40";
      el.style.border = "2.5px solid #ffffff";
      el.style.borderRadius = "50%";
      el.style.boxShadow = "0 0 0 1.5px rgba(0,0,0,0.85), 0 0 8px rgba(0,0,0,0.5)";
      el.style.background = "rgba(251, 146, 60, 0.9)";
      el.style.pointerEvents = "none";
      const host = document.querySelector(".landmarks-depth-rail__track");
      host?.appendChild(el);
    },
    { left: x, top: y },
  );
}

async function placeCaptureCursor(page, clientX, clientY) {
  await page.evaluate(
    ({ x, y }) => {
      const lm = document.querySelector(".landmarks");
      const el = document.getElementById("docs-capture-cursor");
      if (!lm || !el) return;
      const r = lm.getBoundingClientRect();
      el.style.display = "block";
      el.style.width = "16px";
      el.style.height = "16px";
      el.style.margin = "-3px 0 0 -3px";
      el.style.zIndex = "100000";
      el.style.left = `${x - r.left}px`;
      el.style.top = `${y - r.top}px`;
    },
    { x: clientX, y: clientY },
  );
}

async function captureWidget(page, name) {
  const widget = page.locator(".milume-widget.landmarks").first();
  await widget.waitFor({ state: "visible", timeout: 120_000 });
  await hideHarnessBanner(page);
  await widget.screenshot({ path: join(outDir, `${name}.png`) });
}

async function load(page, pathQuery = "/", requireBackdrop = true) {
  await page.goto(`${base}${withNoDialkit(pathQuery)}`, { waitUntil: "networkidle" });
  await waitEngine(page, requireBackdrop);
}

async function zoomIn(page, steps = 1) {
  for (let i = 0; i < steps; i++) {
    await page.evaluate(() => {
      const eng = window.__landmarksEngine;
      const vs = eng.getViewState();
      eng.setViewState({ ...vs, zoom: vs.zoom + 1.2 });
    });
    await page.waitForTimeout(400);
  }
}

async function captureIssue122d(page) {
  await load(page);
  await fitViewToData(page);
  await page.evaluate(() => {
    const lm = window.__landmarksModel;
    const vol = lm.get("volume") || {};
    lm.set(
      "_image_channels",
      (vol.channels || []).map((c) => ({
        ...c,
        visible: c.name === "DAPI" || c.name === "PanCK",
        color: c.name === "DAPI" ? "#9a9a9a" : c.name === "PanCK" ? "#ff8844" : c.color,
        contrast_limits: c.contrast_limits ?? [0, 255],
      })),
    );
    lm.save_changes();
  });
  await waitBackdropRefined(page, 1);
  await openLayers(page);
  await page.waitForTimeout(300);
  await captureWidget(page, "122-2d-two-channel-blend-layers");
  await page.evaluate(() => {
    const lm = window.__landmarksModel;
    const vol = lm.get("volume") || {};
    lm.set(
      "_image_channels",
      (vol.channels || []).map((c) => ({
        ...c,
        visible: c.name === "DAPI",
        color: "#9a9a9a",
      })),
    );
    lm.save_changes();
  });
  await waitBackdropRefined(page, 1);
  await captureWidget(page, "122-2d-default-dapi-gray");
  await zoomIn(page, 2);
  await waitBackdropRefined(page, 1);
  await captureWidget(page, "122-2d-dapi-zoomed");
}

async function captureColonRailDragOnly(page) {
  await load(page);
  await fitViewToData(page);
  await zoomIn(page, 3);
  await page.evaluate(() => {
    const lm = window.__landmarksModel;
    const focus = Math.round(lm.get("z_focus_um"));
    lm.set("z_focus_um", focus);
    lm.set("z_band_lo_um", focus - 5);
    lm.set("z_band_hi_um", focus + 5);
    lm.save_changes();
  });
  await waitBackdropRefined(page, 5);
  const loThumb = page.getByRole("slider", { name: "Lower z bound" });
  const box = await loThumb.boundingBox();
  if (!box) throw new Error("lower thumb bounding box missing");
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx, cy + 18, { steps: 4 });
  await page.waitForTimeout(250);
  await placeCaptureCursorOnThumb(page, "Lower z bound");
  await captureWidget(page, "122-colon-rail-drag-lower");
  await page.mouse.up();
}

async function captureColon(page) {
  await load(page);
  await fitViewToData(page);
  await page.waitForTimeout(600);
  await captureWidget(page, "122-colon-backdrop-on-fit");
  await zoomIn(page, 2);
  await waitBackdropRefined(page, 4);
  await captureWidget(page, "122-colon-backdrop-on-zoomed");
  await openLayers(page);
  await page.getByTestId("layer-toggle-image").click();
  await page.waitForTimeout(400);
  await captureWidget(page, "122-colon-backdrop-off-fit");
  await load(page);
  await fitViewToData(page);
  await zoomIn(page, 3);
  await page.evaluate(() => {
    const lm = window.__landmarksModel;
    const focus = Math.round(lm.get("z_focus_um"));
    lm.set("z_focus_um", focus);
    lm.set("z_band_lo_um", focus - 5);
    lm.set("z_band_hi_um", focus + 5);
    lm.save_changes();
  });
  await waitBackdropRefined(page, 5);
  const pickBand = await page.evaluate(() => window.__landmarksEngine?.getBackdropPick?.());
  console.log("colon band at rest pick", pickBand);
  await captureWidget(page, "122-colon-band-rail-faded-points");
  const loThumb = page.getByRole("slider", { name: "Lower z bound" });
  const box = await loThumb.boundingBox();
  if (box) {
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    const dragY = cy + 18;
    await page.mouse.move(cx, dragY, { steps: 4 });
    await page.waitForTimeout(200);
    await placeCaptureCursorOnThumb(page, "Lower z bound");
    await captureWidget(page, "122-colon-rail-drag-lower");
    await page.mouse.up();
    await page.evaluate(() => window.__landmarksEngine?.noteBackdropZBandEnd?.());
    await waitBackdropRefined(page, 3);
  }
}

async function captureIleum(page) {
  await load(page, `/?fixture=${encodeURIComponent(ILEUM)}`, false);
  await captureWidget(page, "122-ileum-2d-no-rail");
}

async function captureToy(page) {
  await load(page);
  await captureWidget(page, "122-volume-rail-and-backdrop");
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await installDocsCaptureChrome(page, "dark");
  if (mode === "--issue122-2d") await captureIssue122d(page);
  else if (mode === "--colon-rail-drag") await captureColonRailDragOnly(page);
  else if (mode === "--colon") await captureColon(page);
  else if (mode === "--ileum") await captureIleum(page);
  else await captureToy(page);
  await browser.close();
  console.log(`Wrote captures under ${outDir} (${mode})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
