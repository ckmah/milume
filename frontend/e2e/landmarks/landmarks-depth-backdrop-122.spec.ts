import { expect } from "@playwright/test";

import { test } from "../fixtures";
import {
  bootLandmarksVolumeHarness,
  getModel,
  setModel,
  shot,
  stabilizeUi,
  waitForEngine,
} from "../helpers";

const volumeHarness = process.env.E2E_HARNESS === "landmarks-volume";
const volumeProfile = process.env.E2E_VOLUME_PROFILE ?? "toy";
const issue122d = volumeProfile === "issue122-2d";
const colonProfile = volumeProfile === "colon";
const ILEUM_FIXTURE = "/e2e-galt-lasso-fixture.json";

async function openLayersSection(page: import("@playwright/test").Page) {
  const left = page.locator(".landmarks__chrome-dock--left");
  if ((await left.getAttribute("data-collapsed")) === "true") {
    await page.getByRole("button", { name: "Show left panel" }).click();
  }
  await page.getByTestId("panel-section-layers").click();
}

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

  test("rail keyboard §(l): Shift+Arrow on focus moves band; aria-valuetext on thumbs", async ({
    page,
  }) => {
    const loThumb = page.getByRole("slider", { name: "Lower z bound" });
    await expect(loThumb).toHaveAttribute("aria-valuetext", /.µm$/);
    const focus = page.getByRole("slider", { name: "Focus z" });
    await focus.focus();
    const f0 = (await getModel(page, "z_focus_um")) as number;
    const w0 =
      ((await getModel(page, "z_band_hi_um")) as number) - ((await getModel(page, "z_band_lo_um")) as number);
    await page.keyboard.press("Shift+ArrowUp");
    await expect.poll(async () => (await getModel(page, "z_focus_um")) as number).toBeCloseTo(f0 + 5, 0);
    const w1 =
      ((await getModel(page, "z_band_hi_um")) as number) - ((await getModel(page, "z_band_lo_um")) as number);
    expect(Math.abs(w1 - w0)).toBeLessThan(0.01);

    await loThumb.focus();
    const lo0 = (await getModel(page, "z_band_lo_um")) as number;
    await page.keyboard.press("ArrowDown");
    await expect.poll(async () => (await getModel(page, "z_band_lo_um")) as number).toBeCloseTo(lo0 - 1, 0);
    await page.keyboard.press("PageDown");
    await expect.poll(async () => (await getModel(page, "z_band_lo_um")) as number).toBeLessThan(lo0 - 1);
  });

  test("rail enforces 5 µm minimum band width", async ({ page }) => {
    const lo = page.getByRole("slider", { name: "Lower z bound" });
    const hi = page.getByRole("slider", { name: "Upper z bound" });
    await lo.focus();
    await page.keyboard.press("End");
    await hi.focus();
    await page.keyboard.press("Home");
    const band =
      ((await getModel(page, "z_band_hi_um")) as number) - ((await getModel(page, "z_band_lo_um")) as number);
    expect(band).toBeGreaterThanOrEqual(5 - 1e-3);
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

  test("committed toy fixture screenshot regression (depth rail + backdrop)", async ({ page }) => {
    test.skip(volumeProfile !== "toy", "toy harness fixture only");
    const widget = page.locator(".milume-widget.landmarks").first();
    await shot(page, "122-toy-depth-backdrop", widget);
  });
});

test.describe("depth backdrop (#122) — 2D multichannel fixture", () => {
  test.skip(!volumeHarness || !issue122d, "requires E2E_HARNESS=landmarks-volume and E2E_VOLUME_PROFILE=issue122-2d");

  test.beforeEach(async ({ page }) => {
    await bootLandmarksVolumeHarness(page);
  });

  test("hides constant-zero dummy channel in Layers", async ({ page }) => {
    await openLayersSection(page);
    await page.getByTestId("layers-image-row").click();
    await expect(page.getByTestId("layer-channel-dummy")).toHaveCount(0);
    await expect(page.getByTestId("layer-channel-DAPI")).toBeVisible();
    await expect(page.getByTestId("layer-channel-PanCK")).toBeVisible();
    await expect(page.getByTestId("layer-channel-CD45")).toBeVisible();
    await expect(page.getByTestId("layer-channel-Ki67")).toBeVisible();
  });

  test("map backdrop pick reports a pyramid level", async ({ page }) => {
    await bootLandmarksVolumeHarness(page, "noDialkit=1");
    await expect
      .poll(async () => page.evaluate(() => (window as any).__landmarksEngine?.getBackdropPick?.()?.level))
      .not.toBeNull();
  });

  test("two visible channels blend on black canvas", async ({ page }) => {
    await openLayersSection(page);
    await setModel(page, {
      _image_channels: [
        { name: "DAPI", visible: true, color: "#4488ff" },
        { name: "PanCK", visible: true, color: "#ff8844" },
      ],
    });
    await expect(page.locator(".milume-widget.landmarks")).toHaveClass(/landmarks--image/);
    await stabilizeUi(page);
    const widget = page.locator(".milume-widget.landmarks").first();
    await shot(page, "122-2d-two-channel-blend", widget);
  });

});

