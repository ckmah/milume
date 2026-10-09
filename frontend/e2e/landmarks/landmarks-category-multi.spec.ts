import { expect, type Page } from "@playwright/test";

import { test } from "../fixtures";

import { bootLandmarksHarness, getModel, waitForEngine } from "../helpers";

/** Harness-only second column on the committed xsmall fixture (even/odd split). */
async function installHarnessTwinGroups(page: Page) {
  await page.evaluate(() => {
    const model = (window as any).__landmarksModel;
    const b64Pts = model.get("points_data") || "";
    const rawPts = Uint8Array.from(atob(b64Pts), (c) => c.charCodeAt(0));
    const n = Math.floor(rawPts.length / 16);
    const codes = new Int32Array(n);
    for (let i = 0; i < n; i++) codes[i] = i % 2;
    const bytes = new Uint8Array(codes.buffer);
    let bin = "";
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    const codeB64 = btoa(bin);
    model.set("category_columns", [
      {
        name: "harness_twin",
        labels: ["group_a", "group_b"],
        palette: ["#1f77b4", "#ff7f0e"],
      },
    ]);
    model.set("active_category", "harness_twin");
    model.set("legend_labels", ["group_a", "group_b"]);
    model.set("legend_title", "harness_twin");
    model.set("point_palette", ["#1f77b4", "#ff7f0e"]);
    model.set("category_codes", codeB64);
    model.set("color_by", "categorical");
    model.set("type_neighborhoods", [
      {
        id: "group_a",
        column: "harness_twin",
        neighborhood: "knn",
        neighborhood_k: 8,
        neighborhood_radius: 0,
      },
      {
        id: "group_b",
        column: "harness_twin",
        neighborhood: "knn",
        neighborhood_k: 8,
        neighborhood_radius: 0,
      },
    ]);
    model.set("selected_kind", "");
    model.set("selected_index", -1);
    model.set("selected_type_indices", []);
    model.save_changes();
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
