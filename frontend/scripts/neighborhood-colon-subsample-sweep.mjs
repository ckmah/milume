/**
 * Colon A2 subsample sweep (positions + Cluster from colon rows only).
 *
 *   npm run dev:landmarks
 *   npm run dev:fixture:colon -- --cells 5000   # … 10k, 25k, 50k, 100k; full = 358k
 *   node frontend/scripts/neighborhood-colon-subsample-sweep.mjs
 */
import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";

import {
  capFromFirstToggleP95,
  linReg,
  median,
  p95,
} from "./lib/neighborhood-sweep-stats.mjs";

const OUT_PATH = "/opt/cursor/artifacts/issue-92-colon-a2-subsample-sweep.json";
const K = 12;
const CELL_SIZES = [5000, 10_000, 25_000, 50_000, 100_000, 358_173];
const SEED_TARGETS = [300, 3000, 10_000, 30_000];
const FALLBACK_SEED_TARGETS = [300, 1500, 3000, 5000];
const RUNS = 5;
const WARM_PER_RUN = 4;
const THRESHOLD_MS = 200;
const TRIAL_TIMEOUT_MS = Number(process.env.SWEEP_TRIAL_TIMEOUT_MS || 240_000);

function fixtureUrl(cellCount) {
  if (cellCount >= 358_173) return "/colon-a2-fixture.json";
  return `/colon-a2-n${cellCount}-fixture.json`;
}

function effectiveSeedCount(n, seedTarget) {
  return Math.min(seedTarget, Math.max(1, Math.floor(n * 0.85)));
}

function defaultState() {
  return {
    dataset:
      "Stellaromics/demo colon A2 (colon rows only; positions + Cluster paired)",
    k: K,
    runsPerScenario: RUNS,
    warmTogglesPerRun: WARM_PER_RUN,
    thresholdMs: THRESHOLD_MS,
    capRule: "first-toggle p95 >= thresholdMs on k-NN (predicted edges = seeds×k)",
    trials: [],
    blockErrors: [],
    largestCompletedCellCount: 0,
    status: "running",
  };
}

function loadState() {
  try {
    return JSON.parse(readFileSync(OUT_PATH, "utf8"));
  } catch {
    return defaultState();
  }
}

function aggregateTrials(trials) {
  const byKey = new Map();
  for (const t of trials) {
    if (t.error) continue;
    const key = `${t.cellCount}|${t.mode}|${t.seedTarget}`;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(t);
  }
  const blocks = new Map();
  for (const [key, rows] of byKey) {
    const [cellCount, mode, seedTarget] = key.split("|");
    const firstToggles = rows.map((r) => r.firstToggleMs);
    const warmAll = rows.flatMap((r) => r.warmSamplesMs);
    const edgeCount = Math.max(...rows.map((r) => r.edgeCount ?? 0));
    const sample = rows[0];
    const blockKey = cellCount;
    if (!blocks.has(blockKey)) {
      blocks.set(blockKey, {
        cellCount: Number(cellCount),
        fixtureUrl: fixtureUrl(Number(cellCount)),
        pointCount: sample.pointCount,
        spatialIndexReadyMs: sample.spatialIndexReadyMs,
        scenarios: [],
      });
    }
    blocks.get(blockKey).scenarios.push({
      seedTarget: Number(seedTarget),
      seedCount: sample.seedCount,
      mode,
      edgeCount,
      predictedEdges: sample.predictedEdges,
      firstToggleMedianMs: median(firstToggles),
      firstToggleP95Ms: p95(firstToggles),
      warmMedianMs: median(warmAll),
      warmP95Ms: p95(warmAll),
      firstToggleSamples: firstToggles,
      warmSamples: warmAll,
    });
  }
  return [...blocks.values()].sort((a, b) => a.cellCount - b.cellCount);
}

