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
    const options = (model.get("_color_options") as { genes?: { name: string }[]; obs?: object; embeddings?: object }) ?? {};
    const existing = (options.genes ?? []).map((g) => g.name);
    const genes = Array.from({ length: size }, (_, i) => ({
      name: existing[i] ?? `SYN_${String(i).padStart(5, "0")}`,
    }));
    model.set("_color_options", { obs: options.obs ?? {}, embeddings: options.embeddings ?? {}, genes });
    model.save_changes();
  }, CATALOG_SIZE);
}

async function catalogSize(page: Page) {
  return page.evaluate(
    () =>
      (((window as any).__landmarksModel.get("_color_options") as { genes?: unknown[] }).genes ?? []).length,
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

/** Keystroke-to-first-option latency inside the page (no Playwright round-trips). */
async function measureQueryToFirstOptionMs(page: Page, query: string) {
  return page.evaluate((q) => {
    const inputEl = document.querySelector(
      '[data-testid="explore-color-controls"] [data-slot="combobox-chip-input"]',
    ) as HTMLInputElement | null;
    if (!inputEl) throw new Error("genes combobox input missing");

    const countOptions = () => document.querySelectorAll('[data-slot="combobox-item"]').length;

    return new Promise<number>((resolve, reject) => {
      let settled = false;
      let rafWatch = 0;
      let t0 = 0;

      const finish = (start: number) => {
        if (settled) return;
        settled = true;
        observer.disconnect();
        cancelAnimationFrame(rafWatch);
        requestAnimationFrame(() => resolve(performance.now() - start));
      };

      const observer = new MutationObserver(() => {
        if (countOptions() > 0) finish(t0);
      });

      t0 = performance.now();
      observer.observe(document.body, { childList: true, subtree: true });

      inputEl.focus();
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      if (setter) setter.call(inputEl, q);
      else inputEl.value = q;
      inputEl.dispatchEvent(
        new InputEvent("input", { bubbles: true, inputType: "insertText", data: q }),
      );

      requestAnimationFrame(() => {
        if (countOptions() > 0) finish(t0);
      });

      const watch = () => {
        if (settled) return;
        if (countOptions() > 0) finish(t0);
        else rafWatch = requestAnimationFrame(watch);
      };
      rafWatch = requestAnimationFrame(watch);

      window.setTimeout(() => {
        if (settled) return;
        settled = true;
        observer.disconnect();
        cancelAnimationFrame(rafWatch);
        reject(new Error("timed out waiting for first combobox option"));
      }, 10_000);
    });
  }, query);
}

test.describe("Landmarks genes picker 18k catalog (#254)", () => {
  test.beforeEach(async ({ page }) => {
    await bootLandmarksHarness(page);
    await openGenesTab(page);
    await install18kCatalog(page);
    expect(await catalogSize(page)).toBe(CATALOG_SIZE);
  });

  test("search-first popup keeps a bounded option count", async ({ page }, testInfo) => {
    const openMs = await measureOpenPickerMs(page);
    expect(openMs).toBeLessThan(OPEN_LATENCY_MS);
    await expect(options(page)).toHaveCount(0);

    const queryMs = await measureQueryToFirstOptionMs(page, "syn");
    expect(queryMs).toBeLessThan(QUERY_UI_LATENCY_MS);
    testInfo.annotations.push(
      { type: "picker-open-ms", description: openMs.toFixed(2) },
      { type: "picker-query-ms", description: queryMs.toFixed(2) },
    );

    await expect(page.getByRole("listbox")).toBeVisible();
    expect(await options(page).count()).toBeGreaterThan(0);
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
