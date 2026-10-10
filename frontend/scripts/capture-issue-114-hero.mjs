/**
 * Capture colon A2 README / landing hero (2D map + selection + Inspect cube).
 * Prereq: colon zarr + fixture (export-colon-a2-volume-hero.py --hero) and
 * `MILUME_VOLUME_PROFILE=colon npm run dev:landmarks-volume`.
 */
import { copyFileSync } from "node:fs";
import { chromium } from "@playwright/test";

const ART_LIGHT = "/opt/cursor/artifacts/issue-114-hero-light.png";
const ART_DARK = "/opt/cursor/artifacts/issue-114-hero-dark.png";
const REPO_LIGHT = "/workspace/assets/landmarks_widget_light.png";
const REPO_DARK = "/workspace/assets/landmarks_widget_dark.png";
const VIEWPORT = { width: 1600, height: 900 };

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
  }, theme);
  await page.waitForTimeout(250);
}

async function harnessUrl() {
  for (const port of [5176, 5173, 5174, 5175]) {
    try {
      const res = await fetch(`http://localhost:${port}/fixture.json`);
      if (!res.ok) continue;
      const j = await res.json();
      if (j.volume?.image_url?.includes("colon_a2")) return `http://localhost:${port}/`;
    } catch {
      /* try next port */
    }
  }
  throw new Error("no colon volume harness found on ports 5173-5176");
}

async function openPanels(page) {
  for (const name of ["Show left panel", "Show right panel"]) {
    const btn = page.getByRole("button", { name });
    if (await btn.isVisible().catch(() => false)) {
      await btn.click();
    }
  }
}

async function plotBox(page) {
  const host = page.locator(".landmarks__plot-host");
  await host.waitFor({ state: "visible", timeout: 120_000 });
  const box = await host.boundingBox();
  if (!box) throw new Error("missing plot host box");
  return box;
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

async function captureTheme(browser, theme, outPath, baseUrl) {
  const page = await browser.newPage({ viewport: VIEWPORT });
  await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 600_000 });
  await page.waitForFunction(
    () => window.__landmarksEngine?.getPerfSnapshot?.().spatialIndexBuilt,
    { timeout: 600_000 },
  );
  await applyTheme(page, theme);
  await page.addStyleTag({
    content: ".dialkit-root, [class*='dialkit'] { display: none !important; }",
  });

  await page.getByRole("radio", { name: "Select", exact: true }).click();
  await page.waitForTimeout(400);

  const row = page.getByTestId("selection-row").first();
  await row.waitFor({ state: "visible", timeout: 120_000 });
  await row.click();
  await page.waitForTimeout(600);

  const [cx, cy] = await heroCentroid(page);
  const box = await plotBox(page);
  const at = await screenAtUm(page, box, cx, cy);

  await page.getByRole("radio", { name: "Inspect", exact: true }).click();
  await page.mouse.click(at.x, at.y);
  const cube = page.getByRole("dialog", { name: "Cube" });
  await cube.waitFor({ state: "visible", timeout: 300_000 });
  await cube.locator(".volume-cube__view").waitFor({ state: "visible", timeout: 300_000 });
  await page.waitForFunction(
    () => Boolean(document.querySelector(".volume-cube__view")?.getAttribute("data-channels")),
    null,
    { timeout: 300_000 },
  );
  for (let i = 0; i < 90; i++) {
    const ready = await page.evaluate(
      () => document.querySelector('[data-testid="inspect-pill"]')?.textContent?.includes("Ready"),
    );
    if (ready) break;
    await page.waitForTimeout(2000);
  }

  await openPanels(page);
  await page.waitForTimeout(5000);

  await page.locator(".landmarks").first().screenshot({ path: outPath });
  console.log("wrote", outPath, theme);
  await page.close();
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
  copyFileSync(ART_DARK, "/workspace/website/content/assets/landmarks_widget_dark.png");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
