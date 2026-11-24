import { expect, type Page } from "@playwright/test";

import { test } from "../fixtures";
import { bootLandmarksHarness, stabilizeUi } from "../helpers";

async function openGrid(page: Page) {
  const header = page.getByTestId("panel-section-layers");
  if (!(await header.getByRole("button", { name: "Collapse Layers" }).count())) await header.click();
  await expect(page.getByTestId("layers-cells-row")).toBeVisible();
  await page.getByRole("tab", { name: "cat" }).click();
  await page.getByRole("button", { name: "Expand region" }).click();
  await expect(page.getByTestId("category-name").first()).toBeVisible();
}

async function measureRows(page: Page) {
  const rows = page.locator("[data-panel-row]:visible");
  const count = await rows.count();
  expect(count).toBeGreaterThan(4);
  for (let i = 0; i < count; i++) {
    const row = rows.nth(i);
    const box = await row.boundingBox();
    if (!box || box.width < 8 || box.height < 8) continue;
    const pad = Number.parseFloat(
      await row.evaluate((el) => getComputedStyle(el).paddingLeft),
    );
    const edgeEnd = Number.parseFloat(
      await row.evaluate((el) => getComputedStyle(el).paddingRight),
    );
    const text = row.locator("[data-panel-text]");
    const lead = row.locator("[data-panel-lead]");
    const end = row.locator("[data-panel-end]");
    const [textBox, leadBox, endBox] = await Promise.all([
      text.boundingBox(),
      lead.boundingBox(),
      end.boundingBox(),
    ]);
    expect(textBox && leadBox && endBox).toBeTruthy();
    const originX = box!.x + pad;
    const endX = box!.x + box!.width - edgeEnd;
    expect(Math.abs(textBox!.x - (originX + 36))).toBeLessThan(2);
    expect(Math.abs(leadBox!.width - 32)).toBeLessThan(1);
    expect(Math.abs(leadBox!.x - originX)).toBeLessThan(2);
    expect(Math.abs(endBox!.x + endBox!.width - endX)).toBeLessThan(2);
  }
}

async function measureBand(page: Page) {
  const band = page
    .getByTestId("panel-section-layers")
    .locator("xpath=ancestor::section[@data-panel-band='shade'][1]");
  const dock = page.locator(".landmarks__layers-panel");
  const [bandBox, dockBox] = await Promise.all([band.boundingBox(), dock.boundingBox()]);
  expect(bandBox && dockBox).toBeTruthy();
  // The framed section is the band. It spans the dock; the shade plate stays hidden
  // so it does not cover the section's corner brackets.
  expect(Math.abs(bandBox!.width - dockBox!.width)).toBeLessThan(4);
  expect(bandBox!.x).toBeGreaterThanOrEqual(dockBox!.x - 1);
  expect(bandBox!.x + bandBox!.width).toBeLessThanOrEqual(dockBox!.x + dockBox!.width + 1);
  await expect(page.locator(".landmarks__explore-panel [data-panel-rule]")).toHaveCount(0);
}

test.describe("panel grid", () => {
  test("dark docks share one text column, chevron box, and right edge", async ({ page }) => {
    await bootLandmarksHarness(page);
    await openGrid(page);
    await measureRows(page);
    await measureBand(page);
  });

  test("light docks share the same grid", { tag: "@isolated" }, async ({ page }) => {
    await bootLandmarksHarness(page);
    await page.getByRole("button", { name: "Switch to light" }).click();
    await expect(page.locator(".milume-widget.landmarks")).not.toHaveClass(/dark/);
    await stabilizeUi(page);
    await openGrid(page);
    await measureRows(page);
    await measureBand(page);
  });
});
