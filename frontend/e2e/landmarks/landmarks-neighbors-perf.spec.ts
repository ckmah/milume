import { expect } from "@playwright/test";

import { test } from "../fixtures";

import { bootLandmarksHarness, setModel } from "../helpers";

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
