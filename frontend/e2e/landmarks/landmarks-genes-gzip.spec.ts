import { expect, type Page } from "@playwright/test";

import { test } from "../fixtures";

import { bootLandmarksHarness, getModel, setModel } from "../helpers";

type Stats = {
  pinnedGenes: number;
  denseColumns: number;
};

const stats = (page: Page) => page.evaluate(() => (window as any).__landmarksEngine.getGeneStats() as Stats);

function pointColors(page: Page) {
  return page.evaluate(() => {
    const engine = (window as any).__landmarksEngine;
    return (engine.getScatterPointsInWindow(0, 0, 1e9) as { color: number[] }[]).map((p) =>
      p.color.slice(0, 3).join(","),
    );
  });
}

test.describe("Landmarks gzip gene pack", () => {
  test("colours from a gzip CSC fixture without comm", { tag: "@isolated" }, async ({ page }) => {
    await page.goto("/?fixture=/squidpy-niche-fixture.json&eagerGenes=1", { waitUntil: "networkidle" });
    await page.waitForFunction(() => Boolean((window as any).__landmarksEngine));
    expect(await getModel(page, "gene_csc_codec")).toBe("gzip");
    const genes = (
      (await getModel(page, "gene_names")) as Array<{ name: string; vmin?: number; vmax?: number }>
    ).map((g) => g.name);
    expect(genes.length).toBeGreaterThan(0);
    await expect.poll(async () => (await stats(page)).pinnedGenes).toBe(genes.length);
    const before = await pointColors(page);
    const gene = genes.find((name) => name === "Lgr5") ?? genes[0]!;
    await setModel(page, { active_genes: [gene], color_mode: "continuous" });
    await expect.poll(async () => (await stats(page)).denseColumns).toBe(1);
    await expect.poll(async () => (await pointColors(page)).join("|")).not.toBe(before.join("|"));
    expect(await page.evaluate(() => (window as any).__geneRequests())).toEqual([]);
  });
});
