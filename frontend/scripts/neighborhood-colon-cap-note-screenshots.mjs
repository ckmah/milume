/**
 * Selection hover cards on colon 10k: under vs over production k-NN edge cap (36k).
 *   npm run dev:landmarks
 *   node frontend/scripts/neighborhood-colon-cap-note-screenshots.mjs
 */
import { chromium } from "@playwright/test";

const FIXTURE = "/colon-a2-n10000-fixture.json";
const K = 12;
const UNDER_SEEDS = 2500;
const OVER_SEEDS = 3500;

async function boot(page) {
  await page.goto(
    `http://127.0.0.1:5173/?fixture=${encodeURIComponent(FIXTURE)}`,
    { waitUntil: "domcontentloaded", timeout: 120_000 },
  );
  await page.evaluate(() => {
    delete globalThis.__KNN_EDGE_MAX_OVERRIDE;
  });
  await page.waitForFunction(
    () => window.__landmarksEngine?.getPerfSnapshot?.().spatialIndexBuilt,
    { timeout: 120_000 },
  );
}

async function setKnn(page, seeds, id) {
  await page.evaluate(
    ({ seeds, id, k }) => {
      const model = window.__landmarksModel;
      model.set("selections", [
        {
          id,
          type: "points",
          point_indices: seeds,
          neighborhood: "knn",
          neighborhood_k: k,
        },
      ]);
      model.set("selected_kind", "selection");
      model.set("selected_index", 0);
      model.save_changes();
    },
    { seeds, id, k: K },
  );
}

async function shotCard(page, outPath) {
  const left = page.locator(".landmarks__chrome-dock--left");
  if ((await left.getAttribute("data-collapsed")) === "true") {
    await page.getByRole("button", { name: "Show left panel" }).click();
  }
  await page.locator("canvas.landmarks__webgl").first().hover();
  await page.getByTestId("selection-row").first().hover();
  await page.waitForTimeout(600);
  const card = page.getByTestId("selection-card");
  await card.waitFor({ state: "visible", timeout: 15_000 });
  await card.screenshot({ path: outPath });
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await boot(page);

  const under = Array.from({ length: UNDER_SEEDS }, (_, i) => i);
  await setKnn(page, under, "cap-under");
  await shotCard(
    page,
    `/opt/cursor/artifacts/issue-92-knn-edge-cap-note-colon-seeds${UNDER_SEEDS}-k${K}-under.png`,
  );

  const over = Array.from({ length: OVER_SEEDS }, (_, i) => i);
  await setKnn(page, over, "cap-over");
  await shotCard(
    page,
    `/opt/cursor/artifacts/issue-92-knn-edge-cap-note-colon-seeds${OVER_SEEDS}-k${K}-over.png`,
  );

  await browser.close();
  console.log("saved colon cap note screenshots", UNDER_SEEDS, OVER_SEEDS, "k=", K);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
