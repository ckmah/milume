import { expect, type Page } from "@playwright/test";

import { test } from "../fixtures";

import { bootLandmarksHarness, getModel } from "../helpers";

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
    const emptyText = empty?.textContent?.trim() ?? "";
    const emptyVisible =
      empty instanceof HTMLElement &&
      emptyText.includes("No genes found") &&
      document.querySelectorAll('[data-slot="combobox-item"]').length === 0;
    const optionCount = document.querySelectorAll('[data-slot="combobox-item"]').length;
    const inputEl = document.querySelector(
      '[data-testid="explore-color-controls"] [data-slot="combobox-chip-input"]',
    ) as HTMLInputElement | null;
    return {
      input: inputEl?.value ?? "",
      optionCount,
      emptyVisible,
    };
  });
}

/** Reproduce CI flake path: IME composition shows text before filter state commits. */
async function stuckStateAfterCompositionCommit(page: Page) {
  return page.evaluate(() => {
    const inputEl = document.querySelector(
      '[data-testid="explore-color-controls"] [data-slot="combobox-chip-input"]',
    ) as HTMLInputElement | null;
    if (!inputEl) throw new Error("genes combobox input missing");

    const read = () => {
      const optionCount = document.querySelectorAll('[data-slot="combobox-item"]').length;
      const empty = document.querySelector('[data-slot="combobox-empty"]');
      const emptyVisible =
        empty instanceof HTMLElement &&
        (empty.textContent ?? "").includes("No genes found") &&
        optionCount === 0;
      return {
        input: inputEl.value,
        optionCount,
        emptyVisible,
      };
    };

    inputEl.focus();
    inputEl.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true, data: "" }));
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    if (setter) setter.call(inputEl, "Abtb3");
    else inputEl.value = "Abtb3";

    const midCompose = read();
    inputEl.dispatchEvent(
      new CompositionEvent("compositionend", { bubbles: true, data: "Abtb3" }),
    );
    const syncAfterCommit = read();

    return new Promise<{
      midCompose: ReturnType<typeof read>;
      syncAfterCommit: ReturnType<typeof read>;
      afterMicrotask: ReturnType<typeof read>;
      afterFrame: ReturnType<typeof read>;
    }>((resolve) => {
      queueMicrotask(() => {
        const afterMicrotask = read();
        requestAnimationFrame(() => {
          resolve({ midCompose, syncAfterCommit, afterMicrotask, afterFrame: read() });
        });
      });
    });
  });
}

async function openPickerInput(page: Page) {
  const genePicker = page.getByTestId("explore-color-controls").getByPlaceholder("Select genes");
  await genePicker.click();
  return genePicker;
}

test.describe("Landmarks genes combobox filter sync (#387)", () => {
  test.beforeEach(async ({ page }) => {
    await bootLandmarksHarness(page);
    await openGenesTab(page);
    await expect.poll(async () => ((await getModel(page, "_color_options")) as { genes: unknown[] }).genes).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "Abtb3" })]),
    );
  });

  test("empty open popup stays search-first with zero options", async ({ page }) => {
    await openPickerInput(page);
    const state = await pickerListState(page);
    expect(state.input).toBe("");
    expect(state.optionCount).toBe(0);
    expect(state.emptyVisible).toBe(true);
  });

  test("composition commit cannot leave Abtb3 stuck on No genes found", async ({ page }) => {
    await openPickerInput(page);
    const phases = await stuckStateAfterCompositionCommit(page);

    expect(phases.midCompose.input).toBe("Abtb3");
    expect(phases.midCompose.optionCount).toBe(0);

    expect(phases.afterMicrotask.input).toBe("Abtb3");
    expect(phases.afterMicrotask.optionCount).toBeGreaterThan(0);
    expect(phases.afterMicrotask.emptyVisible).toBe(false);

    expect(phases.afterFrame.input).toBe("Abtb3");
    expect(phases.afterFrame.optionCount).toBeGreaterThan(0);
    expect(phases.afterFrame.emptyVisible).toBe(false);
  });

  test("per-keystroke typing never sticks on empty while query matches", async ({ page }) => {
    await openPickerInput(page);

    for (const ch of "Abtb3") {
      await page.keyboard.press(ch);
      const state = await pickerListState(page);
      expect(state.input.endsWith(ch)).toBe(true);
      if (state.input.trim().length >= 3) {
        expect(state.optionCount).toBeGreaterThan(0);
        expect(state.emptyVisible).toBe(false);
      }
    }
    await expect(page.getByRole("option", { name: "Abtb3", exact: true })).toBeVisible();
  });
});
