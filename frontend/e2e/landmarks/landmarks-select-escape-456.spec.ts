import { expect } from "@playwright/test";

import { test } from "../fixtures";
import { bootLandmarksHarness, getModel, setModel } from "../helpers";

test.describe("Select mode Escape", () => {
  test.beforeEach(async ({ page }) => {
    await bootLandmarksHarness(page);
    await page.getByRole("radio", { name: "Select", exact: true }).click();
    await setModel(page, { selected_kind: "molecule", selected_index: 0 });
  });

  test("closes an open menu and leaves the canvas selection", async ({ page }) => {
    await page.getByRole("button", { name: /Right-click for shape menu/ }).click({ button: "right" });
    await expect(page.getByRole("menu")).toBeVisible();

    await page.keyboard.press("Escape");

    await expect(page.getByRole("menu")).toHaveCount(0);
    expect(await getModel(page, "selected_kind")).toBe("molecule");
    expect(await getModel(page, "selected_index")).toBe(0);
    expect(await getModel(page, "mode")).toBe("select");
  });

  test("clears the canvas selection when no menu is open", async ({ page }) => {
    await expect(page.getByRole("menu")).toHaveCount(0);
    await page.locator("canvas.landmarks__webgl").first().focus();

    await page.keyboard.press("Escape");

    await expect.poll(() => getModel(page, "selected_kind")).toBe("");
    expect(await getModel(page, "selected_index")).toBe(-1);
    expect(await getModel(page, "mode")).toBe("select");
  });
});
