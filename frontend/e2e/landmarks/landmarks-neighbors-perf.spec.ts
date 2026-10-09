import { expect, type Page } from "@playwright/test";

import { test } from "../fixtures";

import { bootLandmarksHarness, setModel } from "../helpers";

async function ensureLeftPanelOpen(page: Page) {
  const left = page.locator(".landmarks__chrome-dock--left");
  if ((await left.getAttribute("data-collapsed")) === "true") {
    await page.getByRole("button", { name: "Show left panel" }).click();
  }
  await expect(left).toHaveAttribute("data-collapsed", "false");
}

async function hoverSelectionCard(page: Page) {
  await ensureLeftPanelOpen(page);
  await page.locator("canvas.landmarks__webgl").first().hover();
  await page.getByTestId("selection-row").first().hover();
  const card = page.getByTestId("selection-card");
  await expect(card).toBeVisible({ timeout: 5000 });
  return card;
}

test.describe("neighborhood perf (#92)", () => {
  test.beforeEach(async ({ page }) => {
    await bootLandmarksHarness(page);
  });

  test("large selection: k-NN neighbor coloring (edges on when under cutoff)", async ({ page }) => {
    const n = (await page.evaluate(() => window.__landmarksEngine.getPoints().length)) as number;
    // Large but not whole-tissue (all-seed selections have no neighbor roles).
    const largeSeeds = Array.from(
      { length: Math.min(120, Math.max(1, Math.floor(n / 2))) },
      (_, i) => i,
    );
    await setModel(page, {
      selections: [
        {
          id: "large-knn",
          type: "points",
          point_indices: largeSeeds,
          neighborhood: "knn",
          neighborhood_k: 12,
        },
      ],
      selected_kind: "selection",
      selected_index: 0,
    });
    const hood = () =>
      page.evaluate(() => (window as any).__landmarksEngine.getNeighborhoodOverlay());
    await expect.poll(async () => (await hood()).mode).toBe("knn");
    const overlay = await hood();
    expect(overlay.neighborRoleCount).toBeGreaterThan(0);
    expect(overlay.knnEdgeLinesDrawn).toBe(true);
    expect(overlay.edgeCount).toBeGreaterThan(0);
    if (process.env.E2E_PR_SCREENSHOTS === "1") {
      await page.locator(".landmarks").first().screenshot({
        path: "/opt/cursor/artifacts/issue-92-neighbors-knn-large-with-edges.png",
      });
    }
  });

  test("small selection: k-NN edge lines drawn", async ({ page }) => {
    const smallSeeds = Array.from({ length: 30 }, (_, i) => i);
    await setModel(page, {
      selections: [
        {
          id: "small-knn",
          type: "points",
          point_indices: smallSeeds,
          neighborhood: "knn",
          neighborhood_k: 12,
        },
      ],
      selected_kind: "selection",
      selected_index: 0,
    });
    const hood = () =>
      page.evaluate(() => (window as any).__landmarksEngine.getNeighborhoodOverlay());
    await expect.poll(async () => (await hood()).knnEdgeLinesDrawn).toBe(true);
    expect((await hood()).edgeCount).toBeGreaterThan(0);
    if (process.env.E2E_PR_SCREENSHOTS === "1") {
      await page.locator(".landmarks").first().screenshot({
        path: "/opt/cursor/artifacts/issue-92-neighbors-knn-small-with-edges.png",
      });
    }
  });

  test("k-NN edge cap note on selection hover card", { tag: "@isolated" }, async ({ page }) => {
    await bootLandmarksHarness(page);
    await page.evaluate(() => {
      (window as any).__KNN_EDGE_MAX_OVERRIDE = 500;
    });
    const overSeeds = Array.from({ length: 100 }, (_, i) => i);
    await setModel(page, {
      selections: [
        {
          id: "over-cap",
          type: "points",
          point_indices: overSeeds,
          neighborhood: "knn",
          neighborhood_k: 12,
        },
      ],
      selected_kind: "selection",
      selected_index: 0,
    });
    const card = await hoverSelectionCard(page);
    const note = card.getByTestId("knn-edges-cap-note");
    await expect(note).toBeVisible();
    await expect(note).toContainText("Edges hidden above 500 for speed");
    await card.screenshot({
      path: "/opt/cursor/artifacts/issue-92-knn-edge-cap-note-selection-card.png",
    });

    const underSeeds = Array.from({ length: 20 }, (_, i) => i);
    await setModel(page, {
      selections: [
        {
          id: "under-cap",
          type: "points",
          point_indices: underSeeds,
          neighborhood: "knn",
          neighborhood_k: 12,
        },
      ],
      selected_kind: "selection",
      selected_index: 0,
    });
    const cardUnder = await hoverSelectionCard(page);
    await expect(cardUnder.getByTestId("knn-edges-cap-note")).toHaveCount(0);

    await setModel(page, {
      selections: [
        {
          id: "over-cap-off",
          type: "points",
          point_indices: overSeeds,
          neighborhood: "off",
        },
      ],
      selected_kind: "selection",
      selected_index: 0,
    });
    const cardOff = await hoverSelectionCard(page);
    await expect(cardOff.getByTestId("knn-edges-cap-note")).toHaveCount(0);
  });

  test("re-toggling k-NN does not change neighbor role counts", async ({ page }) => {
    const seeds = Array.from({ length: 25 }, (_, i) => i + 10);
    const roleCounts = async () => {
      const hood = await page.evaluate(() =>
        (window as any).__landmarksEngine.getNeighborhoodOverlay(),
      );
      return { neighbors: hood.neighborRoleCount, seeds: hood.seedRoleCount };
    };
    await setModel(page, {
      selections: [
        {
          id: "toggle",
          type: "points",
          point_indices: seeds,
          neighborhood: "knn",
          neighborhood_k: 12,
        },
      ],
      selected_kind: "selection",
      selected_index: 0,
    });
    await expect.poll(async () => (await roleCounts()).neighbors).toBeGreaterThan(0);
    const before = await roleCounts();

    const toggleOff = () =>
      setModel(page, {
        selections: [
          {
            id: "toggle",
            type: "points",
            point_indices: seeds,
            neighborhood: "off",
          },
        ],
        selected_kind: "selection",
        selected_index: 0,
      });
    const toggleOn = () =>
      setModel(page, {
        selections: [
          {
            id: "toggle",
            type: "points",
            point_indices: seeds,
            neighborhood: "knn",
            neighborhood_k: 12,
          },
        ],
        selected_kind: "selection",
        selected_index: 0,
      });

    await toggleOff();
    await toggleOn();
    await toggleOff();
    await toggleOn();
    expect(await roleCounts()).toEqual(before);
  });
});
