import { expect, type Page } from "@playwright/test";

import { test } from "../fixtures";

import {
  bootLandmarksVolumeHarness,
  readCubeRenderCount,
  resetCubeRenderCount,
  waitForCubeSettled,
  waitForEngine,
} from "../helpers";

/**
 * Issue #476. A committed gamma, contrast, or label-opacity value redraws the
 * cube at most once. A hold or drag stays at one render per frame, plus one
 * settled render. Contrast at an unchanged level issues no volume_get.
 */
const cubeWindow = (page: Page) => page.getByRole("dialog", { name: "Cube" });

async function volumeReads(page: Page) {
  return page.evaluate(
    () => (window as { __volumeCommReads?: () => number }).__volumeCommReads?.() ?? 0,
  );
}

/** Renders since the last reset, once the count has sat still for 100ms. */
async function settledRenders(page: Page) {
  await page.waitForFunction(
    () => {
      const w = window as {
        __volumeCubeRenderCount?: number;
        __redrawMark?: number;
        __redrawAt?: number;
      };
      const n = w.__volumeCubeRenderCount ?? 0;
      const now = performance.now();
      if (w.__redrawMark !== n) {
        w.__redrawMark = n;
        w.__redrawAt = now;
        return false;
      }
      return now - (w.__redrawAt ?? now) >= 100;
    },
    null,
    { timeout: 30_000 },
  );
  return readCubeRenderCount(page);
}

async function openClickedCube(page: Page) {
  await bootLandmarksVolumeHarness(page, "window=100");
  await waitForEngine(page, 150);
  await page.getByRole("radio", { name: "Inspect", exact: true }).click();
  const canvas = page.locator("canvas.landmarks__webgl").first();
  const box = await canvas.boundingBox();
  expect(box).toBeTruthy();
  await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await expect(cubeWindow(page)).toBeVisible();
  await expect(page.getByTestId("inspect-preview")).toBeAttached();
  await waitForCubeSettled(page);
}

async function nudge(page: Page, name: string) {
  const slider = page.getByRole("slider", { name });
  const before = await slider.getAttribute("aria-valuenow");
  await slider.focus();
  await resetCubeRenderCount(page);
  const t0 = Date.now();
  await page.keyboard.press("ArrowRight");
  await expect(slider).not.toHaveAttribute("aria-valuenow", before ?? "");
  return { renders: await settledRenders(page), ms: Date.now() - t0 };
}

test.describe("Inspect display redraws (#476)", () => {
  test("one ArrowRight redraws at most once; contrast adds no volume_get", async ({ page }) => {
    await openClickedCube(page);
    const view = cubeWindow(page).locator(".volume-cube__view");
    const level = await view.getAttribute("data-level");

    await page.getByTestId("layer-toggle-image").click({ button: "right" });
    await expect(page.getByTestId("adjust-image")).toBeVisible();

    const gamma = await nudge(page, "Image gamma");
    expect(gamma.renders).toBeLessThanOrEqual(1);

    const reads = await volumeReads(page);
    const contrast = await nudge(page, "Contrast, maximum");
    expect(contrast.renders).toBeLessThanOrEqual(1);
    expect(await volumeReads(page)).toBe(reads);
    await expect(view).toHaveAttribute("data-level", level ?? "");
    await expect(view).toHaveAttribute("data-refining", "false");

    await page.keyboard.press("Escape");
    await page.getByTestId("layer-toggle-labels").click({ button: "right" });
    await expect(page.getByTestId("adjust-labels")).toBeVisible();
    const opacity = await nudge(page, "Label opacity");
    expect(opacity.renders).toBeLessThanOrEqual(1);
  });

  test("a held key or a slider drag redraws at most once per frame", async ({ page }) => {
    await openClickedCube(page);
    await page.getByTestId("layer-toggle-image").click({ button: "right" });
    await expect(page.getByTestId("adjust-image")).toBeVisible();
    const gamma = page.getByRole("slider", { name: "Image gamma" });
    await gamma.focus();

    const burst = async (gesture: () => Promise<void>) => {
      await resetCubeRenderCount(page);
      await page.evaluate(() => {
        const w = window as {
          __volumeCubeRenderCount?: number;
          __frameRenders?: number[];
          __frameRaf?: number;
        };
        w.__frameRenders = [];
        let last = w.__volumeCubeRenderCount ?? 0;
        const tick = () => {
          const n = w.__volumeCubeRenderCount ?? 0;
          w.__frameRenders!.push(n - last);
          last = n;
          w.__frameRaf = requestAnimationFrame(tick);
        };
        w.__frameRaf = requestAnimationFrame(tick);
      });
      await gesture();
      await settledRenders(page);
      return page.evaluate(() => {
        const w = window as { __frameRenders?: number[]; __frameRaf?: number };
        if (w.__frameRaf) cancelAnimationFrame(w.__frameRaf);
        return w.__frameRenders ?? [];
      });
    };

    const start = Number(await gamma.getAttribute("aria-valuenow"));
    const held = await burst(async () => {
      for (let i = 0; i < 6; i++) await page.keyboard.press("ArrowRight", { delay: 0 });
    });
    const heldNow = Number(await gamma.getAttribute("aria-valuenow"));
    expect(heldNow).toBeGreaterThan(start + 0.1);
    expect(Math.max(0, ...held)).toBeLessThanOrEqual(1);
    expect(held.reduce((n, v) => n + v, 0)).toBeGreaterThan(0);

    const box = await gamma.boundingBox();
    expect(box).toBeTruthy();
    const beforeDrag = Number(await gamma.getAttribute("aria-valuenow"));
    const dragged = await burst(async () => {
      await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
      await page.mouse.down();
      await page.mouse.move(box!.x + box!.width / 2 + 120, box!.y + box!.height / 2, { steps: 12 });
      await page.mouse.up();
    });
    expect(Number(await gamma.getAttribute("aria-valuenow"))).not.toBe(beforeDrag);
    expect(Math.max(0, ...dragged)).toBeLessThanOrEqual(1);
    expect(dragged.reduce((n, v) => n + v, 0)).toBeGreaterThan(0);
  });
});
