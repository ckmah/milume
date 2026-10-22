import { expect, type Page } from "@playwright/test";

import { test } from "../fixtures";

import { bootLandmarksHarness, getModel, setModel } from "../helpers";

type Stats = {
  fetches: number;
  fetchedGenes: number;
  densified: number;
  lruBytes: number;
  lruGenes: number;
  pinnedGenes: number;
  denseColumns: number;
  denseBytes: number;
  pending: number;
};

const stats = (page: Page) => page.evaluate(() => (window as any).__landmarksEngine.getGeneStats() as Stats);
const requests = (page: Page) => page.evaluate(() => (window as any).__geneRequests() as string[][]);

/** Fill colour of every point (sRGB bytes), via the 2D layer's own accessor. */
function pointColors(page: Page) {
  return page.evaluate(() => {
    const engine = (window as any).__landmarksEngine;
    return (engine.getScatterPointsInWindow(0, 0, 1e9) as { color: number[] }[]).map((p) =>
      p.color.slice(0, 3).join(","),
    );
  });
}

async function openGenesTab(page: Page) {
  const right = page.locator(".landmarks__chrome-dock--right");
  if ((await right.getAttribute("data-collapsed")) === "true") {
    await page.getByRole("button", { name: "Show right panel" }).click();
  }
  await page.getByTestId("explore-color-by").getByRole("tab", { name: "genes" }).click();
}

async function pickGene(page: Page, name: string) {
  await page.getByTestId("explore-color-controls").getByPlaceholder("Select genes").click();
  await page.keyboard.type(name);
  await page.getByRole("option", { name, exact: true }).click();
}

async function catalog(page: Page) {
  return page.evaluate(() =>
    ((window as any).__landmarksModel.get("gene_names") as { name: string }[]).map((g) => g.name),
  );
}

test.describe("Landmarks lazy genes", () => {
  test.beforeEach(async ({ page }) => {
    await bootLandmarksHarness(page);
  });

  test("opens with a names-only catalog and fetches nothing until a gene is coloured", async ({ page }) => {
    const cols = await getModel(page, "gene_names");
    expect(cols.length).toBeGreaterThan(100);
    expect(cols.every((g: object) => Object.keys(g).join() === "name")).toBe(true);
    expect(await getModel(page, "gene_csc_data")).toBe("");
    expect(await requests(page)).toEqual([]);
    const s = await stats(page);
    expect(s.lruGenes + s.pinnedGenes + s.denseColumns).toBe(0);
  });

  test("one gene: fetched once on pick, painted from one dense column", async ({ page }) => {
    await openGenesTab(page);
    const [gene] = await catalog(page);
    const before = await pointColors(page);
    await pickGene(page, gene!);
    await expect.poll(() => getModel(page, "active_genes")).toEqual([gene]);
    await expect.poll(() => requests(page)).toEqual([[gene]]);
    await expect.poll(async () => (await pointColors(page)).join("|")).not.toBe(before.join("|"));
    const s = await stats(page);
    expect(s.fetchedGenes).toBe(1);
    expect(s.denseColumns).toBe(1);
    const n = before.length;
    expect(s.denseBytes).toBe(n * 4);
    // Re-picking the same gene later is served from the cache.
    await setModel(page, { active_genes: [] });
    await setModel(page, { active_genes: [gene] });
    await expect.poll(async () => (await stats(page)).denseColumns).toBe(1);
    expect(await requests(page)).toEqual([[gene]]);
  });

  test("three genes keep one RGB channel each; Python-set active_genes fetch too", async ({ page }) => {
    const genes = (await catalog(page)).slice(0, 3);
    await setModel(page, { active_genes: genes, color_mode: "continuous" });
    await expect.poll(async () => (await stats(page)).fetchedGenes).toBe(3);
    expect(await requests(page)).toEqual([genes]);
    await openGenesTab(page);
    await expect(page.getByTestId("genes-aggregate")).toHaveCount(0);
    const colors = new Set(await pointColors(page));
    expect(colors.size).toBeGreaterThan(3);
    const s = await stats(page);
    expect(s.denseColumns).toBe(3);
  });

  test("five genes colour by one aggregate with mean / median / max", async ({ page }) => {
    const genes = (await catalog(page)).slice(10, 15);
    await setModel(page, { active_genes: genes, color_mode: "continuous" });
    await openGenesTab(page);
    const control = page.getByTestId("genes-aggregate");
    await expect(control).toBeVisible();
    await expect.poll(async () => (await stats(page)).fetchedGenes).toBe(5);
    const by: Record<string, string[]> = {};
    for (const mode of ["mean", "median", "max"]) {
      await control.getByTestId(`genes-aggregate-${mode}`).click();
      await expect(control.getByTestId(`genes-aggregate-${mode}`)).toHaveAttribute("data-state", "on");
      await expect.poll(async () => (await pointColors(page)).join("|")).not.toBe(by.mean?.join("|") ?? "");
      by[mode] = await pointColors(page);
      // Single colormap: every expressing point sits on the first gene's magenta ramp.
      for (const c of new Set(by[mode])) {
        const [r, g, b] = c.split(",").map(Number);
        if (`${r},${g},${b}` === "107,114,128") continue;
        expect(g, `point ${c} on the magenta ramp`).toBe(0);
        expect(Math.abs(b! - Math.round(r! * 0.6))).toBeLessThanOrEqual(1);
      }
    }
    expect(by.max!.join("|")).not.toBe(by.mean!.join("|"));
    expect(by.median!.join("|")).not.toBe(by.mean!.join("|"));
    const s = await stats(page);
    expect(s.denseColumns).toBe(5);
    expect(await requests(page)).toEqual([genes]);
  });

  test("no whole-matrix densify: dense columns track on-screen genes only", async ({ page }) => {
    const all = await catalog(page);
    for (let k = 0; k < 6; k++) {
      await setModel(page, { active_genes: all.slice(k * 3, k * 3 + 3), color_mode: "continuous" });
      await expect.poll(async () => (await stats(page)).pending).toBe(0);
      await pointColors(page);
    }
    const s = await stats(page);
    expect(s.lruGenes).toBe(18);
    expect(s.denseColumns).toBe(3);
    const n = (await pointColors(page)).length;
    expect(s.denseBytes).toBe(3 * n * 4);
    expect(s.denseBytes).toBeLessThan(all.length * n * 4);
  });

  test("a failed fetch says so in the legend", async ({ page }) => {
    await page.evaluate(() => ((window as any).__geneCommHook = { fail: true }));
    const [gene] = (await catalog(page)).slice(30, 31);
    await setModel(page, { active_genes: [gene], color_mode: "continuous" });
    await openGenesTab(page);
    await expect(page.getByTestId("genes-load-status")).toContainText(`Couldn't load ${gene}`);
    await page.evaluate(() => delete (window as any).__geneCommHook);
  });
});

test.describe("Landmarks eager genes", () => {
  test("the genes= pack is pinned: colouring never calls the kernel", { tag: "@isolated" }, async ({ page }) => {
    await page.goto("/?eagerGenes=1", { waitUntil: "networkidle" });
    await page.waitForFunction(() => Boolean((window as any).__landmarksEngine));
    expect((await getModel(page, "gene_csc_data")).length).toBeGreaterThan(0);
    const genes = (await catalog(page)).slice(0, 5);
    await setModel(page, { active_genes: genes, color_mode: "continuous" });
    await expect.poll(async () => (await stats(page)).denseColumns).toBe(5);
    expect(await requests(page)).toEqual([]);
    expect((await stats(page)).pinnedGenes).toBe((await catalog(page)).length);
  });
});
