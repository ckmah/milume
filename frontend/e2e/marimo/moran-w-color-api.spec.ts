import { expect, test } from "@playwright/test";

import { getModel, onCi, waitForLandmarksWidget } from "./helpers";

/**
 * Gene pick syncs color to the kernel; moran_plots reads widget.value + widget.color.
 * Run with E2E_MARIMO_NOTEBOOK=frontend/e2e/marimo/fixtures/moran-w-color-api.marimo.py
 */
test.describe("marimo kernel — moran w.color reactivity", () => {
  test("gene pick re-runs moran_plots (probe and plot output)", async ({ page }) => {
    test.slow(onCi(), "marimo kernel boot");
    await page.goto("/", { waitUntil: "domcontentloaded", timeout: 120_000 });
    await waitForLandmarksWidget(page);

    await expect(page.getByText("moran-w-color-probe gene=Apob")).toBeVisible({
      timeout: onCi() ? 120_000 : 60_000,
    });

    const plotImg = page.locator("img").last();
    await plotImg.waitFor({ state: "visible", timeout: 60_000 });
    const srcApob = (await plotImg.getAttribute("src")) ?? "";

    const genePicker = page.getByRole("combobox").first();
    await genePicker.click();
    await page.keyboard.press("Control+a");
    await page.keyboard.press("Backspace");
    await page.keyboard.type("Erbb3");
    await page.keyboard.press("Enter");

    await expect.poll(() => getModel(page, "active_genes")).toEqual(["Erbb3"]);
    await expect(page.getByText("moran-w-color-probe gene=Erbb3")).toBeVisible({
      timeout: onCi() ? 120_000 : 60_000,
    });
    await expect
      .poll(async () => (await plotImg.getAttribute("src")) !== srcApob, {
        timeout: onCi() ? 120_000 : 60_000,
      })
      .toBe(true);
  });
});
