import { expect, test } from "@playwright/test";

import {
  applyMolabEmbedStress,
  canvasBox,
  drawLasso,
  drawRectangle,
  getModel,
  onCi,
  waitForLandmarksWidget,
} from "./helpers";

test.describe("marimo kernel — molab-scale selection (Pyxa small)", () => {
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
        { timeout: onCi() ? 120_000 : 60_000 },
      )
      .toBeGreaterThan(4000);
    await applyMolabEmbedStress(page);
  });

  test("lasso stroke commits selections through anywidget under css scale and dpr", async ({ page }) => {
    test.slow(onCi(), "pyxa kernel boot + zarr read");

    const before = ((await getModel(page, "selections")) as unknown[])?.length ?? 0;
    await drawLasso(page, await canvasBox(page));

    await expect
      .poll(async () => ((await getModel(page, "selections")) as unknown[])?.length ?? 0, {
        timeout: onCi() ? 180_000 : 45_000,
      })
      .toBeGreaterThan(before);
    const selections = (await getModel(page, "selections")) as { point_indices?: number[] }[];
    const last = selections[selections.length - 1];
    expect(last?.point_indices?.length ?? 0).toBeGreaterThan(10);
  });

  test("rectangle stroke still commits under the same embed stress", async ({ page }) => {
    test.slow(onCi(), "pyxa kernel boot + zarr read");

    const box = await canvasBox(page);
    const before = ((await getModel(page, "selections")) as unknown[])?.length ?? 0;
    await drawRectangle(page, box);

    await expect
      .poll(async () => ((await getModel(page, "selections")) as unknown[])?.length ?? 0, {
        timeout: onCi() ? 180_000 : 45_000,
      })
      .toBeGreaterThan(before);
    const selections = (await getModel(page, "selections")) as { point_indices?: number[] }[];
    const last = selections[selections.length - 1];
    expect(last?.point_indices?.length ?? 0).toBeGreaterThan(10);
  });
});
