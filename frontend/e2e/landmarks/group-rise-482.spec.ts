import { expect, type Locator, type Page } from "@playwright/test";

import { test } from "../fixtures";
import { bootLandmarksHarness, stabilizeUi } from "../helpers";

/**
 * `data-group-rise` is not on main yet. The open group is the Layers section
 * body (`.landmarks-panel-section__body`), or the category list
 * (`.landmarks-cat-sublist`) when Layers is already open.
 */
function groupBody(section: Locator): Locator {
  const marked = section.locator("[data-group-rise]");
  const fallback = section.locator(".landmarks-panel-section__body, .landmarks-cat-sublist");
  return marked.or(fallback).first();
}

async function openClosedGroup(page: Page): Promise<Locator> {
  const layers = page.getByTestId("panel-section-layers");
  const layersSection = page.locator(".landmarks-panel-section").filter({ has: layers });
  if (await layers.getByRole("button", { name: "Expand Layers" }).count()) {
    await layers.click();
    return groupBody(layersSection);
  }
  await page.getByRole("tab", { name: "cat" }).click();
  const region = page.getByRole("button", { name: "Expand region" });
  const cat = region.locator("xpath=ancestor::*[contains(@class,'group/cat')][1]");
  await region.click();
  return groupBody(cat);
}

test("stabilizeUi opens a panel group at rest", async ({ page }) => {
  await bootLandmarksHarness(page);
  await stabilizeUi(page);
  await expect(page.locator(".milume-widget.landmarks")).toHaveClass(/dark/);

  const skip = await page.evaluate(() => {
    const w = window as unknown as {
      __milumeSkipMotion?: boolean;
      __milumeSkipAnimations?: boolean;
    };
    return {
      requested: w.__milumeSkipMotion === true,
      live: w.__milumeSkipAnimations === true,
      marked: document.documentElement.dataset.milumeSkipAnimations === "true",
    };
  });
  expect(skip.requested).toBe(true);
  expect(skip.live).toBe(true);
  expect(skip.marked).toBe(true);

  const body = await openClosedGroup(page);
  const samples = await body.evaluate(async (el) => {
    const height = () => el.getBoundingClientRect().height;
    await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
    const first = height();
    await new Promise((resolve) => setTimeout(resolve, 80));
    const second = height();
    return { first, second };
  });
  expect(Math.abs(samples.first - samples.second)).toBeLessThanOrEqual(1);
  expect(samples.first).toBeGreaterThan(24);
});
