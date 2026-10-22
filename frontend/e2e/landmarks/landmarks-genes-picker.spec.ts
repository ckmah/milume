import { expect, type Page } from "@playwright/test";

import { test } from "../fixtures";

import { bootLandmarksHarness, getModel } from "../helpers";

// #252: Escape in the Explore genes picker must never drop the picked genes.

const controls = (page: Page) => page.getByTestId("explore-color-controls");
const input = (page: Page) => controls(page).locator('[data-slot="combobox-chip-input"]');
const chips = (page: Page) => controls(page).locator('[data-slot="combobox-chip"]');

async function openGenesTab(page: Page) {
  const right = page.locator(".landmarks__chrome-dock--right");
  if ((await right.getAttribute("data-collapsed")) === "true") {
    await page.getByRole("button", { name: "Show right panel" }).click();
  }
  await page.getByTestId("explore-color-by").getByRole("tab", { name: "genes" }).click();
}

async function catalog(page: Page) {
  return page.evaluate(() =>
    ((window as any).__landmarksModel.get("gene_names") as { name: string }[]).map((g) => g.name),
  );
}

async function pickGenes(page: Page, names: string[]) {
  for (const name of names) {
    await input(page).click();
    await page.keyboard.type(name);
    await page.getByRole("option", { name, exact: true }).click();
  }
  await expect.poll(() => getModel(page, "active_genes")).toEqual(names);
  await expect(chips(page)).toHaveCount(names.length);
}

test.describe("Landmarks genes picker", () => {
  let genes: string[];

  test.beforeEach(async ({ page }) => {
    await bootLandmarksHarness(page);
    await openGenesTab(page);
    genes = (await catalog(page)).slice(0, 3);
  });

  test("Escape with the popup closed keeps the picked genes", async ({ page }) => {
    await pickGenes(page, genes);
    // The popup closes after a pick; focus stays in the combobox input.
    await expect(page.getByRole("listbox")).toHaveCount(0);
    await expect(input(page)).toBeFocused();
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    expect(await getModel(page, "active_genes")).toEqual(genes);
    await expect(chips(page)).toHaveCount(genes.length);
  });

  test("Escape with the popup open closes it and keeps the picked genes", async ({ page }) => {
    await pickGenes(page, genes.slice(0, 2));
    await input(page).click();
    await page.keyboard.type(genes[2]!.slice(0, 1));
    await expect(page.getByRole("listbox")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("listbox")).toHaveCount(0);
    expect(await getModel(page, "active_genes")).toEqual(genes.slice(0, 2));
    // A reflexive second Escape (popup now closed) still keeps them.
    await page.keyboard.press("Escape");
    expect(await getModel(page, "active_genes")).toEqual(genes.slice(0, 2));
    await expect(chips(page)).toHaveCount(2);
  });

  test("the × clear button and chip removal still clear genes", async ({ page }) => {
    await pickGenes(page, genes);
    await chips(page).nth(1).locator('[data-slot="combobox-chip-remove"]').click();
    await expect.poll(() => getModel(page, "active_genes")).toEqual([genes[0], genes[2]]);
    await controls(page).locator('[data-slot="combobox-clear"]').click();
    await expect.poll(() => getModel(page, "active_genes")).toEqual([]);
    await expect(chips(page)).toHaveCount(0);
  });
});
