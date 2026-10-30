import { expect, type Page } from "@playwright/test";

import { test } from "../fixtures";

import {
  bootLandmarksVolumeHarness,
  readCubeRenderCount,
  resetCubeRenderCount,
  setModel,
  waitForCubeSettled,
  waitForEngine,
} from "../helpers";

/**
 * Issue #383 — no deck.gl redraws after the cube settles, and opening a layer
 * settings menu should not spam renders. Toy harness with a 100 µm window.
 */
const cubeWindow = (page: Page) => page.getByRole("dialog", { name: "Cube" });

async function openSettledInspectCube(page: Page) {
  await bootLandmarksVolumeHarness(page, "window=100");
  await waitForEngine(page, 150);
  const target = (await page.evaluate(() => (window as any).__landmarksEngine.getViewState().target)) as number[];
  await setModel(page, { inspect_cx: target[0], inspect_cy: target[1], inspect_open: true });
  await expect(cubeWindow(page)).toBeVisible();
  for (const layer of ["labels", "image"] as const) {
    const toggle = page.getByTestId(`layer-toggle-${layer}`);
    if ((await toggle.getAttribute("aria-pressed")) !== "true") await toggle.click();
  }
  await waitForCubeSettled(page);
}

test.describe("Landmarks cube idle renders (#383)", () => {
  test("settled cube stays idle for 2000ms with zero deck renders", async ({ page }) => {
    await openSettledInspectCube(page);
    await resetCubeRenderCount(page);
    await page.waitForTimeout(2000);
    expect(await readCubeRenderCount(page)).toBe(0);
  });

  test("Image layer menu opens within 1000ms with at most one deck render", async ({ page }) => {
    await openSettledInspectCube(page);
    await resetCubeRenderCount(page);
    const t0 = Date.now();
    await page.getByTestId("layer-toggle-image").click({ button: "right" });
    await expect(page.getByTestId("adjust-image")).toBeVisible({ timeout: 30_000 });
    expect(await readCubeRenderCount(page)).toBeLessThanOrEqual(1);
    expect(Date.now() - t0).toBeLessThan(1000);
  });
});
