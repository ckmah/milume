/**
 * Colon A2 README hero: fit 2D map + focused hero-region + Inspect hover preview
 * on tissue when framing allows; else immersive cube (Iso, Reset, image + labels).
 */
import { copyFileSync } from "node:fs";
import { chromium } from "@playwright/test";

const ART_LIGHT = "/opt/cursor/artifacts/issue-114-hero-light.png";
const ART_DARK = "/opt/cursor/artifacts/issue-114-hero-dark.png";
const REPO_LIGHT = "/workspace/assets/landmarks_widget_light.png";
const REPO_DARK = "/workspace/assets/landmarks_widget_dark.png";
const VIEWPORT = { width: 1600, height: 900 };

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
        return `http://localhost:${port}/?window=120`;
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

async function plotBox(page) {
  const host = page.locator(".landmarks__plot-host");
  await host.waitFor({ state: "visible", timeout: 120_000 });
  const box = await host.boundingBox();
  if (!box) throw new Error("missing plot host box");
  return box;
}

async function landmarksBox(page) {
  const lm = page.locator(".landmarks").first();
  await lm.waitFor({ state: "visible", timeout: 120_000 });
  const box = await lm.boundingBox();
  if (!box) throw new Error("missing landmarks box");
  return box;
}

async function heroCentroid(page) {
  return page.evaluate(() => {
    const sel = (window.__landmarksModel.get("selections") || [])[0];
    const verts = sel?.vertices || [];
    if (!verts.length) throw new Error("hero selection missing vertices");
    let sx = 0;
    let sy = 0;
    for (const [vx, vy] of verts) {
      sx += vx;
      sy += vy;
    }
    return [sx / verts.length, sy / verts.length];
  });
}

async function screenAtUm(page, box, x, y) {
  return page.evaluate(
    ({ x, y, box }) => {
      const vs = window.__landmarksEngine.getViewState();
      const k = 2 ** vs.zoom;
      return {
        x: box.x + box.width / 2 + (x - vs.target[0]) * k,
        y: box.y + box.height / 2 + (y - vs.target[1]) * k,
      };
    },
    { x, y, box },
  );
}

async function prepareHeroFocus(page) {
  await page.evaluate(() => {
    const m = window.__landmarksModel;
    const selections = [...(m.get("selections") || [])];
    if (selections[0]) {
      selections[0] = {
        ...selections[0],
        neighborhood: "knn",
        neighborhood_k: 12,
        neighborhood_radius: 0,
      };
      m.set("selections", selections);
    }
    m.set("selected_kind", "selection");
    m.set("selected_index", 0);
    m.set("mode", "select");
    m.save_changes();
  });
  await page.getByRole("radio", { name: "Select", exact: true }).click();
  await page.getByTestId("selection-row").first().click();
  await page.waitForTimeout(400);
}

/** Fit full map, then pan so the hero centroid sits left-of-center (room for the 480px preview). */
async function fitMapForHero(page) {
  const plot = await plotBox(page);
  const [cx, cy] = await heroCentroid(page);
  await page.evaluate(() => {
    window.__landmarksEngine.resetZoom();
  });
  await page.waitForTimeout(500);
  const targetFx = 0.34;
  const targetFy = 0.56;
  await page.evaluate(
    ({ cx, cy, targetFx, targetFy, pw, ph }) => {
      const vs = window.__landmarksEngine.getViewState();
      const k = 2 ** vs.zoom;
      const tx = cx - (targetFx - 0.5) * pw / k;
      const ty = cy - (targetFy - 0.5) * ph / k;
      window.__landmarksEngine.panTo(tx, ty, { animate: false });
    },
    { cx, cy, targetFx, targetFy, pw: plot.width, ph: plot.height },
  );
  await page.waitForTimeout(450);
}

async function waitPreviewReady(page) {
  const float = page.getByTestId("inspect-preview");
  await float.waitFor({ state: "visible", timeout: 300_000 });
  await page.waitForFunction(
    () => {
      const el = document.querySelector('[data-testid="inspect-preview"] .volume-cube__view');
      const region = document.querySelector('[data-testid="inspect-preview"]')?.getAttribute("data-region");
      return (
        Boolean(region) &&
        el?.getAttribute("data-refining") === "false" &&
        el?.getAttribute("data-image") === "on"
      );
    },
    null,
    { timeout: 300_000 },
  );
  await page.waitForTimeout(2500);
}

async function previewFramingOk(page) {
  const plot = await plotBox(page);
  const root = await landmarksBox(page);
  const prev = page.getByTestId("inspect-preview");
  if (!(await prev.isVisible())) return false;
  const box = await prev.boundingBox();
  if (!box) return false;

  const insideRoot =
    box.x >= root.x + 4 &&
    box.y >= root.y + 52 &&
    box.x + box.width <= root.x + root.width - 4 &&
    box.y + box.height <= root.y + root.height - 8;
  const inPlotBand =
    box.x + box.width * 0.35 > plot.x + plot.width * 0.28 &&
    box.x < plot.x + plot.width * 0.92 &&
    box.y > plot.y + 24 &&
    box.y + box.height < plot.y + plot.height - 12;
  const largeEnough = box.width >= 440 && box.height >= 440;
  const notCornerPinned = !(box.x < plot.x + 72 && box.y > plot.y + plot.height - box.height - 28);

  const dimming = await page.evaluate(() => Boolean(window.__landmarksEngine.getPerfSnapshot?.().pointRoleMode));

  return insideRoot && inPlotBand && largeEnough && notCornerPinned && dimming;
}

/** Last hover screen position for keeping the Inspect preview open through the screenshot. */
let lastHoverScreen = null;

