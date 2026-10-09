/**
 * Colon A2 subsample sweep: edges-on toggle vs edge count at tissue scale.
 *
 * Colon A2 tissue-scale sweep (positions + Cluster from colon rows only — not brain slices).
 *
 * Prerequisites:
 *   npm run dev:landmarks
 *   npm run dev:fixture:colon -- --cells 5000  (repeat for 10k, 25k, 50k, 100k; full optional)
 *
 *   node frontend/scripts/neighborhood-colon-subsample-sweep.mjs
 */
import { writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";

import {
  capFromFirstToggleP95,
  linReg,
  median,
  p95,
} from "./lib/neighborhood-sweep-stats.mjs";

const K = 12;
const CELL_SIZES = [5000, 10_000, 25_000, 50_000, 100_000, 358_173];
const SEED_TARGETS = [300, 3000, 10_000, 30_000];
const RUNS = 5;
const WARM_PER_RUN = 4;
const THRESHOLD_MS = 200;

function fixtureUrl(cellCount) {
  if (cellCount >= 358_173) return "/colon-a2-fixture.json";
  return `/colon-a2-n${cellCount}-fixture.json`;
}

async function benchOnce(page, { seedIndices, mode, fresh, k }) {
  return page.evaluate(
    async ({ seedIndices, mode, fresh, k }) => {
      const eng = window.__landmarksEngine;
      return eng.benchNeighborhoodToggle({
        seedIndices,
        mode,
        k,
        forceKnnEdges: true,
        offFirst: true,
        freshSelection: fresh,
      });
    },
    { seedIndices, mode, fresh, k },
  );
}

async function runScenario(page, { n, seedTarget, mode, runIndex }) {
  // Leave non-seed cells so k-NN has neighbor roles (whole-tissue seed sets are empty).
  const sc = Math.min(seedTarget, Math.max(1, Math.floor(n * 0.85)));
  const seedIndices = await page.evaluate(
    ({ n, sc, runIndex, mode, seedTarget }) => {
      function mulberry32(seed) {
        let a = seed | 0;
        return () => {
          a |= 0;
          a = (a + 0x6d2b79f5) | 0;
          let t = Math.imul(a ^ (a >>> 15), 1 | a);
          t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
          return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
      }
      const a =
        ((runIndex + 1) * 73856093) ^
        (seedTarget * 19349663) ^
        (mode === "radius" ? 0x9e3779b9 : 0x517cc1b7) ^
        (n * 83492791);
      const rand = mulberry32(a);
      const idx = Array.from({ length: n }, (_, i) => i);
      for (let i = 0; i < sc; i++) {
        const j = i + Math.floor(rand() * (n - i));
        const tmp = idx[i];
        idx[i] = idx[j];
        idx[j] = tmp;
      }
      return idx.slice(0, sc);
    },
    { n, sc, runIndex, mode, seedTarget },
  );

  const first = await benchOnce(page, { seedIndices, mode, fresh: true, k: K });
  const warm = [];
  for (let w = 0; w < WARM_PER_RUN; w++) {
    const r = await benchOnce(page, { seedIndices, mode, fresh: false, k: K });
    warm.push(r.ms);
  }
  return {
    firstToggleMs: first.ms,
    warmSamplesMs: warm,
    edgeCount: first.edgeCount ?? 0,
    predictedEdges: sc * K,
    knnEdgeLinesDrawn: first.knnEdgeLinesDrawn,
    neighborQueryMs: first.deckBuildProfile?.neighborQueryMs,
  };
}

async function loadFixture(page, cellCount) {
  const url = fixtureUrl(cellCount);
  await page.goto(`http://127.0.0.1:5173/?fixture=${encodeURIComponent(url)}`, {
    waitUntil: "networkidle",
  });
  await page.waitForFunction(
    () => {
      const s = window.__landmarksEngine?.getPerfSnapshot?.();
      return s?.spatialIndexBuilt && s?.usingBinaryScatterColors;
    },
    { timeout: cellCount >= 100_000 ? 600_000 : 300_000 },
  );
  const snap = await page.evaluate(() => window.__landmarksEngine.getPerfSnapshot());
  return { url, ...snap };
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const results = [];

  for (const cellCount of CELL_SIZES) {
    console.log("=== cells", cellCount, "===");
    let snap;
    try {
      snap = await loadFixture(page, cellCount);
    } catch (e) {
      console.error("skip", cellCount, e.message);
      results.push({ cellCount, error: String(e), scenarios: [] });
      continue;
    }
    const n = snap.pointCount;
    const scenarios = [];
    for (const seedTarget of SEED_TARGETS) {
      if (seedTarget > n) continue;
      const effectiveSeeds = Math.min(seedTarget, Math.max(1, Math.floor(n * 0.85)));
      if (effectiveSeeds < Math.min(50, seedTarget)) continue;
      for (const mode of ["knn", "radius"]) {
        const firstToggles = [];
        const warmAll = [];
        let edgeCount = 0;
        for (let run = 0; run < RUNS; run++) {
          const row = await runScenario(page, { n, seedTarget, mode, runIndex: run });
          firstToggles.push(row.firstToggleMs);
          warmAll.push(...row.warmSamplesMs);
          edgeCount = Math.max(edgeCount, row.edgeCount);
          console.log(
            cellCount,
            mode,
            seedTarget,
            `run${run}`,
            "first",
            row.firstToggleMs.toFixed(1),
            "edge",
            row.edgeCount,
          );
        }
        scenarios.push({
          seedTarget,
          seedCount: effectiveSeeds,
          mode,
          edgeCount,
          predictedEdges: Math.min(seedTarget, n) * (mode === "knn" ? K : 0),
          firstToggleMedianMs: median(firstToggles),
          firstToggleP95Ms: p95(firstToggles),
          warmMedianMs: median(warmAll),
          warmP95Ms: p95(warmAll),
          firstToggleSamples: firstToggles,
          warmSamples: warmAll,
        });
      }
    }
    results.push({
      cellCount,
      fixtureUrl: fixtureUrl(cellCount),
      pointCount: n,
      spatialIndexReadyMs: snap.spatialIndexReadyMs,
      scenarios,
    });
  }

  const fitRows = [];
  for (const block of results) {
    for (const s of block.scenarios ?? []) {
      if (s.mode !== "knn") continue;
      const predicted = s.seedCount * K;
      fitRows.push({
        cellCount: block.pointCount,
        seedCount: s.seedCount,
        edgeCount: s.edgeCount,
        predictedEdges: predicted,
        firstToggleP95Ms: s.firstToggleP95Ms,
      });
    }
  }
  fitRows.sort((a, b) => a.edgeCount - b.edgeCount);
  const fitEdges = linReg(
    fitRows.map((r) => r.predictedEdges),
    fitRows.map((r) => r.firstToggleP95Ms),
  );
  const fitEdgesActual = linReg(
    fitRows.map((r) => r.edgeCount),
    fitRows.map((r) => r.firstToggleP95Ms),
  );
  const fitCells = linReg(
    fitRows.map((r) => r.cellCount),
    fitRows.map((r) => r.firstToggleP95Ms),
  );
  const capRows = fitRows.map((r) => ({
    edgeCount: r.predictedEdges,
    firstToggleP95: r.firstToggleP95Ms,
  }));
  const { cap, crossing } = capFromFirstToggleP95(capRows, THRESHOLD_MS);

  const out = {
    dataset: "Stellaromics/demo colon A2 (pyxa_studio_v1 + cell_metadata, Studio-kept)",
    k: K,
    runsPerScenario: RUNS,
    warmTogglesPerRun: WARM_PER_RUN,
    thresholdMs: THRESHOLD_MS,
    capRule: "first-toggle p95 >= thresholdMs",
    recommendedKnnEdgeMaxEdgeCount: cap,
    crossingFirstToggleP95: crossing,
    fitFirstToggleP95VsPredictedEdges: fitEdges,
    fitFirstToggleP95VsActualEdges: fitEdgesActual,
    fitFirstToggleP95VsCellCount: fitCells,
    blocks: results,
  };
  const path = "/opt/cursor/artifacts/issue-92-colon-a2-subsample-sweep.json";
  writeFileSync(path, JSON.stringify(out, null, 2));
  console.log("wrote", path, "cap", cap);
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
