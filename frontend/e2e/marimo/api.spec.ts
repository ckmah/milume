import { expect, test } from "@playwright/test";

import { getModel, onCi, setModelFromBrowser, waitForLandmarksWidget } from "./helpers";

/**
 * Python API through a real marimo kernel (run with
 * E2E_MARIMO_NOTEBOOK=frontend/e2e/marimo/fixtures/toy-api.marimo.py).
 * No UI gestures: traits are set from Python, or written to the model directly.
 */
test.describe("marimo kernel — Python API", () => {
  test("color and selections set in Python sync, and get_obs_names re-runs reactively", async ({ page }) => {
    test.slow(onCi(), "marimo kernel boot");
    await page.goto("/", { waitUntil: "domcontentloaded", timeout: 120_000 });
    await waitForLandmarksWidget(page);

    await expect.poll(() => getModel(page, "color")).toBe("cell_id");
    await expect
      .poll(async () => ((await getModel(page, "selections")) as { id: string }[]).map((s) => s.id))
      .toEqual(["api-sel"]);
    await expect(page.getByText("api-probe n=1 color=cell_id")).toBeVisible();

    await setModelFromBrowser(page, { selections: [{ id: "api-sel", point_indices: [0, 1, 2] }] });
    await expect(page.getByText("api-probe n=3 color=cell_id")).toBeVisible({
      timeout: onCi() ? 120_000 : 30_000,
    });
  });
});
