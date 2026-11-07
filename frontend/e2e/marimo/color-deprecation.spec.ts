import { expect, test } from "@playwright/test";

import { getModel, onCi, waitForLandmarksWidget } from "./helpers";

test.describe("marimo kernel — color deprecation (#394)", () => {
  test("active_genes assignment warns in Python and routes to color", async ({ page }) => {
    test.slow(onCi(), "marimo kernel boot");
    await page.goto("/", { waitUntil: "domcontentloaded", timeout: 120_000 });
    await waitForLandmarksWidget(page);

    await expect.poll(() => getModel(page, "color")).toBe("0");
    await expect(page.getByText(/color-deprecation-probe color='0' deprecation_n=1/)).toBeVisible({
      timeout: onCi() ? 120_000 : 30_000,
    });
  });
});
