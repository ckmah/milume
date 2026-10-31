import { execSync } from "node:child_process";
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
  test.skip(
    !volumeHarness || issue122d || colonProfile,
    "toy landmarks-volume harness only",
  );

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
        { name: "DAPI", visible: true, color: "#8a8a8a", contrast_limits: [0, 255] },
        { name: "PanCK", visible: true, color: "#ff8844", contrast_limits: [0, 255] },
      ],
    });
    await expect(page.locator(".milume-widget.landmarks")).toHaveClass(/landmarks--image/);
    await stabilizeUi(page);
    const widget = page.locator(".milume-widget.landmarks").first();
    await shot(page, "122-2d-two-channel-blend", widget);
  });

  test("issue122 image bounds cover scatter extent", async ({ page }) => {
    await bootLandmarksVolumeHarness(page, "noDialkit=1");
    await expect
      .poll(async () => page.evaluate(() => (window as any).__landmarksEngine?.getBackdropPick?.()?.level))
      .not.toBeNull();
    const ok = await page.evaluate(() => {
      const model = (window as any).__landmarksModel;
      const cut = model.get("volume_cut") as number[] | undefined;
      const xb = model.get("x_bounds") as [number, number];
      const yb = model.get("y_bounds") as [number, number];
      if (!cut || cut.length < 4 || !xb || !yb) return false;
      const [x0, x1, y0, y1] = cut;
      const margin = 0.5;
      if (xb[0] < x0 - margin || xb[1] > x1 + margin) return false;
      if (yb[0] < y0 - margin || yb[1] > y1 + margin) return false;
      const pick = (window as any).__landmarksEngine?.getBackdropPick?.();
      return pick != null && pick.level <= 1;
    });
    expect(ok).toBe(true);
  });

  test("issue122 cell centers align with DAPI blobs within one cell radius", () => {
    const out = execSync(
      `uv run python -c "
import json
import base64
import numpy as np
import spatialdata as sd
from pathlib import Path
from milume import LandmarksWidget

root = Path('frontend/dev/landmarks-volume/public/issue122-2d.sdata.zarr')
sdata = sd.read_zarr(root)
w = LandmarksWidget(sdata, color='cell_type')
pts = np.frombuffer(base64.b64decode(w.points_data), dtype=np.float32).reshape(-1, 4)
xb, yb = w.x_bounds, w.y_bounds
xs = xb[0] + ((pts[:, 0] + 1) / 2) * (xb[1] - xb[0])
ys = yb[0] + ((pts[:, 1] + 1) / 2) * (yb[1] - yb[0])
dapi = np.asarray(sdata.images['mosaic']['scale0'].image.values[0, 0])
_, sy, sx = w.volume['voxel_size_um']
h, wid = dapi.shape
radius = float(w.point_size)
bad = []
for x, y in zip(xs, ys):
    xi = int(round(x / sx))
    yi = int(round(y / sy))
    best = 1e9
    for dy in range(-20, 21):
        for dx in range(-20, 21):
            yy, xx = yi + dy, xi + dx
            if 0 <= yy < h and 0 <= xx < wid and dapi[yy, xx] >= 80:
                d = ((dx * sx) ** 2 + (dy * sy) ** 2) ** 0.5
                if d < best:
                    best = d
    if best > radius:
        bad.append({'x': float(x), 'y': float(y), 'dist_um': float(best), 'radius_um': radius})
print(json.dumps({'bad': bad, 'n': len(xs), 'radius_um': radius}))
"`,
      { cwd: `${process.cwd()}/..`, encoding: "utf8" },
    );
    const parsed = JSON.parse(out.trim()) as { bad: unknown[]; n: number; radius_um: number };
    expect(parsed.bad).toEqual([]);
    expect(parsed.n).toBeGreaterThan(0);
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
    const readout = rail.locator(".landmarks-depth-rail__readout");
    const railBox = await rail.boundingBox();
    const readoutBox = await readout.boundingBox();
    expect(railBox).toBeTruthy();
    expect(readoutBox).toBeTruthy();
    expect(readoutBox!.width).toBeLessThanOrEqual(58 + 2);
    const readoutRight = readoutBox!.x + readoutBox!.width;
    const railRight = railBox!.x + railBox!.width;
    expect(readoutRight).toBeLessThanOrEqual(railRight + 1);
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
