import { expect, test } from "@playwright/test";

import { getModel, onCi, setModelFromBrowser, waitForLandmarksWidget } from "./helpers";

/**
 * Gzip eager gene pack through a real marimo kernel
 * (E2E_MARIMO_NOTEBOOK=frontend/e2e/marimo/fixtures/gzip-eager-api.marimo.py).
 */
test.describe("marimo kernel — gzip eager genes", () => {
  test("Python preloads gzip CSC; browser colours without _gene_get", async ({ page }) => {
    test.slow(onCi(), "marimo kernel boot");
    await page.goto("/", { waitUntil: "domcontentloaded", timeout: 120_000 });
    await waitForLandmarksWidget(page);

    await expect(page.getByText(/gzip-probe codec=gzip/)).toBeVisible({ timeout: onCi() ? 120_000 : 30_000 });
    await expect.poll(async () => getModel(page, "gene_csc_codec")).toBe("gzip");
    const names = (await getModel(page, "gene_names")) as Array<{ name: string }>;
    expect(names.length).toBeGreaterThan(0);
    const stats = () => page.evaluate(() => (window as any).__landmarksEngine.getGeneStats());
    await expect.poll(async () => (await stats()).pinnedGenes, { timeout: 60_000 }).toBe(names.length);
    await setModelFromBrowser(page, { active_genes: [names[0]!.name], color_mode: "continuous" });
    await expect.poll(async () => (await stats()).denseColumns, { timeout: 60_000 }).toBe(1);
    expect((await stats()).fetchedGenes).toBe(0);
  });
});
