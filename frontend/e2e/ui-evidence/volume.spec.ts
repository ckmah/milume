import { expect } from "@playwright/test";

import { test } from "../fixtures";

import { bootLandmarksVolumeHarness, canvasBox, stabilizeUi } from "../helpers";
import { uiEvidencePng } from "./paths";

const cubeWindow = (page: import("@playwright/test").Page) => page.getByRole("dialog", { name: "Cube" });

test.describe.configure({ mode: "serial" });

test.describe("UI evidence — volume harness", () => {
  test.beforeEach(async ({ page }) => {
    await bootLandmarksVolumeHarness(page);
    await stabilizeUi(page);
  });

  test("05 cube top view", async ({ page }) => {
    await page.getByRole("radio", { name: "Inspect", exact: true }).click();
    const box = await canvasBox(page);
    await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.5);
    await expect(cubeWindow(page)).toBeVisible();
    const bar = page.getByTestId("context-inspect-toolbar");
    await bar.getByRole("radio", { name: "Top view" }).click();
    await expect(bar.getByRole("radio", { name: "Top view" })).toHaveAttribute("aria-checked", "true");
    const view = cubeWindow(page).locator(".volume-cube__view");
    await expect(view).toHaveAttribute("data-refining", "false");
    await view.screenshot({ path: uiEvidencePng("05-cube-top.png") });
  });

  test("06 cube oblique view", async ({ page }) => {
    await page.getByRole("radio", { name: "Inspect", exact: true }).click();
    const box = await canvasBox(page);
    await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.5);
    await expect(cubeWindow(page)).toBeVisible();
    const bar = page.getByTestId("context-inspect-toolbar");
    await bar.getByRole("radio", { name: "Oblique view" }).click();
    const view = cubeWindow(page).locator(".volume-cube__view");
    await expect(bar.getByRole("radio", { name: "Oblique view" })).toHaveAttribute("aria-checked", "true");
    await view.screenshot({ path: uiEvidencePng("06-cube-oblique.png") });
  });
});
