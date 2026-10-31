import { expect } from "@playwright/test";

import { test } from "../fixtures";
import { canvasBox, setModel, waitForEngine } from "../helpers";

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

  test("ileum 2D hides depth rail and uses no-z layout", async ({ page }) => {
    await page.goto(`/?fixture=${encodeURIComponent(ILEUM_FIXTURE)}`, {
      waitUntil: "networkidle",
    });
    await waitForEngine(page);
    const root = page.locator(".milume-widget.landmarks");
    await expect(root).toHaveClass(/landmarks--no-z/);
    await expect(page.getByTestId("depth-rail")).toHaveCount(0);
  });

  test("default 2D fixture hides depth rail slot", async ({ page }) => {
    await page.goto("/?fixture=/fixture.json", { waitUntil: "networkidle" });
    await waitForEngine(page);
    await expect(page.locator(".milume-widget.landmarks")).toHaveClass(/landmarks--no-z/);
    await expect(page.getByTestId("depth-rail")).toHaveCount(0);
  });

  test("dock carets use text glyphs outside card corners", async ({ page }) => {
    await page.goto("/?fixture=/fixture.json", { waitUntil: "networkidle" });
    await waitForEngine(page);
    await expect(page.getByTestId("panel-collapse-caret-left")).toHaveText("‹");
    await expect(page.getByTestId("panel-collapse-caret-right")).toHaveText("›");
  });

  test("collapsed dock shows flipped edge peek tab", async ({ page }) => {
    await page.goto("/?fixture=/fixture.json", { waitUntil: "networkidle" });
    await waitForEngine(page);
    await page.getByTestId("panel-collapse-caret-left").click();
    await expect(page.getByTestId("panel-peek-tab-left")).toHaveText("›");
    await page.getByTestId("panel-peek-tab-left").click();
    await expect(page.locator(".landmarks__chrome-dock--left")).toHaveAttribute(
      "data-collapsed",
      "false",
    );
  });

  test("Shift+\\ toggles minimise, keeps left caret, and shows color chip", async ({ page }) => {
    await page.goto("/?fixture=/fixture.json", { waitUntil: "networkidle" });
    await waitForEngine(page);
    const box = await canvasBox(page);
    await page.mouse.click(box.x + 5, box.y + box.height - 5);
    await page.keyboard.press("Shift+\\");
    await expect(page.locator(".milume-widget.landmarks")).toHaveClass(/landmarks--minimise/);
    await expect(page.getByTestId("panel-collapse-caret-left")).toBeVisible();
    await expect(page.getByTestId("minimise-color-chip")).toBeVisible();
    await expect(page.getByTestId("info-explore-stack").locator("[data-testid='explore-color-by']")).toBeHidden();
    await page.getByTestId("minimise-color-chip-expand").click();
    await expect(page.getByTestId("info-explore-stack").locator("[data-testid='explore-color-by']")).toBeVisible();
  });

  test("pinned landmark shows visible name in collapsed header", async ({ page }) => {
    await page.goto("/?fixture=/fixture.json", { waitUntil: "networkidle" });
    await waitForEngine(page);
    await setModel(page, { selected_kind: "landmark", selected_index: 0 });
    await page.getByTestId("panel-section-selections").click();
    const pinLabel = page
      .getByTestId("panel-section-landmarks")
      .locator(".landmarks-panel-section-header__pin-label");
    await expect(pinLabel).toHaveText("harness-point");
    await expect(pinLabel).toBeVisible();
    const textWidth = await pinLabel.evaluate((el) => el.getBoundingClientRect().width);
    expect(textWidth).toBeGreaterThan(8);
  });

  test("minimise keeps landmark pin name in section header", async ({ page }) => {
    await page.goto("/?fixture=/fixture.json", { waitUntil: "networkidle" });
    await waitForEngine(page);
    await setModel(page, { selected_kind: "landmark", selected_index: 0 });
    await page.getByTestId("toggle-minimise-panels").click();
    const pinLabel = page
      .getByTestId("panel-section-landmarks")
      .locator(".landmarks-panel-section-header__pin-label");
    await expect(pinLabel).toHaveText("harness-point");
    await expect(pinLabel).toBeVisible();
  });
});
