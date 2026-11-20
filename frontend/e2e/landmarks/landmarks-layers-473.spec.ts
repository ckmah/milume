import { expect, type Page } from "@playwright/test";

import { test } from "../fixtures";
import { bootLandmarksHarness, setModel, stabilizeUi } from "../helpers";

async function openLayers(page: Page) {
  const header = page.getByTestId("panel-section-layers");
  const expanded = await header.getByRole("button", { name: "Collapse Layers" }).count();
  if (!expanded) await header.click();
  await expect(page.getByTestId("layers-cells-row")).toBeVisible();
}

test("cells visibility, micrometre diameter, image sliders, and scale bar", async ({ page }) => {
  await bootLandmarksHarness(page);
  await setModel(page, {
    point_size: 4,
    _um_per_unit: 1,
    _cells_visible: true,
    _cells_opacity: 0.8,
    volume: {
      image_url: "fixture://dapi",
      contrast_limits: [0, 255],
      channels: [{ name: "DAPI", visible: true, contrast_limits: [12, 180] }],
    },
    _image_channels: [{ name: "DAPI", visible: true, contrast_limits: [12, 180] }],
    _image_visible: true,
    _image_alpha: 0.55,
  });
  await stabilizeUi(page);
  await openLayers(page);

  const cells = page.getByTestId("layers-cells-row");
  const chevron = cells.getByRole("button", { name: /cells layer/i });
  const toggle = page.getByTestId("layer-toggle-cells");
  const label = cells.locator(".landmarks-layer-label");
  const [chevronBox, labelBox, toggleBox] = await Promise.all([
    chevron.boundingBox(),
    label.boundingBox(),
    toggle.boundingBox(),
  ]);
  expect(chevronBox && labelBox && toggleBox).toBeTruthy();
  expect(chevronBox!.x).toBeLessThan(labelBox!.x);
  expect(toggleBox!.x).toBeGreaterThan(labelBox!.x);
  await expect(toggle).toHaveAttribute("aria-checked", "true");

  const sectionChevron = page.getByTestId("panel-section-layers").getByRole("button", { name: "Collapse Layers" });
  const sectionLabel = page.getByTestId("panel-section-layers").locator(".landmarks-panel-section-header__label");
  const [sectionChevronBox, sectionLabelBox] = await Promise.all([
    sectionChevron.boundingBox(),
    sectionLabel.boundingBox(),
  ]);
  expect(sectionChevronBox!.x).toBeLessThan(sectionLabelBox!.x);

  const size = page.getByTestId("layer-cells-point-size");
  await expect(size.locator(".tact-readout")).toHaveText("8.0 µm");
  await expect(size.getByRole("slider")).toBeEnabled();
  await expect(page.getByTestId("layer-cells-opacity")).toBeVisible();

  const before = await page.evaluate(() => (window as any).__landmarksModel.get("point_size"));
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  await expect(size.getByRole("slider")).toBeDisabled();
  await expect.poll(async () => page.evaluate(() => (window as any).__landmarksEngine.getLayerIds() as string[])).not.toContain("landmarks-points");
  expect(await page.evaluate(() => (window as any).__landmarksModel.get("point_size"))).toBe(before);

  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  await expect(size.locator(".tact-readout")).toHaveText("8.0 µm");
  expect(await page.evaluate(() => (window as any).__landmarksModel.get("point_size"))).toBe(before);
  await expect.poll(async () => page.evaluate(() => (window as any).__landmarksEngine.getLayerIds() as string[])).toContain("landmarks-points");

  await page.getByTestId("layers-image-row").click();
  await expect(page.getByTestId("layer-image-opacity")).toBeVisible();
  await expect(page.getByTestId("layer-image-contrast")).toBeVisible();
  await expect(page.locator(".landmarks-slider-caption").filter({ hasText: "DAPI contrast" })).toBeVisible();
  await expect(page.locator(".landmarks-slider-caption").filter({ hasText: "Opacity" }).last()).toBeVisible();

  const scale = page.getByTestId("map-scale-bar");
  await expect(scale).toBeVisible();
  await expect(scale).toContainText("µm");
});
