import { expect, type Page } from "@playwright/test";

import { test } from "../fixtures";

import {
  bootLandmarksVolumeHarness,
  getModel,
  setModel,
  stabilizeUi,
  waitForEngine,
} from "../helpers";

const cubeWindow = (page: Page) => page.getByRole("dialog", { name: "Cube" });
const minimap = (page: Page) => page.getByTestId("inspect-minimap");
const minimapCanvas = (page: Page) => page.getByTestId("inspect-minimap-canvas");

async function openCubeFromPython(page: Page) {
  const target = (await page.evaluate(
    () => (window as any).__landmarksEngine.getViewState().target,
  )) as number[];
  await setModel(page, { inspect_cx: target[0], inspect_cy: target[1], inspect_open: true });
  await expect(cubeWindow(page)).toBeVisible({ timeout: 15_000 });
  await expect(minimapCanvas(page)).toHaveAttribute("data-square", /.+/);
}

test.describe("Inspect minimap (#218)", () => {
  test.beforeEach(async ({ page }) => {
    await stabilizeUi(page);
    await bootLandmarksVolumeHarness(page);
    await waitForEngine(page);
  });

  test("hidden in map mode and armed Inspect; visible when the cube opens", async ({ page }) => {
    await expect(minimap(page)).toHaveCount(0);
    await page.getByRole("radio", { name: "Inspect", exact: true }).click();
    await expect(minimap(page)).toHaveCount(0);
    await openCubeFromPython(page);
    await expect(minimap(page)).toBeVisible({ timeout: 5_000 });
    await setModel(page, { inspect_open: false });
    await expect(cubeWindow(page)).toHaveCount(0);
    await expect(minimap(page)).toHaveCount(0);
  });

  test("Python inspect_cx/cy updates canvas data attributes", async ({ page }) => {
    await openCubeFromPython(page);
    await expect(minimap(page)).toBeVisible();
    await setModel(page, { inspect_cx: 100, inspect_cy: 120 });
    await expect.poll(async () => minimapCanvas(page).getAttribute("data-cx")).toBe("100");
    await expect.poll(async () => minimapCanvas(page).getAttribute("data-cy")).toBe("120");
    await expect(minimapCanvas(page).getAttribute("data-size")).toBeTruthy();
    await expect.poll(async () => minimapCanvas(page).getAttribute("data-square")).toMatch(/\d/);
  });

  test("press on the minimap moves inspect_cx/cy", async ({ page }) => {
    await bootLandmarksVolumeHarness(page, "window=100");
    await stabilizeUi(page);
    await waitForEngine(page);
    await openCubeFromPython(page);
    await expect(minimap(page)).toBeVisible();
    const canvas = minimapCanvas(page);
    const box = await canvas.boundingBox();
    expect(box).toBeTruthy();
    const beforeX = Number(await getModel(page, "inspect_cx"));
    await page.evaluate(() => {
      const canvas = document.querySelector(
        '[data-testid="inspect-minimap-canvas"]',
      ) as HTMLCanvasElement | null;
      if (!canvas) throw new Error("minimap canvas missing");
      const rect = canvas.getBoundingClientRect();
      const clientX = rect.left + 16;
      const clientY = rect.bottom - 16;
      const opts = {
        bubbles: true,
        clientX,
        clientY,
        pointerId: 1,
        pointerType: "mouse",
        isPrimary: true,
      };
      canvas.dispatchEvent(new PointerEvent("pointerdown", { ...opts, buttons: 1 }));
      canvas.dispatchEvent(new PointerEvent("pointerup", { ...opts, buttons: 0 }));
    });
    await expect.poll(async () => Number(await getModel(page, "inspect_cx"))).not.toBe(beforeX);
    await expect(page.getByTestId("inspect-status")).toHaveAttribute("data-state", "ready", {
      timeout: 60_000,
    });
  });

  test("grab cursor on the minimap canvas", async ({ page }) => {
    await openCubeFromPython(page);
    const canvas = minimapCanvas(page);
    await expect(canvas).toHaveCSS("cursor", "grab");
  });
});
