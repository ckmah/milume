/**
 * Screenshots for PR artifacts: small (edges on) + colon-scale per cap.
 * Reads cap from issue-92-colon-a2-subsample-sweep.json when present.
 */
import { readFileSync } from "node:fs";
import { chromium } from "@playwright/test";

const K = 12;
const SWEEP_PATH = "/opt/cursor/artifacts/issue-92-colon-a2-subsample-sweep.json";

function loadCap() {
  try {
    const j = JSON.parse(readFileSync(SWEEP_PATH, "utf8"));
    return j.recommendedKnnEdgeMaxEdgeCount ?? null;
  } catch {
    return null;
  }
}

function pickColonFixture(blocks) {
  if (!blocks?.length) return { url: "/colon-a2-n25000-fixture.json", n: 25000 };
  const largest = blocks[blocks.length - 1];
  return { url: largest.fixtureUrl, n: largest.pointCount };
}

async function applyKnn(page, seedIndices, k = 12) {
  await page.evaluate(
    ({ seedIndices, k }) => {
      const model = window.__landmarksModel;
      model.set("selections", [
        {
          id: "screenshot-knn",
          type: "points",
          point_indices: seedIndices,
          neighborhood: "knn",
          neighborhood_k: k,
        },
      ]);
      model.set("selected_kind", "selection");
      model.set("selected_index", 0);
      model.save_changes();
    },
    { seedIndices, k },
  );
  await page.waitForTimeout(400);
}

async function main() {
  const cap = loadCap();
  let colonPick = { url: "/colon-a2-n25000-fixture.json", n: 25000 };
  try {
    const j = JSON.parse(readFileSync(SWEEP_PATH, "utf8"));
    colonPick = pickColonFixture(j.blocks);
  } catch {
    /* use default */
  }

  const browser = await chromium.launch();
  const page = await browser.newPage();

  // Small (mouse brain CI fixture) — edges on
  await page.goto("http://127.0.0.1:5173/", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.__landmarksEngine?.getPerfSnapshot?.().spatialIndexBuilt);
  const smallSeeds = Array.from({ length: 30 }, (_, i) => i);
  await applyKnn(page, smallSeeds);
  await page.locator(".landmarks").first().screenshot({
    path: "/opt/cursor/artifacts/issue-92-neighbors-knn-small-with-edges.png",
  });

  // Colon-scale: above cap → edges suppressed; below cap → edges on
  const ctx2 = await browser.newContext();
  const colonPage = await ctx2.newPage();
  await colonPage.goto(
    `http://127.0.0.1:5173/?fixture=${encodeURIComponent(colonPick.url)}`,
    { waitUntil: "domcontentloaded", timeout: 300_000 },
  );
  await colonPage.waitForFunction(
    () => window.__landmarksEngine?.getPerfSnapshot?.().spatialIndexBuilt,
    { timeout: 300_000 },
  );
  const n = await colonPage.evaluate(() => window.__landmarksEngine.getPoints().length);
  const predictedCap = cap != null ? cap : 50_000;
  const seedsOver = Math.min(n - 1, Math.ceil(predictedCap / K) + 500);
  const seedsUnder = Math.min(300, Math.floor(n * 0.05));
  const forceEdges = async (seedCount, outPath) => {
    const sc = Math.min(seedCount, Math.max(1, Math.floor(n * 0.85)));
    const seedIndices = Array.from({ length: sc }, (_, i) => i);
    await colonPage.evaluate(() => window.__harnessReset?.());
    await colonPage.waitForFunction(() => window.__landmarksEngine?.getPerfSnapshot?.().spatialIndexBuilt);
    await colonPage.evaluate(
      ({ seedIndices }) => {
        const model = window.__landmarksModel;
        model.set("selections", [
          {
            id: "shot",
            type: "points",
            point_indices: seedIndices,
            neighborhood: "knn",
            neighborhood_k: 12,
          },
        ]);
        model.set("selected_kind", "selection");
        model.set("selected_index", 0);
        model.save_changes();
      },
      { seedIndices },
    );
    await colonPage.waitForTimeout(800);
    await colonPage.locator(".landmarks").first().screenshot({ path: outPath });
  };

  if (cap != null && seedsOver * K > cap) {
    await forceEdges(
      seedsOver,
      "/opt/cursor/artifacts/issue-92-neighbors-knn-colon-large-cap-applied.png",
    );
  } else {
    await forceEdges(
      Math.min(3000, n),
      "/opt/cursor/artifacts/issue-92-neighbors-knn-colon-large-with-edges.png",
    );
  }

  await browser.close();
  console.log("screenshots saved; cap=", cap, "colon", colonPick.url);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
