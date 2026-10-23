import { expect } from "@playwright/test";

import { test } from "../fixtures";

import { bootLandmarksHarness, stabilizeUi } from "../helpers";

test.describe("Info donut", () => {
  test.beforeEach(async ({ page }) => {
    await bootLandmarksHarness(page);
  });

  test("category coloring shows donut segments and hover tooltip", async ({
    page,
  }) => {
    await page.getByTestId("explore-color-by").getByRole("tab", {
      name: "category",
    }).click();
    await expect(page.getByTestId("explore-coloring-by")).not.toHaveText(
      /None selected/,
    );

    const donut = page.getByTestId("info-donut");
    await expect(donut).toBeVisible();

    const segments = donut.getByTestId("info-donut-segment");
    await expect(segments.first()).toBeVisible();
    expect(await segments.count()).toBeGreaterThan(0);

    await stabilizeUi(page);
    const box = await donut.boundingBox();
    expect(box).toBeTruthy();
    await page.mouse.move(
      box!.x + box!.width * 0.88,
      box!.y + box!.height * 0.42,
    );
    const tooltip = page.getByTestId("info-donut-tooltip");
    await expect(tooltip).toBeVisible();
    await expect(tooltip).toContainText("cells ·");
  });
});
