import { expect, type Page } from "@playwright/test";

import { test } from "../fixtures";

import { bootLandmarksHarness, getModel } from "../helpers";

const CATALOG_SIZE = 18028;
const MAX_DOM_OPTIONS = 250;
/** Filter scan is unit-tested at 18k (<100 ms); this budget includes rendering up to 250 options. */
const OPEN_LATENCY_MS = 100;
const QUERY_UI_LATENCY_MS = 150;

const controls = (page: Page) => page.getByTestId("explore-color-controls");
const input = (page: Page) => controls(page).locator('[data-slot="combobox-chip-input"]');
const options = (page: Page) => page.locator('[data-slot="combobox-item"]');

async function openGenesTab(page: Page) {
  const right = page.locator(".landmarks__chrome-dock--right");
  if ((await right.getAttribute("data-collapsed")) === "true") {
    await page.getByRole("button", { name: "Show right panel" }).click();
  }
  await page.getByTestId("explore-color-by").getByRole("tab", { name: "genes" }).click();
}

async function install18kCatalog(page: Page) {
  await page.evaluate((size) => {
    const model = (window as any).__landmarksModel;
    const existing = ((model.get("gene_names") as { name: string }[]) ?? []).map((g) => g.name);
    const genes = Array.from({ length: size }, (_, i) => ({
      name: existing[i] ?? `SYN_${String(i).padStart(5, "0")}`,
    }));
    model.set("gene_names", genes);
    model.save_changes();
  }, CATALOG_SIZE);
}

async function catalogSize(page: Page) {
  return page.evaluate(
    () => ((window as any).__landmarksModel.get("gene_names") as { name: string }[]).length,
  );
}

async function measureOpenPickerMs(page: Page) {
  return page.evaluate(() => {
    const inputEl = document.querySelector(
      '[data-testid="explore-color-controls"] [data-slot="combobox-chip-input"]',
    ) as HTMLInputElement | null;
    if (!inputEl) throw new Error("genes combobox input missing");
    const t0 = performance.now();
    inputEl.focus();
    inputEl.click();
    return performance.now() - t0;
  });
}

test.describe("Landmarks genes picker 18k catalog (#254)", () => {
  test.beforeEach(async ({ page }) => {
    await bootLandmarksHarness(page);
    await openGenesTab(page);
    await install18kCatalog(page);
    expect(await catalogSize(page)).toBe(CATALOG_SIZE);
  });

  test("search-first popup keeps a bounded option count", async ({ page }) => {
    const openMs = await measureOpenPickerMs(page);
    expect(openMs).toBeLessThan(OPEN_LATENCY_MS);
    await expect(options(page)).toHaveCount(0);

    const typeStart = await page.evaluate(() => performance.now());
    await input(page).fill("syn");
    await expect(page.getByRole("listbox")).toBeVisible();
    await expect.poll(() => options(page).count()).toBeGreaterThan(0);
    const typeMs = await page.evaluate((t0) => performance.now() - t0, typeStart);
    expect(typeMs).toBeLessThan(QUERY_UI_LATENCY_MS);
    expect(await options(page).count()).toBeLessThanOrEqual(MAX_DOM_OPTIONS);
  });

  test("substring search then keyboard pick", async ({ page }) => {
    const target = "SYN_09999";
    await input(page).click();
    await page.keyboard.type("9999");
    await expect(page.getByRole("option", { name: target, exact: true })).toBeVisible();
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await expect.poll(() => getModel(page, "active_genes")).toEqual([target]);
    await expect(controls(page).locator('[data-slot="combobox-chip"]')).toHaveCount(1);
  });
});
