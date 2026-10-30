import { expect } from "@playwright/test";

import { test } from "../fixtures";
import { waitForEngine } from "../helpers";

const ILEUM_FIXTURE = "/e2e-galt-lasso-fixture.json";

async function openRightPanel(page: import("@playwright/test").Page) {
  const right = page.locator(".landmarks__chrome-dock--right");
  if ((await right.getAttribute("data-collapsed")) === "true") {
    await page.getByRole("button", { name: "Show right panel" }).click();
  }
  return right;
}

test.describe("panel layout (option 1)", () => {
  test("landmark tool defaults to Spline", async ({ page }) => {
    await page.goto("/?fixture=/fixture.json", { waitUntil: "networkidle" });
    await waitForEngine(page);
    const bar = page.locator(".landmarks__chrome-tools");
    const landmark = bar.getByRole("button", {
      name: /Spline\. Right-click for landmark menu/,
    });
    await expect(landmark.locator("svg.lucide-spline")).toHaveCount(1);
  });

  test("right card exposes cat, num, genes, embed tabs", async ({ page }) => {
    await page.goto("/?fixture=/fixture.json", { waitUntil: "networkidle" });
    await waitForEngine(page);
    const right = await openRightPanel(page);
    const tabs = right.getByTestId("explore-color-by");
    await expect(tabs.getByRole("tab", { name: "cat" })).toBeVisible();
    await expect(tabs.getByRole("tab", { name: "num" })).toBeVisible();
    await expect(tabs.getByRole("tab", { name: "genes" })).toBeVisible();
    await expect(tabs.getByRole("tab", { name: "embed" })).toBeVisible();
  });

  test("minimise toggle folds panel bodies", async ({ page }) => {
    await page.goto("/?fixture=/fixture.json", { waitUntil: "networkidle" });
    await waitForEngine(page);
    const root = page.locator(".milume-widget.landmarks");
    await expect(root).not.toHaveClass(/landmarks--minimise/);
    await page.getByTestId("toggle-minimise-panels").click();
    await expect(root).toHaveClass(/landmarks--minimise/);
  });

  test("ileum 2D layout keeps depth rail placeholder slot", async ({ page }) => {
    await page.goto(`/?fixture=${encodeURIComponent(ILEUM_FIXTURE)}`, {
      waitUntil: "networkidle",
    });
    await waitForEngine(page);
    await expect(page.getByTestId("depth-rail-placeholder")).toBeVisible();
  });

  test("default layout reserves depth rail chrome slot", async ({ page }) => {
    await page.goto("/?fixture=/fixture.json", { waitUntil: "networkidle" });
    await waitForEngine(page);
    await expect(page.getByTestId("depth-rail-placeholder")).toBeVisible();
  });
});
