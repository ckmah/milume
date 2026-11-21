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
  expect(toggleBox!.x - (labelBox!.x + labelBox!.width)).toBeLessThan(16);
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

  const imageRow = page.getByTestId("layers-image-row");
  if ((await imageRow.getAttribute("aria-expanded")) !== "true") await imageRow.click();
  await expect(page.getByTestId("layer-image-opacity")).toBeVisible();
  await expect(page.getByTestId("layer-image-contrast")).toBeVisible();
  await expect(page.locator(".landmarks-slider-caption").filter({ hasText: "DAPI contrast" })).toBeVisible();
  await expect(page.locator(".landmarks-slider-caption").filter({ hasText: "Opacity" }).last()).toBeVisible();

  const scale = page.getByTestId("map-scale-bar");
  await expect(scale).toBeVisible();
  await expect(scale).toContainText("µm");

  const contrastRow = page.getByTestId("layer-image-contrast");
  const [captionBox, trackBox, readoutBox] = await Promise.all([
    contrastRow.locator(".landmarks-slider-caption").boundingBox(),
    contrastRow.locator(".landmarks-slider-control").boundingBox(),
    contrastRow.locator(".tact-readout").boundingBox(),
  ]);
  expect(captionBox && trackBox && readoutBox).toBeTruthy();
  expect(captionBox!.x).toBeLessThan(trackBox!.x);
  expect(trackBox!.x).toBeLessThan(readoutBox!.x);
  expect(Math.abs(captionBox!.y - trackBox!.y)).toBeLessThan(8);
});

test("image layer sliders are independent and long labels truncate", async ({ page }) => {
  await bootLandmarksHarness(page);
  const longName = "Immunofluorescence_channel_alpha";
  await setModel(page, {
    volume: {
      image_url: "fixture://dapi",
      contrast_limits: [0, 255],
      channels: [
        { name: "DAPI", visible: true, contrast_limits: [10, 200], alpha: 0.4 },
        { name: "PanCK", visible: true, contrast_limits: [20, 180], alpha: 0.7 },
        { name: longName, visible: true, contrast_limits: [0, 255], alpha: 0.5 },
      ],
    },
    _image_channels: [
      { name: "DAPI", visible: true, contrast_limits: [10, 200], alpha: 0.4 },
      { name: "PanCK", visible: true, contrast_limits: [20, 180], alpha: 0.7 },
      { name: longName, visible: true, contrast_limits: [0, 255], alpha: 0.5 },
    ],
    _image_visible: true,
    _image_alpha: 0.55,
  });
  await stabilizeUi(page);
  await openLayers(page);
  const imageRow = page.getByTestId("layers-image-row");
  if ((await imageRow.getAttribute("aria-expanded")) !== "true") await imageRow.click();

  const dapiOpacity = page.getByTestId("layer-channel-opacity-DAPI").getByRole("slider");
  await dapiOpacity.focus();
  await dapiOpacity.press("End");
  const dapiContrast = page.getByRole("slider", { name: "DAPI contrast, maximum" });
  await dapiContrast.focus();
  await dapiContrast.press("ArrowLeft");

  await expect.poll(async () =>
    page.evaluate(() => {
      const rows = (window as any).__landmarksModel.get("_image_channels") as Array<{
        name: string;
        alpha?: number;
        contrast_limits: [number, number];
      }>;
      const byName = Object.fromEntries(rows.map((row) => [row.name, row]));
      return {
        dapiAlpha: byName.DAPI?.alpha,
        dapiHi: byName.DAPI?.contrast_limits?.[1],
        panckAlpha: byName.PanCK?.alpha,
        panckHi: byName.PanCK?.contrast_limits?.[1],
      };
    }),
  ).toEqual({ dapiAlpha: 1, dapiHi: 199, panckAlpha: 0.7, panckHi: 180 });

  const caption = page.locator(".landmarks-slider-caption", { hasText: `${longName} contrast` });
  await caption.scrollIntoViewIfNeeded();
  await expect(caption).toHaveAttribute("title", `${longName} contrast`);
  const truncated = await caption.evaluate((el) => {
    const style = getComputedStyle(el);
    return style.textOverflow === "ellipsis" && el.scrollWidth > el.clientWidth + 0.5;
  });
  expect(truncated).toBe(true);
});