test.describe("depth backdrop (#122) — colon 3D volume", () => {
  test.skip(!volumeHarness || !colonProfile, "requires E2E_HARNESS=landmarks-volume and E2E_VOLUME_PROFILE=colon");

  test.beforeEach(async ({ page }) => {
    await bootLandmarksVolumeHarness(page, "noDialkit=1");
  });

  test("Escape during lower bound drag reverts z_band_lo_um", async ({ page }) => {
    await expect(page.getByTestId("depth-rail")).toBeVisible();
    const loBefore = (await getModel(page, "z_band_lo_um")) as number;
    const loThumb = page.getByRole("slider", { name: "Lower z bound" });
    const box = await loThumb.boundingBox();
    expect(box).toBeTruthy();
    const cx = box!.x + box!.width / 2;
    const cy = box!.y + box!.height / 2;
    await loThumb.hover();
    await page.mouse.down();
    await page.mouse.move(cx, cy + 28, { steps: 8 });
    await expect(loThumb).toHaveClass(/dragging/);
    await expect.poll(async () => (await getModel(page, "z_band_lo_um")) as number).not.toBeCloseTo(loBefore, 0);
    await page.evaluate(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    });
    await expect.poll(async () => (await getModel(page, "z_band_lo_um")) as number).toBeCloseTo(loBefore, 0);
    await page.mouse.up();
  });

  test("symmetric band readout uses whole numbers on one line", async ({ page }) => {
    await expect(page.getByTestId("depth-rail")).toBeVisible();
    const focus = Math.round((await getModel(page, "z_focus_um")) as number);
    const lo = focus - 5;
    const hi = focus + 5;
    await setModel(page, { z_focus_um: focus, z_band_lo_um: lo, z_band_hi_um: hi });
    const rail = page.getByTestId("depth-rail");
    const half = 5;
    await expect.poll(async () => rail.locator(".landmarks-depth-rail__readout-main").textContent()).toBe(
      `${focus} ± ${half}`,
    );
    await expect(rail.locator(".landmarks-depth-rail__readout-sub")).toHaveText(`${lo}–${hi} µm`);
    const line = await rail.locator(".landmarks-depth-rail__readout-line").boundingBox();
    const sub = await rail.locator(".landmarks-depth-rail__readout-sub").boundingBox();
    expect(line).toBeTruthy();
    expect(sub).toBeTruthy();
    expect(line!.width).toBeLessThanOrEqual(58 + 4);
  });
});

test.describe("depth backdrop (#122) — default harness", () => {
  test.skip(volumeHarness, "requires default dev:landmarks harness");

  test("ileum fixture: no depth rail, no layers image row, landmarks--no-z", { tag: "@isolated" }, async ({
    page,
  }) => {
    await page.goto(`/?fixture=${encodeURIComponent(ILEUM_FIXTURE)}`, { waitUntil: "networkidle" });
    await waitForEngine(page);

    const root = page.locator(".milume-widget.landmarks");
    await expect(root).toHaveClass(/landmarks--no-z/);
    await expect(page.getByTestId("depth-rail")).toHaveCount(0);

    await openLayersSection(page);
    await expect(page.getByTestId("layers-image-row")).toHaveCount(0);
  });

  test("default fixture.json uses landmarks--no-z", { tag: "@isolated" }, async ({ page }) => {
    await page.goto("/?fixture=/fixture.json", { waitUntil: "networkidle" });
    await waitForEngine(page);

    await expect(page.locator(".milume-widget.landmarks")).toHaveClass(/landmarks--no-z/);
    await expect(page.getByTestId("depth-rail")).toHaveCount(0);
  });
});
