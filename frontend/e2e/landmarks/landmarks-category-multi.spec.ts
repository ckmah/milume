import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { expect, type Page } from "@playwright/test";

import { test } from "../fixtures";

import { bootLandmarksHarness, getModel, setModel, waitForEngine } from "../helpers";

/** What `w.color = "harness_twin"` derives on the harness points (dev/export-harness-twin-color.py). */
const twinColor = JSON.parse(
  readFileSync(fileURLToPath(new URL("../../dev/harness-twin-color.json", import.meta.url)), "utf8"),
);

async function installHarnessTwinGroups(page: Page) {
  await setModel(page, {
    ...twinColor,
    type_neighborhoods: ["group_a", "group_b"].map((id) => ({
      id,
      column: "harness_twin",
      neighborhood: "knn",
      neighborhood_k: 8,
      neighborhood_radius: 0,
    })),
    selected_kind: "",
    selected_index: -1,
    selected_type_indices: [],
  });
}

async function openCategorySubrows(page: Page) {
  const right = page.locator(".landmarks__chrome-dock--right");
  if ((await right.getAttribute("data-collapsed")) === "true") {
    await page.getByRole("button", { name: "Show right panel" }).click();
  }
  await page.getByTestId("explore-color-by").getByRole("tab", { name: "category" }).click();
  await page.getByRole("button", { name: /Expand harness_twin/i }).click();
}

test.describe("Landmarks category multi-select", () => {
  test.beforeEach(async ({ page }) => {
    await bootLandmarksHarness(page);
    await waitForEngine(page);
    await installHarnessTwinGroups(page);
  });

  test("single select, modifier multi-select, and deselect", async ({ page }) => {
    await openCategorySubrows(page);

    const right = page.locator(".landmarks__chrome-dock--right");
    const rowA = right.getByRole("listitem").filter({ hasText: "group_a" });
    const rowB = right.getByRole("listitem").filter({ hasText: "group_b" });

    const seedCount = () =>
      page.evaluate(
        () => (window as any).__landmarksEngine.getNeighborhoodOverlay().seedRoleCount as number,
      );

    await rowA.click();
    await expect.poll(() => getModel(page, "selected_kind")).toBe("type");
    await expect.poll(() => getModel(page, "selected_index")).toBe(0);
    await expect.poll(() => getModel(page, "selected_type_indices")).toEqual([0]);
    await expect.poll(seedCount).toBeGreaterThan(0);
    const seedsA = await seedCount();

    await rowA.click();
    await expect.poll(() => getModel(page, "selected_type_indices")).toEqual([0]);

    await rowB.click({ modifiers: ["Control"] });
    await expect.poll(() => getModel(page, "selected_type_indices")).toEqual([0, 1]);
    await expect.poll(seedCount).toBeGreaterThan(seedsA);

    await rowA.click({ modifiers: ["Control"] });
    await expect.poll(() => getModel(page, "selected_type_indices")).toEqual([1]);

    await rowB.click({ modifiers: ["Control"] });
    await expect.poll(() => getModel(page, "selected_kind")).toBe("");
    await expect.poll(() => getModel(page, "selected_type_indices")).toEqual([]);
    await expect.poll(seedCount).toBe(0);
  });
});
