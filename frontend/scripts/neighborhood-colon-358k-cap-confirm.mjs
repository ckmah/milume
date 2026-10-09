/**
 * Confirm first-toggle p95 at 358k colon, ~3k seeds, k=12 (production cap check).
 *   npm run dev:landmarks
 *   node frontend/scripts/neighborhood-colon-358k-cap-confirm.mjs
 */
import { writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";

import { median, p95 } from "./lib/neighborhood-sweep-stats.mjs";

const OUT = "/opt/cursor/artifacts/issue-92-colon-358k-cap-confirm.json";
const K = 12;
const SEEDS = 3000;
const RUNS = 5;
const WARM = 4;
const FIXTURE = "/colon-a2-fixture.json";

async function main() {
  const browser = await chromium.launch({ args: ["--disable-dev-shm-usage", "--no-sandbox"] });
  const context = await browser.newContext();
  const page = await context.newPage();
  page.setDefaultTimeout(300_000);
  await page.goto(`http://127.0.0.1:5173/?fixture=${encodeURIComponent(FIXTURE)}`, {
    waitUntil: "domcontentloaded",
    timeout: 600_000,
  });
  await page.evaluate(() => {
    delete globalThis.__KNN_EDGE_MAX_OVERRIDE;
  });
  await page.waitForFunction(
    () => window.__landmarksEngine?.getPerfSnapshot?.().spatialIndexBuilt,
    { timeout: 600_000 },
  );
  const n = await page.evaluate(() => window.__landmarksEngine.getPoints().length);

  const firstToggles = [];
  const warmAll = [];
  let edgeCount = 0;

  for (let run = 0; run < RUNS; run++) {
    const row = await page.evaluate(
      async ({ run, seeds, k }) => {
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
        const seedIndices = idx.slice(0, sc);
        const first = await eng.benchNeighborhoodToggle({
          seedIndices,
          mode: "knn",
          k,
          forceKnnEdges: true,
          offFirst: true,
          freshSelection: true,
        });
        const warm = [];
        for (let w = 0; w < 4; w++) {
          const r = await eng.benchNeighborhoodToggle({
            seedIndices,
            mode: "knn",
            k,
            forceKnnEdges: true,
            offFirst: true,
            freshSelection: false,
          });
          warm.push(r.ms);
        }
        return {
          seedCount: sc,
          firstToggleMs: first.ms,
          warmSamplesMs: warm,
          edgeCount: first.edgeCount ?? 0,
          knnEdgeLinesDrawn: first.knnEdgeLinesDrawn,
        };
      },
      { run, seeds: SEEDS, k: K },
    );
    firstToggles.push(row.firstToggleMs);
    warmAll.push(...row.warmSamplesMs);
    edgeCount = Math.max(edgeCount, row.edgeCount);
    console.log("run", run, "first", row.firstToggleMs.toFixed(1), "edges", row.edgeCount, "drawn", row.knnEdgeLinesDrawn);
  }

  const out = {
    fixture: FIXTURE,
    pointCount: n,
    seedTarget: SEEDS,
    seedCount: Math.min(SEEDS, Math.floor(n * 0.85)),
    k: K,
    predictedEdges: Math.min(SEEDS, Math.floor(n * 0.85)) * K,
    runs: RUNS,
    edgeCount,
    firstToggleMedianMs: median(firstToggles),
    firstToggleP95Ms: p95(firstToggles),
    warmMedianMs: median(warmAll),
    warmP95Ms: p95(warmAll),
    firstToggleSamples: firstToggles,
    warmSamples: warmAll,
  };
  writeFileSync(OUT, JSON.stringify(out, null, 2));
  console.log("wrote", OUT, JSON.stringify({ first: out.firstToggleMedianMs, p95: out.firstToggleP95Ms }));
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
