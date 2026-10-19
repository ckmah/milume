/**
 * Doc stills for integrations/squidpy-color (dev harness fixtures).
 * Run: cd frontend && npm run dev (default harness), then node scripts/squidpy-color-recipes-screenshots.mjs
 */
import { mkdirSync } from "node:fs";
import { chromium } from "@playwright/test";

const OUT = "/workspace/website/content/assets/integrations/squidpy-color";
const shots = [
  { fixture: "/squidpy-niche-fixture.json", name: "still-niche" },
  { fixture: "/squidpy-moran-fixture.json", name: "still-moran" },
];

async function capture(page, theme, fixture, name) {
  await page.addInitScript((t) => {
    localStorage.setItem("milume-harness-theme", t);
  }, theme);
  await page.goto(`http://localhost:5173/?fixture=${encodeURIComponent(fixture)}`, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForFunction(
    () => window.__landmarksEngine?.getPerfSnapshot?.().spatialIndexBuilt,
    { timeout: 60_000 },
  );
  await page.waitForTimeout(300);
  await page.locator(".landmarks").first().screenshot({
    path: `${OUT}/${name}.${theme}.png`,
  });
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1100, height: 720 } });
  for (const { fixture, name } of shots) {
    await capture(page, "dark", fixture, name);
    await capture(page, "light", fixture, name);
  }
  await browser.close();
}

main();
