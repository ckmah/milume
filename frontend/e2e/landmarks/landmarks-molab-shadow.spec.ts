import { expect, test } from "../fixtures";

import {
  applyMolabShadowEmbed,
  bootLandmarksHarness,
  drawLassoStroke,
  getModel,
  molabPickingCanvasBox,
  setModel,
  waitForEngine,
} from "../helpers";

async function focusPlot(page: import("@playwright/test").Page) {
  const box = await molabPickingCanvasBox(page);
  await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.5);
}

test.describe("molab anywidget stress (scrolled page, shadow-host leave, CSS scale)", () => {
  test.beforeEach(async ({ page }) => {
    await bootLandmarksHarness(page);
    await applyMolabShadowEmbed(page);
    await page.locator("canvas.landmarks__webgl").first().scrollIntoViewIfNeeded();
    await waitForEngine(page, 200);
  });

  test("lasso path, selection commit, and highlight under shadow host leave", async ({ page }) => {
    const before = ((await getModel(page, "selections")) as unknown[])?.length ?? 0;
    await focusPlot(page);
    await page.getByRole("button", { name: /Reset view/i }).click().catch(() => undefined);
    await setModel(page, { mode: "lasso" });
    await expect.poll(() => getModel(page, "mode")).toBe("lasso");
    await page.locator("canvas#deck-picking-stub").first().scrollIntoViewIfNeeded();
    const box = await molabPickingCanvasBox(page);
    await drawLassoStroke(page, box, {
      inset: 0.14,
      afterPress: async () => {
        await page.evaluate(() => (window as any).__molabPickingLeaveHook?.());
        await expect
          .poll(async () => {
            const g = await page.evaluate(() =>
              (window as any).__landmarksEngine.getSelectionGesture(),
            );
            return g.isLassoing as boolean;
          })
          .toBe(true);
      },
      beforeRelease: async () => {
        const mid = await page.evaluate(() => (window as any).__landmarksEngine.getSelectionGesture());
        expect(mid.isLassoing).toBe(true);
        expect(mid.lassoPathLength).toBeGreaterThan(2);
      },
    });
    await expect
      .poll(async () => ((await getModel(page, "selections")) as unknown[])?.length ?? 0)
      .toBeGreaterThan(before);

    await expect
      .poll(async () => {
        const o = await page.evaluate(() =>
          (window as any).__landmarksEngine.getNeighborhoodOverlay(),
        );
        return o.seedRoleCount as number;
      })
      .toBeGreaterThan(0);
  });

  test.skip("square selection still commits in the shadow embed", async ({ page }) => {
    await page.locator("canvas.landmarks__webgl").first().scrollIntoViewIfNeeded();
    const before = ((await getModel(page, "selections")) as unknown[])?.length ?? 0;
    await focusPlot(page);
    await setModel(page, { mode: "rectangle" });
    await expect.poll(() => getModel(page, "mode")).toBe("rectangle");
    const box = await molabPickingCanvasBox(page);

    const x0 = box.x + box.width * 0.3;
    const y0 = box.y + box.height * 0.3;
    const x1 = box.x + box.width * 0.7;
    const y1 = box.y + box.height * 0.7;
    await page.mouse.move(x0, y0);
    await page.mouse.down();
    await page.mouse.move(x1, y1, { steps: 6 });
    await page.mouse.up();

    await expect
      .poll(async () => ((await getModel(page, "selections")) as unknown[])?.length ?? 0)
      .toBeGreaterThan(before);
  });
});
