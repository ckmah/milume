import { expect } from "@playwright/test";

import { test } from "../fixtures";
import {
  bootLandmarksVolumeHarness,
  getModel,
  setModel,
  waitForEngine,
} from "../helpers";

const volumeHarness = process.env.E2E_HARNESS === "landmarks-volume";
const ILEUM_FIXTURE = "/e2e-galt-lasso-fixture.json";

async function openLayersSection(page: import("@playwright/test").Page) {
  const left = page.locator(".landmarks__chrome-dock--left");
  if ((await left.getAttribute("data-collapsed")) === "true") {
    await page.getByRole("button", { name: "Show left panel" }).click();
  }
  await page.getByTestId("panel-section-layers").click();
}

/** Mirrors the z-band segment of the client raster rebuild key in `landmarks.js`. */
async function rasterBandKey(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const model = (window as any).__landmarksModel;
    return `${model.get("z_band_lo_um")}|${model.get("z_band_hi_um")}`;
  });
}

test.describe("depth backdrop (#122) — landmarks-volume harness", () => {
  test.skip(!volumeHarness, "requires E2E_HARNESS=landmarks-volume");

  test.beforeEach(async ({ page }) => {
    await bootLandmarksVolumeHarness(page);
  });

  test("depth rail visible; dragging lower bound updates z_band_lo_um", async ({ page }) => {
    await expect(page.getByTestId("depth-rail")).toBeVisible();
    await expect(page.locator(".milume-widget.landmarks")).not.toHaveClass(/landmarks--no-z/);

    const loBefore = (await getModel(page, "z_band_lo_um")) as number;
    const hi = (await getModel(page, "z_band_hi_um")) as number;
    expect(Number.isFinite(loBefore)).toBeTruthy();
    expect(Number.isFinite(hi)).toBeTruthy();

    const loThumb = page.getByRole("slider", { name: "Lower z bound" });
    const box = await loThumb.boundingBox();
    expect(box).toBeTruthy();
    const cx = box!.x + box!.width / 2;
    const cy = box!.y + box!.height / 2;

    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx, cy + 24, { steps: 6 });
    await page.mouse.up();

    await expect.poll(async () => (await getModel(page, "z_band_lo_um")) as number).not.toBe(loBefore);
    const loAfter = (await getModel(page, "z_band_lo_um")) as number;
    expect(loAfter).toBeLessThan(hi - 5 + 1e-3);
  });

  test("raster mode rebuild key includes depth band", async ({ page }) => {
    await setModel(page, { render_mode: "raster" });
    await expect.poll(async () => (await getModel(page, "raster_n_bins")) as number).toBeGreaterThan(0);

    const binsWide = (await getModel(page, "raster_n_bins")) as number;
    const keyWide = await rasterBandKey(page);

    const lo = (await getModel(page, "z_band_lo_um")) as number;
    const hi = (await getModel(page, "z_band_hi_um")) as number;
    const mid = (lo + hi) / 2;
    await setModel(page, { z_band_lo_um: mid - 2.5, z_band_hi_um: mid + 2.5 });

    await expect.poll(async () => await rasterBandKey(page)).not.toBe(keyWide);
    await expect
      .poll(async () => (await getModel(page, "raster_n_bins")) as number)
      .toBeLessThanOrEqual(binsWide);
  });

  test("layer-toggle-image hides map backdrop class", async ({ page }) => {
    const root = page.locator(".milume-widget.landmarks");
    await expect(root).toHaveClass(/landmarks--image/);

    await openLayersSection(page);
    await page.getByTestId("layer-toggle-image").click();

    await expect(root).not.toHaveClass(/landmarks--image/);
    await setModel(page, { _image_visible: true });
    await expect(root).toHaveClass(/landmarks--image/);
  });
});

test.describe("depth backdrop (#122) — default harness", () => {
  test.skip(volumeHarness, "requires default dev:landmarks harness");

  test("ileum fixture: no depth rail, no layers image row, landmarks--no-z", async ({ page }) => {
    await page.goto(`/?fixture=${encodeURIComponent(ILEUM_FIXTURE)}`, { waitUntil: "networkidle" });
    await waitForEngine(page);

    const root = page.locator(".milume-widget.landmarks");
    await expect(root).toHaveClass(/landmarks--no-z/);
    await expect(page.getByTestId("depth-rail")).toHaveCount(0);

    await openLayersSection(page);
    await expect(page.getByTestId("layers-image-row")).toHaveCount(0);
  });

  test("default fixture.json uses landmarks--no-z", async ({ page }) => {
    await page.goto("/?fixture=/fixture.json", { waitUntil: "networkidle" });
    await waitForEngine(page);

    await expect(page.locator(".milume-widget.landmarks")).toHaveClass(/landmarks--no-z/);
    await expect(page.getByTestId("depth-rail")).toHaveCount(0);
  });
});
