/**
 * Confirm first / warm toggle times at 358k colon (production cap).
 *   npm run dev:landmarks
 *   node frontend/scripts/neighborhood-colon-358k-cap-confirm.mjs
 */
import { writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";

import { median, p95 } from "./lib/neighborhood-sweep-stats.mjs";

const OUT = "/opt/cursor/artifacts/issue-92-colon-358k-cap-confirm.json";
const K = 12;
const RUNS = 5;
const WARM = 5;
const FIXTURE = "/colon-a2-fixture.json";

async function benchScenario(page, { seeds, forceKnnEdges, label }) {
  const firstToggles = [];
  const warmAll = [];
  let edgeCount = 0;
  let knnDrawn = false;

  for (let run = 0; run < RUNS; run++) {
    const seedIndices = await page.evaluate(
      ({ run, seeds }) => {
        const eng = window.__landmarksEngine;
        const pts = eng.getPoints().length;
        const sc = Math.min(seeds, Math.max(1, Math.floor(pts * 0.85)));
        const a = ((run + 1) * 73856093) ^ (seeds * 19349663) ^ (pts * 83492791);
        let x = a | 0;
        const rand = () => {
          x |= 0;
          x = (x + 0x6d2b79f5) | 0;
          let t = Math.imul(x ^ (x >>> 15), 1 | x);
          t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
          return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
        const idx = Array.from({ length: pts }, (_, i) => i);
        for (let i = 0; i < sc; i++) {
          const j = i + Math.floor(rand() * (pts - i));
          const tmp = idx[i];
          idx[i] = idx[j];
          idx[j] = tmp;
        }
        return idx.slice(0, sc);
      },
      { run, seeds },
    );

    const first = await page.evaluate(
      async ({ seedIndices, k, forceKnnEdges }) => {
        const eng = window.__landmarksEngine;
        return eng.benchNeighborhoodToggle({
          seedIndices,
          mode: "knn",
          k,
          forceKnnEdges,
          offFirst: true,
          freshSelection: true,
        });
      },
      { seedIndices, k: K, forceKnnEdges },
    );
    firstToggles.push(first.ms);
    edgeCount = Math.max(edgeCount, first.edgeCount ?? 0);
    knnDrawn = first.knnEdgeLinesDrawn;

    for (let w = 0; w < WARM; w++) {
      const warm = await page.evaluate(
        async ({ seedIndices, k, forceKnnEdges }) => {
          const eng = window.__landmarksEngine;
          return eng.benchNeighborhoodToggle({
            seedIndices,
            mode: "knn",
            k,
            forceKnnEdges,
            offFirst: true,
            freshSelection: false,
          });
        },
        { seedIndices, k: K, forceKnnEdges },
      );
      warmAll.push(warm.ms);
    }
    console.log(label, `run${run}`, "first", first.ms.toFixed(1), "warm0", warmAll[warmAll.length - WARM].toFixed(1));
  }

  return {
    seedTarget: seeds,
    k: K,
    forceKnnEdges,
    predictedEdges: seeds * K,
    edgeCount,
    knnEdgeLinesDrawn: knnDrawn,
    firstToggleMedianMs: median(firstToggles),
    firstToggleP95Ms: p95(firstToggles),
    warmMedianMs: median(warmAll),
    warmP95Ms: p95(warmAll),
    firstToggleSamples: firstToggles,
    warmSamples: warmAll,
  };
}

async function main() {
  const browser = await chromium.launch({ args: ["--disable-dev-shm-usage", "--no-sandbox"] });
  const page = await browser.newPage();
  page.setDefaultTimeout(300_000);
  await page.goto(`http://127.0.0.1:5173/?fixture=${encodeURIComponent(FIXTURE)}`, {
    waitUntil: "domcontentloaded",
    timeout: 600_000,
  });
  await page.evaluate(() => delete globalThis.__KNN_EDGE_MAX_OVERRIDE);
  await page.waitForFunction(
    () => window.__landmarksEngine?.getPerfSnapshot?.().spatialIndexBuilt,
    { timeout: 600_000 },
  );
  const pointCount = await page.evaluate(() => window.__landmarksEngine.getPoints().length);

  const atCap = await benchScenario(page, {
    seeds: 3000,
    forceKnnEdges: true,
    label: "3k@cap",
  });
  const overCap = await benchScenario(page, {
    seeds: 3500,
    forceKnnEdges: false,
    label: "3.5k>cap",
  });

  const out = {
    fixture: FIXTURE,
    pointCount,
    runs: RUNS,
    warmPerRun: WARM,
    benchNote:
      "Warm = hood off→on on same selection; focusGeomCache retained across off so geometry is reused.",
    atCap,
    overCap,
  };
  writeFileSync(OUT, JSON.stringify(out, null, 2));
  console.log("wrote", OUT);
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
