import { expect, type Page } from "@playwright/test";

import { test } from "../fixtures";

import { bootLandmarksHarness, getModel } from "../helpers";

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

async function openGenesTab(page: Page) {
  const right = page.locator(".landmarks__chrome-dock--right");
  if ((await right.getAttribute("data-collapsed")) === "true") {
    await page.getByRole("button", { name: "Show right panel" }).click();
  }
  await page.getByTestId("explore-color-by").getByRole("tab", { name: "genes" }).click();
}

async function pickerListState(page: Page) {
  return page.evaluate(() => {
    const empty = document.querySelector('[data-slot="combobox-empty"]');
    const emptyVisible =
      empty instanceof HTMLElement &&
      empty.classList.contains("group-data-empty/combobox-content:flex");
    const optionCount = document.querySelectorAll('[data-slot="combobox-item"]').length;
    const inputEl = document.querySelector(
      '[data-testid="explore-color-controls"] [data-slot="combobox-chip-input"]',
    ) as HTMLInputElement | null;
    return {
      input: inputEl?.value ?? "",
      optionCount,
      emptyVisible: Boolean(emptyVisible && optionCount === 0),
    };
  });
}

test.describe("Landmarks genes combobox filter sync (#387)", () => {
  test.beforeEach(async ({ page }) => {
    await bootLandmarksHarness(page);
    await openGenesTab(page);
    await expect.poll(() => getModel(page, "gene_names")).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "Abtb3" })]),
    );
  });

  test("full-string input shows Abtb3 before empty state sticks", async ({ page }) => {
    const genePicker = page.getByTestId("explore-color-controls").getByPlaceholder("Select genes");
    await genePicker.click();

    const latencyMs = await measureQueryToFirstOptionMs(page, "Abtb3");
    expect(latencyMs).toBeLessThan(5000);
    const state = await pickerListState(page);
    expect(state.input).toBe("Abtb3");
    expect(state.optionCount).toBeGreaterThan(0);
    expect(state.emptyVisible).toBe(false);
    await expect(page.getByRole("option", { name: "Abtb3", exact: true })).toBeVisible();
  });

  test("per-keystroke typing keeps options in sync", async ({ page }) => {
    const genePicker = page.getByTestId("explore-color-controls").getByPlaceholder("Select genes");
    await genePicker.click();

    for (const ch of "Abtb3") {
      await page.keyboard.press(ch);
      const state = await pickerListState(page);
      expect(state.emptyVisible).toBe(false);
      if (ch === "3") {
        expect(state.optionCount).toBeGreaterThan(0);
      }
    }
    await expect(page.getByRole("option", { name: "Abtb3", exact: true })).toBeVisible();
  });

  test("composition end commits filter for the full query", async ({ page }) => {
    const genePicker = page.getByTestId("explore-color-controls").getByPlaceholder("Select genes");
    await genePicker.click();

    await page.evaluate(() => {
      const inputEl = document.querySelector(
        '[data-testid="explore-color-controls"] [data-slot="combobox-chip-input"]',
      ) as HTMLInputElement | null;
      if (!inputEl) throw new Error("genes combobox input missing");
      inputEl.focus();
      inputEl.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true, data: "" }));
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      if (setter) setter.call(inputEl, "Abtb3");
      else inputEl.value = "Abtb3";
      inputEl.dispatchEvent(
        new CompositionEvent("compositionend", { bubbles: true, data: "Abtb3" }),
      );
    });

    await expect.poll(async () => (await pickerListState(page)).optionCount).toBeGreaterThan(0);
    await expect(page.getByRole("option", { name: "Abtb3", exact: true })).toBeVisible();
  });
});