function finalize(state) {
  const blocks = aggregateTrials(state.trials);
  const fitRows = [];
  for (const block of blocks) {
    for (const s of block.scenarios) {
      if (s.mode !== "knn" || !s.predictedEdges) continue;
      fitRows.push({
        cellCount: block.pointCount,
        seedCount: s.seedCount,
        edgeCount: s.edgeCount,
        predictedEdges: s.predictedEdges,
        firstToggleP95Ms: s.firstToggleP95Ms,
      });
    }
  }
  fitRows.sort((a, b) => a.predictedEdges - b.predictedEdges);
  const fitPredicted = fitRows.length >= 2
    ? linReg(
        fitRows.map((r) => r.predictedEdges),
        fitRows.map((r) => r.firstToggleP95Ms),
      )
    : { intercept: 0, slope: 0, r2: 0 };
  const fitActual = fitRows.length >= 2
    ? linReg(
        fitRows.map((r) => r.edgeCount),
        fitRows.map((r) => r.firstToggleP95Ms),
      )
    : { intercept: 0, slope: 0, r2: 0 };
  const fitCells = fitRows.length >= 2
    ? linReg(
        fitRows.map((r) => r.cellCount),
        fitRows.map((r) => r.firstToggleP95Ms),
      )
    : { intercept: 0, slope: 0, r2: 0 };
  const capRows = fitRows.map((r) => ({
    edgeCount: r.predictedEdges,
    firstToggleP95: r.firstToggleP95Ms,
  }));
  const { cap, crossing } = capFromFirstToggleP95(capRows, THRESHOLD_MS);
  const completed = blocks.map((b) => b.cellCount);
  const largestCompleted = completed.length ? Math.max(...completed) : 0;
  return {
    ...state,
    blocks,
    fitFirstToggleP95VsPredictedEdges: fitPredicted,
    fitFirstToggleP95VsActualEdges: fitActual,
    fitFirstToggleP95VsCellCount: fitCells,
    recommendedKnnEdgeMaxEdgeCount: cap,
    crossingFirstToggleP95: crossing,
    largestCompletedCellCount: largestCompleted,
    status: state.status,
  };
}

function persist(state, retries = 5) {
  const body = JSON.stringify(finalize(state), null, 2);
  const tmp = `${OUT_PATH}.tmp`;
  for (let i = 0; i < retries; i++) {
    try {
      writeFileSync(tmp, body);
      renameSync(tmp, OUT_PATH);
      return;
    } catch (e) {
      if (i === retries - 1) throw e;
    }
  }
}

function trialDone(state, trial) {
  state.trials.push(trial);
  persist(state);
}

async function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`trial timeout (${label}) after ${ms}ms`)),
      ms,
    );
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
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
  const sc = effectiveSeedCount(n, seedTarget);
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
    seedCount: sc,
    predictedEdges: mode === "knn" ? sc * K : 0,
    firstToggleMs: first.ms,
    warmSamplesMs: warm,
    edgeCount: first.edgeCount ?? 0,
    knnEdgeLinesDrawn: first.knnEdgeLinesDrawn,
    neighborQueryMs: first.deckBuildProfile?.neighborQueryMs,
  };
}

async function loadFixture(page, cellCount) {
  const url = fixtureUrl(cellCount);
  const navTimeout = cellCount >= 100_000 ? 600_000 : 300_000;
  await page.goto(`http://127.0.0.1:5173/?fixture=${encodeURIComponent(url)}`, {
    waitUntil: "domcontentloaded",
    timeout: navTimeout,
  });
  await page.waitForFunction(
    () => {
      const s = window.__landmarksEngine?.getPerfSnapshot?.();
      return s?.spatialIndexBuilt && s?.usingBinaryScatterColors;
    },
    { timeout: navTimeout },
  );
  const snap = await page.evaluate(() => window.__landmarksEngine.getPerfSnapshot());
  return { url, ...snap };
}

function trialKey(cellCount, mode, seedTarget, runIndex) {
  return `${cellCount}:${mode}:${seedTarget}:run${runIndex}`;
}

