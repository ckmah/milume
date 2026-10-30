import { expect, type Page } from "@playwright/test";

import { test } from "../fixtures";

import { bootLandmarksHarness, stabilizeUi, waitForEngine } from "../helpers";

async function loadNicheDonutFixture(page: Page) {
  await page.evaluate(async () => {
    const res = await fetch("/squidpy-niche-fixture.json");
    if (!res.ok) throw new Error(`fixture ${res.status}`);
    const patch = (await res.json()) as Record<string, unknown>;
    const model = (window as any).__landmarksModel;
    for (const [k, v] of Object.entries(patch)) model.set(k, v);
    model.save_changes();
  });
  await waitForEngine(page, 150);
  await stabilizeUi(page);
}

async function openCategoryStackedBar(page: Page) {
  const right = page.locator(".landmarks__chrome-dock--right");
  if ((await right.getAttribute("data-collapsed")) === "true") {
    await page.getByRole("button", { name: "Show right panel" }).click();
  }
  await page.getByTestId("explore-color-by").getByRole("tab", { name: "cat" }).click();
  await expect(page.getByTestId("explore-coloring-by")).toContainText(
    "nhood_niche_res=0.5",
  );
  const bar = page.getByTestId("info-stacked-bar");
  await expect(bar).toBeVisible();
  return bar;
}

test.describe("Info stacked bar", () => {
  test.beforeEach(async ({ page }) => {
    await bootLandmarksHarness(page);
    await loadNicheDonutFixture(page);
  });

  test("category coloring shows stacked segments with non-zero width", async ({
    page,
  }) => {
    const bar = await openCategoryStackedBar(page);
    const segments = bar.locator("> div");
    expect(await segments.count()).toBeGreaterThan(0);
    const widths = await segments.evaluateAll((nodes) =>
      nodes.map((n) => n.getBoundingClientRect().width),
    );
    expect(widths.some((w) => w > 2)).toBe(true);
  });

  test("stacked bar stays inside the chart well", async ({ page }) => {
    const bar = await openCategoryStackedBar(page);
    const well = page.getByTestId("info-chart-well");
    const barBox = (await bar.boundingBox())!;
    const wellBox = (await well.boundingBox())!;
    expect(barBox.x).toBeGreaterThanOrEqual(wellBox.x - 1);
    expect(barBox.y).toBeGreaterThanOrEqual(wellBox.y - 1);
    expect(barBox.x + barBox.width).toBeLessThanOrEqual(wellBox.x + wellBox.width + 1);
    expect(barBox.y + barBox.height).toBeLessThanOrEqual(wellBox.y + wellBox.height + 1);
  });
});
