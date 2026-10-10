/**
 * Capture colon A2 README / landing hero (mosaic under cells + one selection).
 * Prereq: colon zarr + fixture (export-colon-a2-volume-hero.py --hero) and
 * `MILUME_VOLUME_PROFILE=colon npm run dev:landmarks-volume` (default port 5173).
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
      if (j.volume?.image_url?.includes("colon_a2") && j.map_mosaic_url) {
        return `http://localhost:${port}/`;
      }
    } catch {
      /* try next port */
    }
  }
  throw new Error("no colon volume harness found on ports 5173-5175");
}

async function captureTheme(browser, theme, outPath, baseUrl) {
  const page = await browser.newPage({ viewport: VIEWPORT });
  const mosaicReady = page.waitForResponse(
    (res) => res.url().includes("colon-map-mip.png") && res.status() === 200,
    { timeout: 600_000 },
  );
  await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 600_000 });
  await mosaicReady;
  await page.waitForFunction(
    () => window.__landmarksEngine?.getPerfSnapshot?.().spatialIndexBuilt,
    { timeout: 600_000 },
  );
  await applyTheme(page, theme);
  await page.addStyleTag({
    content: ".dialkit-root, [class*='dialkit'] { display: none !important; }",
  });

  await page.getByRole("radio", { name: "Select", exact: true }).click();
  await page.evaluate(() => {
    window.__landmarksModel?.set?.("mode", "select");
    window.__landmarksModel?.save_changes?.();
  });
  await page.waitForTimeout(400);

  const row = page.getByTestId("selection-row").first();
  await row.waitFor({ state: "visible", timeout: 120_000 });
  await row.hover();
  await page.getByTestId("selection-card").waitFor({ state: "visible", timeout: 60_000 });
  await page.waitForTimeout(2500);

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
