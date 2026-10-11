import { expect, test } from "@playwright/test";

import { assertMolabPyxaAfterSelection, prepMolabPyxaPage } from "./molab-pyxa-flow";
import { canvasBox, drawLasso, onCi, waitForLandmarksWidget } from "./helpers";

test.describe("marimo kernel — molab shell on page (scale, zero-height grow)", () => {
  test("lasso, highlight, focus obs names, and centred inspect cube", async ({ page, baseURL }) => {
    test.slow(onCi(), "pyxa kernel boot + zarr read");

    expect(baseURL).toBeTruthy();
    expect(baseURL).not.toMatch(/localhost|127\.0\.0\.1/);

    await page.goto("/", { waitUntil: "domcontentloaded", timeout: 120_000 });
    await waitForLandmarksWidget(page);
    await expect
      .poll(
        async () =>
          page.evaluate(() => {
            const eng = (window as any).__landmarksEngine;
            return eng?.getPoints?.()?.length ?? 0;
          }),
        { timeout: onCi() ? 720_000 : 180_000 },
      )
      .toBeGreaterThan(4000);

    await prepMolabPyxaPage(page);
    await waitForLandmarksWidget(page);

    const box = await canvasBox(page);
    await page.getByRole("button", { name: /Lasso/i }).click();
    await drawLasso(page, box);
    await assertMolabPyxaAfterSelection(page);
  });
});
