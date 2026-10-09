/**
 * End-to-end neighborhood toggle: first vs warm medians + KD-tree ready time.
 *
 *   node frontend/scripts/neighborhood-toggle-bench.mjs
 *   PYXA_SMALL=1 node frontend/scripts/neighborhood-toggle-bench.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const here = dirname(fileURLToPath(import.meta.url));
const PYXA_SMALL = !!process.env.PYXA_SMALL;
const fixtureUrl = PYXA_SMALL ? "/pyxa-small-fixture.json" : "/fixture.json";

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
    { timeout: PYXA_SMALL ? 120_000 : 60_000 },
  );
  const samples = [];
  for (let i = 0; i < 5; i++) {
    const r = await page.evaluate(
      async ({ seedCount, mode, fresh }) => {
        const eng = window.__landmarksEngine;
        return eng.benchNeighborhoodToggle({
          seedCount,
          mode,
          offFirst: true,
          freshSelection: fresh,
        });
      },
      { seedCount, mode, fresh: i === 0 },
    );
    samples.push(r.ms);
  }
  return {
    seedCount,
    mode,
    firstToggleMs: samples[0],
    warmMedianMs: median(samples.slice(1)),
    samples,
  };
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:5173/?fixture=${encodeURIComponent(fixtureUrl)}`, {
    waitUntil: "networkidle",
  });
  await page.waitForFunction(
    () => {
      const s = window.__landmarksEngine?.getPerfSnapshot?.();
      return s?.spatialIndexBuilt && s?.usingBinaryScatterColors;
    },
    { timeout: PYXA_SMALL ? 120_000 : 60_000 },
  );
  const indexReady = await page.evaluate(() => window.__landmarksEngine.getPerfSnapshot());

  const label = PYXA_SMALL ? "pyxa-small-hf" : "pyxa-xsmall-ci";
  const cases = PYXA_SMALL
    ? [
        { seedCount: 1, mode: "knn" },
        { seedCount: 295, mode: "knn" },
        { seedCount: 1500, mode: "knn" },
        { seedCount: 4372, mode: "knn" },
        { seedCount: 295, mode: "radius" },
        { seedCount: 1500, mode: "radius" },
        { seedCount: 4372, mode: "radius" },
      ]
    : [
        { seedCount: 50, mode: "knn" },
        { seedCount: 150, mode: "knn" },
        { seedCount: 187, mode: "knn" },
      ];

  const rows = [];
  for (const c of cases) {
    rows.push(await runCase(page, c));
  }
  const out = {
    label,
    fixtureUrl,
    pointCount: indexReady.pointCount,
    spatialIndexReadyMs: indexReady.spatialIndexReadyMs,
    rows,
  };
  const outPath = join("/opt/cursor/artifacts", `issue-92-e2e-bench-${label}.json`);
  writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
