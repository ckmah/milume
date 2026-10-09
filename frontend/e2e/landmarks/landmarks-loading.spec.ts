import { expect } from "@playwright/test";

import { test } from "../fixtures";
import { stabilizeUi, waitForEngine } from "../helpers";

test.describe("Landmarks loading indicators", () => {
  test("the map shows loading then ready on first paint", { tag: "@isolated" }, async ({ page }) => {
    await page.addInitScript(() => {
      (window as unknown as { __landmarksPlotBootstrapHook?: { delayMs: number } }).__landmarksPlotBootstrapHook =
        { delayMs: 900 };
    });
    await page.goto("/", { waitUntil: "networkidle" });
    await stabilizeUi(page);
    const plot = page.getByTestId("plot-bootstrap");
    await expect(plot).toBeVisible();
    await expect(plot).toHaveAttribute("data-state", "loading");
    await expect(plot).toHaveCount(0, { timeout: 20_000 });
    await waitForEngine(page, 150);
  });

  test("a deck bootstrap failure shows an error, not an endless spinner", { tag: "@isolated" }, async ({
    page,
  }) => {
    await page.addInitScript(() => {
      (window as unknown as { __landmarksPlotBootstrapHook?: { fail: boolean } }).__landmarksPlotBootstrapHook =
        { fail: true };
    });
    await page.goto("/", { waitUntil: "networkidle" });
    await stabilizeUi(page);
    const plot = page.getByTestId("plot-bootstrap");
    await expect(plot).toHaveAttribute("data-state", "error");
    await expect(plot).toContainText("Deck renderer failed");
    await expect(plot).toHaveAttribute("data-state", "error", { timeout: 5_000 });
  });
});
