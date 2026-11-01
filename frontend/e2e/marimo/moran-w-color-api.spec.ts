import { expect, test } from "@playwright/test";

import { getModel, onCi, setModelFromBrowser, waitForLandmarksWidget } from "./helpers";

/**
 * Reactive result_figure follows w.color once kernel sync lands (#404).
 * Run with E2E_MARIMO_NOTEBOOK=frontend/e2e/marimo/fixtures/moran-w-color-api.marimo.py
 */
test.describe("marimo kernel — moran w.color reactivity", () => {
  test("color sync re-runs result_figure (probe and plot output)", async ({ page }) => {
    test.skip(true, "needs #404: color syncs to kernel");
    test.slow(onCi(), "marimo kernel boot");
    await page.goto("/", { waitUntil: "domcontentloaded", timeout: 120_000 });
    await waitForLandmarksWidget(page);

    await expect(page.getByText("moran-w-color-probe gene=Apob")).toBeVisible({
      timeout: onCi() ? 120_000 : 60_000,
    });

    const plotImg = page.locator("img").last();
    await plotImg.waitFor({ state: "visible", timeout: 60_000 });
    const srcApob = (await plotImg.getAttribute("src")) ?? "";

    await setModelFromBrowser(page, { color: "Erbb3" });
    await expect.poll(() => getModel(page, "color")).toBe("Erbb3");

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
