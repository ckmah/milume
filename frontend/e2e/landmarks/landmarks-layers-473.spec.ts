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

  const selectionsHeader = page.getByTestId("panel-section-selections");
  if (!(await selectionsHeader.getByRole("button", { name: "Collapse Selections" }).count())) {
    await selectionsHeader.click();
  }
  const selectionMenu = page.getByTestId("selection-row").first().getByRole("button", { name: "Layer actions" });
  const dock = page.locator(".landmarks__chrome-dock--left");
  const [selectionMenuBox, dockBox] = await Promise.all([
    selectionMenu.boundingBox(),
    dock.boundingBox(),
  ]);
  expect(selectionMenuBox && dockBox).toBeTruthy();
  expect(dockBox!.x + dockBox!.width - (selectionMenuBox!.x + selectionMenuBox!.width)).toBeLessThan(24);

  await openLayers(page);

  const toggle = page.getByTestId("layer-toggle-cells");
  await page.getByRole("tab", { name: "cat" }).click();
  await page.getByRole("button", { name: "Expand region" }).click();
  const regionList = page.locator(".group\\/cat").filter({ hasText: "Cortex" });
  await expect(page.getByTestId("category-row")).toHaveCount(3);
  await expect(regionList.locator("[data-group-row] .landmarks-layer-label")).toHaveCount(4);
  await expect(toggle).toHaveAttribute("aria-checked", "true");

  const size = page.getByTestId("layer-cells-point-size");
  const readout = size.locator(".tact-readout");
  await expect(readout).toHaveText("8.0 µm");
  await expect(size.getByRole("slider")).toBeEnabled();
  expect(await readout.evaluate((el) => getComputedStyle(el).color)).toBe("rgb(237, 181, 74)");
  await expect(page.getByTestId("layer-cells-opacity")).toBeVisible();

  const before = await page.evaluate(() => (window as any).__landmarksModel.get("point_size"));
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  await expect(size.getByRole("slider")).toBeDisabled();
  expect(await readout.evaluate((el) => getComputedStyle(el).color)).toBe("rgb(208, 208, 208)");
  await expect.poll(async () => page.evaluate(() => (window as any).__landmarksEngine.getLayerIds() as string[])).not.toContain("landmarks-points");
  expect(await page.evaluate(() => (window as any).__landmarksModel.get("point_size"))).toBe(before);

  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  await expect(size.locator(".tact-readout")).toHaveText("8.0 µm");
  expect(await page.evaluate(() => (window as any).__landmarksModel.get("point_size"))).toBe(before);
  await expect.poll(async () => page.evaluate(() => (window as any).__landmarksEngine.getLayerIds() as string[])).toContain("landmarks-points");

  const imageRow = page.getByTestId("layers-image-row");
  if ((await imageRow.getAttribute("aria-expanded")) !== "true") await imageRow.click();
  await expect(page.locator(".landmarks__layers-panel").getByText("Channels", { exact: true })).toHaveCount(0);
  await expect(page.getByTestId("layer-image-opacity")).toBeVisible();
  await expect(page.getByTestId("layer-image-contrast")).toBeVisible();
  await expect(page.locator(".landmarks-slider-caption").filter({ hasText: "DAPI contrast" })).toBeVisible();
  await expect(page.locator(".landmarks-slider-caption").filter({ hasText: "Opacity" }).last()).toBeVisible();

  const scale = page.getByTestId("map-scale-bar");
  const minimap = page.getByTestId("minimap-panel");
  await expect(scale).toBeVisible();
  await expect(scale).toContainText(/\d+(?:\.\d+)? µm/);
  const rule = scale.locator(".landmarks-scale-bar__rule");
  const rulePaint = await rule.evaluate((el) => {
    const cs = getComputedStyle(el);
    return {
      height: cs.height,
      left: cs.borderLeftWidth,
      right: cs.borderRightWidth,
      fill: cs.backgroundColor,
    };
  });
  expect(rulePaint.height).toBe("4px");
  expect(rulePaint.left).toBe("0px");
  expect(rulePaint.right).toBe("0px");
  expect(rulePaint.fill).toBe("rgb(255, 255, 255)");
  const [scaleBox, miniBox] = await Promise.all([scale.boundingBox(), minimap.boundingBox()]);
  expect(scaleBox && miniBox).toBeTruthy();
  // Minimap is bottom-right. The depth-rail slot, then the scale bar, sit to its left.
  const gap = miniBox!.x - (scaleBox!.x + scaleBox!.width);
  expect(gap).toBeGreaterThan(60);
  expect(gap).toBeLessThan(140);
  expect(Math.abs(scaleBox!.y + scaleBox!.height - (miniBox!.y + miniBox!.height))).toBeLessThan(2);
  await setModel(page, { _um_per_unit: 1_000_000 });
  await expect(scale).toContainText(/\d+(?:\.\d+)? mm/);
  await setModel(page, { _um_per_unit: 0 });
  await expect(scale).toContainText(/\d+(?:\.\d+)? px/);

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
  await expect(page.locator(".landmarks__layers-panel").getByText("Channels", { exact: true })).toHaveCount(0);

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
