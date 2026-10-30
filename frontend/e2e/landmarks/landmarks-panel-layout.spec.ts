import { expect } from "@playwright/test";

import { test } from "../fixtures";
import { waitForEngine } from "../helpers";

const ILEUM_FIXTURE = "/e2e-galt-lasso-fixture.json";
const VOLUME_FIXTURE = "/landmarks-volume-fixture.json";

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

  test("ileum 2D hides depth rail and uses no-z layout", async ({ page }) => {
    await page.goto(`/?fixture=${encodeURIComponent(ILEUM_FIXTURE)}`, {
      waitUntil: "networkidle",
    });
    await waitForEngine(page);
    const root = page.locator(".milume-widget.landmarks");
    await expect(root).toHaveClass(/landmarks--no-z/);
    await expect(page.getByTestId("depth-rail")).toHaveCount(0);
  });
});

test.describe("panel layout depth rail (3D)", () => {
  test("volume fixture shows depth rail", async ({ page }) => {
    test.setTimeout(180_000);
    await page.goto(`/?fixture=${encodeURIComponent(VOLUME_FIXTURE)}`, {
      waitUntil: "networkidle",
    });
    await waitForEngine(page);
    await expect(page.locator(".milume-widget.landmarks")).not.toHaveClass(/landmarks--no-z/);
    await expect(page.getByTestId("depth-rail")).toBeVisible();
  });
});
