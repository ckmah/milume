import { expect } from "@playwright/test";

import { test } from "../fixtures";

import { bootLandmarksHarness, shot } from "../helpers";

/**
 * Core tier: shared Soft Float / shadcn chrome that every widget depends on.
 * Runs when frontend/src/components, styles, lib, hooks, or e2e/core change.
 */
test.describe("shared Soft Float chrome", () => {
  test.beforeEach(async ({ page }) => {
    await bootLandmarksHarness(page);
  });

  test("toolbar and docks mount with shadcn controls", async ({ page }) => {
    const widget = page.locator(".landmarks").first();
    await expect(widget).toBeVisible();

    const toolbar = page.getByRole("toolbar", { name: "Drawing tools" });
    await expect(toolbar).toBeVisible();
    await expect(page.getByRole("button", { name: "Zoom in" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Zoom out" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Reset view" })).toBeVisible();

    // Shared primitives used across Soft Float docks.
    await expect(page.getByTestId("explore-color-by")).toBeVisible();
    await expect(page.getByTestId("info-panel")).toBeVisible();
    await expect(page.getByTestId("info-chart-well")).toBeVisible();

    // One rest-state capture for shared chrome regressions.
    await shot(page, "shared-chrome-rest", widget);
  });
});
