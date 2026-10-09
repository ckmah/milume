/**
 * End-to-end neighborhood toggle medians via Playwright harness.
 *
 *   FIXTURE=frontend/dev/fixture.json node frontend/scripts/neighborhood-toggle-bench.mjs
 *   FIXTURE=frontend/dev/colon-a2-fixture.json COLON=1 node frontend/scripts/neighborhood-toggle-bench.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const here = dirname(fileURLToPath(import.meta.url));
const frontendRoot = join(here, "..");
const fixturePath =
  process.env.FIXTURE || join(frontendRoot, "dev/fixture.json");
const fixture = JSON.parse(readFileSync(fixturePath, "utf8"));

function median(samples) {
  const s = [...samples].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

async function runCase(page, { seedCount, mode }) {
  await page.evaluate(async () => {
    await window.__harnessReset?.();
  });
  await page.waitForFunction(
    () => {
      const s = window.__landmarksEngine?.getPerfSnapshot?.();
      return s?.spatialIndexBuilt && s?.usingBinaryScatterColors;
    },
    { timeout: 120_000 },
  );
  const samples = [];
  for (let i = 0; i < 5; i++) {
    const r = await page.evaluate(
      async ({ seedCount, mode }) => {
        const eng = window.__landmarksEngine;
        return eng.benchNeighborhoodToggle({ seedCount, mode, offFirst: true });
      },
      { seedCount, mode },
    );
    samples.push(r.ms);
    if (r.deckBuildProfile) {
      samples._profile = r.deckBuildProfile;
    }
  }
  return {
    seedCount,
    mode,
    median_ms: median(samples),
    samples,
    deckBuildProfile: samples._profile,
  };
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const fixtureUrl = process.env.COLON
    ? "/colon-a2-scale-fixture.json"
    : "/fixture.json";
  await page.goto(`http://127.0.0.1:5173/?fixture=${encodeURIComponent(fixtureUrl)}`, {
    waitUntil: "networkidle",
  });
  await page.locator(".landmarks").first().waitFor({ state: "visible" });
  await page.waitForFunction(() => window.__landmarksEngine?.getPerfSnapshot?.().pointCount > 0);
  await page.waitForTimeout(800);
  await page.waitForFunction(
    () => {
      const s = window.__landmarksEngine?.getPerfSnapshot?.();
      return s?.spatialIndexBuilt && s?.usingBinaryScatterColors;
    },
    { timeout: 120_000 },
  );

  const label = process.env.COLON ? "colon-a2" : "pyxa-small";
  const cases =
    process.env.COLON
      ? [
          { seedCount: 1, mode: "knn" },
          { seedCount: 300, mode: "knn" },
          { seedCount: 3000, mode: "knn" },
          { seedCount: 10000, mode: "knn" },
          { seedCount: 300, mode: "radius" },
          { seedCount: 3000, mode: "radius" },
        ]
      : [
          { seedCount: 295, mode: "knn" },
          { seedCount: 1500, mode: "knn" },
          { seedCount: 295, mode: "radius" },
          { seedCount: 1500, mode: "radius" },
        ];

  const rows = [];
  for (const c of cases) {
    rows.push(await runCase(page, c));
  }
  const out = {
    label,
    fixture: fixturePath,
    pointCount: await page.evaluate(() =>
      window.__landmarksEngine.getPerfSnapshot().pointCount,
    ),
    rows,
  };
  const outPath = join(
    "/opt/cursor/artifacts",
    `issue-92-e2e-bench-${label}.json`,
  );
  writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
