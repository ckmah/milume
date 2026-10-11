import { expect, test } from "../fixtures";

import {
  applyMolabViewportStress,
  bootLandmarksHarness,
  canvasBox,
  getModel,
  growLandmarksFromZeroHeight,
  setModel,
  waitForEngine,
} from "../helpers";

test.describe("molab viewport stress (deferred layout, CSS scale)", () => {
  test.beforeEach(async ({ page }) => {
    await bootLandmarksHarness(page);
  });

  test("focused selection highlights seed cells when neighborhood is off", async ({ page }) => {
    await setModel(page, {
      selections: [
        {
          id: "molab-off",
          type: "points",
          point_indices: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
          neighborhood: "off",
        },
      ],
      selected_kind: "selection",
      selected_index: 0,
    });
    await applyMolabViewportStress(page);
    await expect
      .poll(async () => {
        const o = await page.evaluate(() =>
          (window as any).__landmarksEngine.getNeighborhoodOverlay(),
        );
        return o.seedRoleCount as number;
      })
      .toBeGreaterThan(0);
  });

  test("lasso path accumulates after deferred zero-height mount and CSS scale", async ({ page }) => {
    await growLandmarksFromZeroHeight(page);
    await applyMolabViewportStress(page);
    await waitForEngine(page, 200);
    const surface = await page.evaluate(() => (window as any).__landmarksEngine.getPlotSurfaceSize());
    expect(surface.plotW).toBeGreaterThan(200);
    expect(surface.plotH).toBeGreaterThan(200);

    await page.getByRole("button", { name: /Lasso/i }).click();
    const box = await canvasBox(page);
    const cx = box.x + box.width * 0.5;
    const cy = box.y + box.height * 0.5;
    const r = Math.min(box.width, box.height) * 0.24;
    await page.mouse.move(cx + r, cy);
    await page.mouse.down();
    await page.evaluate(() => {
      const canvas = document.querySelector("canvas.landmarks__webgl");
      const foreign = document.createElement("canvas");
      document.body.appendChild(foreign);
      canvas?.dispatchEvent(
        new MouseEvent("mouseleave", { bubbles: true, relatedTarget: foreign }),
      );
    });
    for (let i = 0; i <= 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      await page.mouse.move(cx + Math.cos(a) * r, cy + Math.sin(a) * r, { steps: 2 });
    }
    const mid = await page.evaluate(() => (window as any).__landmarksEngine.getSelectionGesture());
    expect(mid.lassoPathLength).toBeGreaterThan(2);
    await page.mouse.up();
    await expect
      .poll(async () => ((await getModel(page, "selections")) as unknown[])?.length ?? 0)
      .toBeGreaterThan(0);
    await expect
      .poll(async () => {
        const o = await page.evaluate(() =>
          (window as any).__landmarksEngine.getNeighborhoodOverlay(),
        );
        return o.seedRoleCount as number;
      })
      .toBeGreaterThan(0);
  });
});
