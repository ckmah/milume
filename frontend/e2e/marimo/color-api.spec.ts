import { expect, test } from "@playwright/test";

import { getModel, onCi, waitForLandmarksWidget } from "./helpers";

test.describe("marimo kernel — color API (#394)", () => {
  test("peek(..., color=) is the initial synced trait", async ({ page }) => {
    test.slow(onCi(), "marimo kernel boot");
    await page.goto("/", { waitUntil: "domcontentloaded", timeout: 120_000 });
    await waitForLandmarksWidget(page);

    await expect.poll(() => getModel(page, "color")).toBe("cell_type");
    await expect(page.getByText(/color-kwarg-probe color='cell_type'/)).toBeVisible({
      timeout: onCi() ? 120_000 : 30_000,
    });
  });
});
