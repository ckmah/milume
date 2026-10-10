import { expect } from "@playwright/test";

import { test } from "../fixtures";

import {
  bootLandmarksHarness,
  canvasBox,
  clickLandmarkTool,
  setModel,
  stabilizeUi,
} from "../helpers";
import { uiEvidencePng } from "./paths";

test.describe.configure({ mode: "serial" });

test.describe("UI evidence — landmarks harness", () => {
  test.beforeEach(async ({ page }) => {
    await bootLandmarksHarness(page);
    await stabilizeUi(page);
  });

  test("01 landmarks rest", async ({ page }) => {
    const widget = page.locator(".landmarks").first();
    await expect(widget).toBeVisible();
    await widget.screenshot({ path: uiEvidencePng("01-landmarks-rest.png") });
  });

  test("02 after place point", async ({ page }) => {
    const widget = page.locator(".landmarks").first();
    await clickLandmarkTool(page, "Point");
    const box = await canvasBox(page);
    await page.mouse.click(box.x + box.width * 0.55, box.y + box.height * 0.45);
    await widget.screenshot({ path: uiEvidencePng("02-landmarks-point.png") });
  });

  test("03 selection neighborhood", async ({ page }) => {
    const widget = page.locator(".landmarks").first();
    await setModel(page, { selected_kind: "selection", selected_index: 0 });
    await expect
      .poll(async () => (await page.evaluate(() => (window as any).__landmarksEngine.getSelectionOverlay())).length)
      .toBeGreaterThan(0);
    await widget.screenshot({ path: uiEvidencePng("03-landmarks-selection.png") });
  });
});
