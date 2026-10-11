import { expect, test } from "@playwright/test";

import { assertMolabPyxaAfterSelection, prepMolabPyxaPage } from "./molab-pyxa-flow";
import { canvasBox, drawLasso, getModel, onCi, waitForLandmarksWidget } from "./helpers";

test.describe("marimo kernel — molab shell on page (scale, zero-height grow)", () => {
  test.beforeEach(async ({ page, baseURL }) => {
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
    await applyMolabEmbedStress(page);
  });

  test("lasso, highlight, focus obs names, and centred inspect cube", async ({ page }) => {
    test.slow(onCi(), "pyxa kernel boot + zarr read");

    await prepMolabPyxaPage(page);
    await waitForLandmarksWidget(page);

    const box = await canvasBox(page);
    const before = ((await getModel(page, "selections")) as unknown[])?.length ?? 0;
    await drawLasso(page, box);
    await expect
      .poll(async () => ((await getModel(page, "selections")) as unknown[])?.length ?? 0, {
        timeout: onCi() ? 720_000 : 45_000,
      })
      .toBeGreaterThan(before);

    await assertMolabPyxaAfterSelection(page, box);
  });
});