async function capturePreview(page) {
  await prepareHeroFocus(page);
  await fitMapForHero(page);
  const plot = await plotBox(page);
  const [cx, cy] = await heroCentroid(page);
  let at = await screenAtUm(page, plot, cx, cy);

  await page.getByRole("radio", { name: "Inspect", exact: true }).click();
  await page.evaluate(() => {
    const m = window.__landmarksModel;
    m.set("selected_kind", "selection");
    m.set("selected_index", 0);
    m.save_changes();
  });

  // Nudge hover if the preview would pin to a corner (square wider than canvas).
  for (let attempt = 0; attempt < 4; attempt++) {
    await page.mouse.move(at.x, at.y, { steps: 12 });
    await page.waitForTimeout(300);
    const pinned = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="inspect-preview"]');
      if (!el || el.hasAttribute("hidden")) return false;
      const plot = document.querySelector(".landmarks__plot-host")?.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      if (!plot) return false;
      return r.x < plot.x + 60 && r.y > plot.bottom - r.height - 20;
    });
    if (!pinned) break;
    at = { x: at.x - 80, y: at.y + 40 };
  }

  await page.mouse.move(at.x, at.y, { steps: 8 });
  await waitPreviewReady(page);
  lastHoverScreen = at;
  return await previewFramingOk(page);
}

async function holdPreviewHover(page) {
  if (!lastHoverScreen) return;
  await page.mouse.move(lastHoverScreen.x, lastHoverScreen.y, { steps: 4 });
  await page.getByTestId("inspect-preview").waitFor({ state: "visible", timeout: 60_000 });
  await page.waitForTimeout(400);
}

async function setLayerShow(page, layer, on) {
  const btn = page.getByTestId(`layer-toggle-${layer}`);
  const pressed = await btn.getAttribute("aria-pressed");
  if ((pressed === "true") !== on) await btn.click();
}

async function captureImmersive(page) {
  await prepareHeroFocus(page);
  await page.evaluate(() => {
    window.__landmarksEngine.resetZoom();
  });
  await page.waitForTimeout(400);
  const plot = await plotBox(page);
  const [cx, cy] = await heroCentroid(page);
  const at = await screenAtUm(page, plot, cx, cy);

  await page.getByRole("radio", { name: "Inspect", exact: true }).click();
  await page.mouse.click(at.x, at.y);
  const cube = page.getByRole("dialog", { name: "Cube" });
  await cube.waitFor({ state: "visible", timeout: 300_000 });
  await cube.locator(".volume-cube__view").waitFor({ state: "visible", timeout: 300_000 });

  const bar = page.getByTestId("context-inspect-toolbar");
  const view = cube.locator(".volume-cube__view");
  await setLayerShow(page, "image", true);
  await setLayerShow(page, "labels", true);
  await bar.getByRole("radio", { name: "Oblique view" }).click();
  await page.waitForTimeout(400);
  await bar.getByRole("radio", { name: "Oblique view" }).click();

  await page.waitForFunction(
    () => {
      const el = document.querySelector(".landmarks__cube-immersive .volume-cube__view");
      return (
        el?.getAttribute("data-refining") === "false" &&
        el?.getAttribute("data-image") === "on" &&
        el?.getAttribute("data-labels") === "on" &&
        el?.getAttribute("data-pitch") === "35"
      );
    },
    null,
    { timeout: 300_000 },
  );
  const zoom = await view.getAttribute("data-zoom");
  if (!zoom || Number(zoom) < 0.2) {
    throw new Error(`immersive cube zoom too low: ${zoom}`);
  }
  await page.waitForTimeout(5000);
}

async function captureTheme(browser, theme, outPath, baseUrl, mode) {
  const page = await browser.newPage({ viewport: VIEWPORT });
  lastHoverScreen = null;
  await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 600_000 });
  await page.waitForFunction(
    () => window.__landmarksEngine?.getPerfSnapshot?.().spatialIndexBuilt,
    { timeout: 600_000 },
  );
  await applyTheme(page, theme);
  await page.addStyleTag({ content: HIDE_CHROME });

  if (mode === "preview") {
    const ok = await capturePreview(page);
    if (!ok) throw new Error("preview framing failed");
  } else {
    await captureImmersive(page);
  }

  await openPanels(page);
  if (mode === "preview") await holdPreviewHover(page);
  await page.waitForTimeout(800);
  await page.locator(".landmarks").first().screenshot({ path: outPath });
  console.log("wrote", outPath, theme, mode);
  await page.close();
}

async function main() {
  const baseUrl = await harnessUrl();
  console.log("harness", baseUrl);
  const browser = await chromium.launch();

  const probe = await browser.newPage({ viewport: VIEWPORT });
  await probe.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 600_000 });
  await probe.waitForFunction(
    () => window.__landmarksEngine?.getPerfSnapshot?.().spatialIndexBuilt,
    { timeout: 600_000 },
  );
  await applyTheme(probe, "light");
  await probe.addStyleTag({ content: HIDE_CHROME });
  let mode = "preview";
  try {
    const ok = await capturePreview(probe);
    if (!ok) mode = "immersive";
  } catch {
    mode = "immersive";
  }
  await probe.close();
  console.log("capture mode:", mode);

  await captureTheme(browser, "light", ART_LIGHT, baseUrl, mode);
  await captureTheme(browser, "dark", ART_DARK, baseUrl, mode);
  await browser.close();

  copyFileSync(ART_LIGHT, REPO_LIGHT);
  copyFileSync(ART_DARK, REPO_DARK);
  copyFileSync(ART_LIGHT, "/workspace/website/landing/assets/landmarks_widget_light.png");
  copyFileSync(ART_DARK, "/workspace/website/landing/assets/landmarks_widget_dark.png");
  copyFileSync(ART_DARK, "/workspace/website/content/assets/landmarks_widget_dark.png");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
