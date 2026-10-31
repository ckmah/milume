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
    await expect(page.getByText(/api-probe n=1 color=cell_id inspect_open=True/)).toBeVisible();

    await setModelFromBrowser(page, { selections: [{ id: "api-sel", point_indices: [0, 1, 2] }] });
    await expect(page.getByText(/api-probe n=3 color=cell_id inspect_open=True/)).toBeVisible({
      timeout: onCi() ? 120_000 : 30_000,
    });
  });

  test("Python opens the Inspect cube with no click; it loads over volume_get and its close syncs back", async ({
    page,
  }) => {
    test.slow(onCi(), "marimo kernel boot");
    await page.goto("/", { waitUntil: "domcontentloaded", timeout: 120_000 });
    await waitForLandmarksWidget(page);

    // `w.inspect_open = True` ran before display: the cube is open at the volume centre.
    const cube = page.getByRole("dialog", { name: "Cube" });
    await expect(cube).toBeVisible({ timeout: onCi() ? 120_000 : 60_000 });
    expect(await getModel(page, "inspect_cx")).toBe(128);
    expect(await getModel(page, "inspect_cy")).toBe(128);
    // Its image and cell polygons arrive through the kernel's volume_get command (DataView buffers).
    const view = cube.locator(".volume-cube__view");
    await expect(view).toHaveAttribute("data-refining", "false", { timeout: onCi() ? 120_000 : 60_000 });
    await expect(view).toHaveAttribute("data-labels", "on");
    await expect(page.getByTestId("inspect-status")).not.toHaveAttribute("data-state", "error");

    // The browser closes it (what Esc writes); Python's reactive cell reads the close.
    await setModelFromBrowser(page, { inspect_open: false });
    await expect(cube).toHaveCount(0);
    await expect(page.getByText("inspect_open=False")).toBeVisible({ timeout: onCi() ? 120_000 : 30_000 });
  });

  test("a gene coloured in the browser loads over the kernel's _gene_get command (binary buffers)", async ({ page }) => {
    test.slow(onCi(), "marimo kernel boot");
    await page.goto("/", { waitUntil: "domcontentloaded", timeout: 120_000 });
    await waitForLandmarksWidget(page);

    // Names-only catalog at comm-open: nothing preloaded.
    expect(((await getModel(page, "_color_options")) as { genes: { name: string }[] }).genes).toEqual([
      expect.objectContaining({ name: "0" }),
    ]);
    expect(await getModel(page, "_gene_csc_data")).toBe("");
    await setModelFromBrowser(page, { color: "0" });
    const stats = () => page.evaluate(() => (window as any).__landmarksEngine.getGeneStats());
    await expect.poll(async () => (await stats()).fetchedGenes, { timeout: 60_000 }).toBe(1);
    const s = await stats();
    expect(s.denseColumns).toBe(1);
    expect(s.pending).toBe(0);
  });
});