function alreadyRan(state, cellCount, mode, seedTarget, runIndex) {
  const id = trialKey(cellCount, mode, seedTarget, runIndex);
  return state.trials.some((t) => t.id === id && !t.error);
}

async function runBlock(browser, state, cellCount, seedTargets) {
  const context = await browser.newContext();
  const page = await context.newPage();
  page.setDefaultTimeout(TRIAL_TIMEOUT_MS);
  let snap;
  try {
    snap = await loadFixture(page, cellCount);
  } catch (e) {
    state.blockErrors.push({
      cellCount,
      phase: "load",
      message: String(e?.message || e),
    });
    persist(state);
    await context.close();
    return "load_failed";
  }
  const n = snap.pointCount;
  for (const seedTarget of seedTargets) {
    if (seedTarget > n) continue;
    const sc = effectiveSeedCount(n, seedTarget);
    if (sc < Math.min(50, seedTarget)) continue;
    for (const mode of ["knn", "radius"]) {
      for (let run = 0; run < RUNS; run++) {
        const id = trialKey(cellCount, mode, seedTarget, run);
        if (alreadyRan(state, cellCount, mode, seedTarget, run)) continue;
        const label = `${cellCount} ${mode} seeds=${seedTarget} run${run}`;
        try {
          const row = await withTimeout(
            runScenario(page, { n, seedTarget, mode, runIndex: run }),
            TRIAL_TIMEOUT_MS,
            label,
          );
          trialDone(state, {
            id,
            cellCount,
            pointCount: n,
            spatialIndexReadyMs: snap.spatialIndexReadyMs,
            seedTarget,
            seedCount: row.seedCount,
            mode,
            runIndex: run,
            ...row,
          });
          console.log(
            label,
            "first",
            row.firstToggleMs.toFixed(1),
            "edge",
            row.edgeCount,
          );
        } catch (e) {
          const msg = String(e?.message || e);
          console.error("FAIL", label, msg);
          trialDone(state, {
            id,
            cellCount,
            pointCount: n,
            spatialIndexReadyMs: snap.spatialIndexReadyMs,
            seedTarget,
            seedCount: sc,
            mode,
            runIndex: run,
            error: msg,
          });
          state.blockErrors.push({ cellCount, phase: "trial", trial: id, message: msg });
          persist(state);
          if (/context was destroyed|crash|OOM|out of memory|target closed/i.test(msg)) {
            await context.close();
            return "fatal";
          }
        }
      }
    }
  }
  state.largestCompletedCellCount = Math.max(state.largestCompletedCellCount, cellCount);
  persist(state);
  await context.close();
  return "ok";
}

async function main() {
  const resume = process.env.SWEEP_RESUME === "1";
  const state = resume ? loadState() : defaultState();
  if (resume) state.status = "running";
  else persist(state);

  const browser = await chromium.launch({
    args: ["--disable-dev-shm-usage", "--no-sandbox"],
  });

  for (const cellCount of CELL_SIZES) {
    console.log("=== cells", cellCount, "===");
    let result = await runBlock(browser, state, cellCount, SEED_TARGETS);
    if (result === "fatal" && cellCount >= 50_000) {
      console.log("=== fallback seeds at", cellCount, "===");
      result = await runBlock(browser, state, cellCount, FALLBACK_SEED_TARGETS);
    }
    if (result === "load_failed") {
      state.blockErrors.push({ cellCount, phase: "load", message: "skipped size" });
      persist(state);
      continue;
    }
    if (result === "fatal") {
      state.status = `stopped_after_${cellCount}`;
      persist(state);
      console.error("Stopping sweep after fatal failure at", cellCount);
      break;
    }
  }

  state.status = state.status === "running" ? "complete" : state.status;
  persist(state);
  const final = finalize(state);
  console.log(
    "wrote",
    OUT_PATH,
    "cap",
    final.recommendedKnnEdgeMaxEdgeCount,
    "largest",
    final.largestCompletedCellCount,
  );
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
