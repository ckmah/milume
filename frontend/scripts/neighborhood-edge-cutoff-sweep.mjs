/**
 * Mouse brain ``small/`` edges-on toggle vs edge count (timing only, not colon).
 *
 *   node frontend/scripts/neighborhood-edge-cutoff-sweep.mjs
 */
import { writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";

const K = 12;
/** HF ``Stellaromics/demo/small/`` mouse brain (4,372 cells); last entry = whole slice. */
const SEED_SIZES = [
  1, 25, 50, 100, 150, 200, 295, 400, 600, 800, 1000, 1500, 2000, 2500, 3000,
  3500, 4000, 4372,
];

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const navStart = Date.now();
  await page.goto(
    "http://127.0.0.1:5173/?fixture=%2Fpyxa-small-fixture.json",
    { waitUntil: "networkidle" },
  );
  await page.waitForFunction(
    () => {
      const s = window.__landmarksEngine?.getPerfSnapshot?.();
      return s?.spatialIndexBuilt && s?.usingBinaryScatterColors;
    },
    { timeout: 180_000 },
  );
  const indexReady = await page.evaluate(() => ({
    spatialIndexReadyMs: window.__landmarksEngine.getPerfSnapshot().spatialIndexReadyMs,
    pointCount: window.__landmarksEngine.getPerfSnapshot().pointCount,
    wallMs: performance.now(),
  }));

  const rows = [];
  const n = indexReady.pointCount;
  for (const seedCount of SEED_SIZES) {
    const sc = Math.min(seedCount, n);
    await page.evaluate(async () => {
      await window.__harnessReset?.();
    });
    await page.waitForFunction(
      () => window.__landmarksEngine?.getPerfSnapshot?.().spatialIndexBuilt,
      { timeout: 180_000 },
    );
    const samples = [];
    for (let i = 0; i < 4; i++) {
      const r = await page.evaluate(
        async ({ sc, fresh, k }) => {
          const eng = window.__landmarksEngine;
          return eng.benchNeighborhoodToggle({
            seedCount: sc,
            mode: "knn",
            k,
            forceKnnEdges: true,
            offFirst: true,
            freshSelection: fresh,
          });
        },
        { sc, fresh: i === 0, k: K },
      );
      samples.push(r);
    }
    const first = samples[0].ms;
    const warm = [...samples.slice(1).map((s) => s.ms)].sort((a, b) => a - b);
    const warmMedian = warm[Math.floor(warm.length / 2)];
    const edgeCount = samples[0].edgeCount ?? 0;
    rows.push({
      seedCount: sc,
      predictedEdges: sc * K,
      edgeCount,
      knnEdgeLinesDrawn: samples[0].knnEdgeLinesDrawn,
      firstToggleMs: first,
      warmMedianMs: warmMedian,
      neighborQueryMs: samples[0].deckBuildProfile?.neighborQueryMs,
    });
    console.log(sc, edgeCount, first.toFixed(1), warmMedian.toFixed(1));
  }

  const crossing = rows.find((r) => r.warmMedianMs >= 200 || r.firstToggleMs >= 200);
  const out = {
    pointCount: n,
    k: K,
    indexReadyMs: indexReady.spatialIndexReadyMs,
    navToIndexWallMs: indexReady.wallMs,
    crossing200ms: crossing ?? null,
    rows,
  };
  const path = "/opt/cursor/artifacts/issue-92-pyxa-small-edge-cutoff-sweep.json";
  writeFileSync(path, JSON.stringify(out, null, 2));
  console.log("wrote", path);
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
