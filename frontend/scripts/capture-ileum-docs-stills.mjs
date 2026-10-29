/**
 * Recapture simple 2D docs harness stills on ileum-fixture.json (dark + light).
 * Run: cd frontend && npm run dev:fixture:ileum && npm run dev &
 *   node scripts/capture-ileum-docs-stills.mjs
 */
import { mkdirSync } from "node:fs";
import { chromium } from "@playwright/test";

const BASE = process.env.LANDMARKS_URL ?? "http://127.0.0.1:5173";
const FIXTURE = "/ileum-fixture.json";

const shots = [
  {
    outDir: "/workspace/website/content/assets/tools/landmarks",
    name: "hero",
    json: { dataset: "demos/data:ileum", seed: 0, milume: "tier343" },
  },
  {
    outDir: "/workspace/website/content/assets/tools/navigate",
    name: "hero",
    json: { dataset: "demos/data:ileum", seed: 0, milume: "tier343" },
  },
  {
    outDir: "/workspace/website/content/assets/tools/select-regions",
    name: "hero",
    json: { dataset: "demos/data:ileum", seed: 0, milume: "tier343" },
  },
];

async function capture(page, theme, outDir, name) {
  await page.addInitScript((t) => {
    localStorage.setItem("milume-harness-theme", t);
  }, theme);
  await page.goto(`${BASE}/?fixture=${encodeURIComponent(FIXTURE)}`, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForFunction(
    () => window.__landmarksEngine?.getPerfSnapshot?.().spatialIndexBuilt,
    { timeout: 120_000 },
  );
  await page.waitForTimeout(400);
  await page.locator(".landmarks").first().screenshot({
    path: `${outDir}/${name}.${theme}.png`,
  });
}

async function main() {
  for (const { outDir, name, json } of shots) {
    mkdirSync(outDir, { recursive: true });
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
    for (const theme of ["dark", "light"]) {
      await capture(page, theme, outDir, name);
    }
    await browser.close();
    const { writeFileSync } = await import("node:fs");
    writeFileSync(`${outDir}/${name}.json`, `${JSON.stringify(json, null, 1)}\n`);
    console.log("captured", outDir, name);
  }
}

main();
