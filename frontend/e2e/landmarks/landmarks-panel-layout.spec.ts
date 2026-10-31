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

  test("minimise toggle uses square minus and plus icons", async ({ page }) => {
    await page.goto("/?fixture=/fixture.json", { waitUntil: "networkidle" });
    await waitForEngine(page);
    const toggle = page.getByTestId("toggle-minimise-panels");
    await expect(toggle.locator("svg.lucide-square-minus")).toHaveCount(1);
    await toggle.click();
    await expect(toggle.locator("svg.lucide-square-plus")).toHaveCount(1);
    await toggle.click();
    await expect(toggle.locator("svg.lucide-square-minus")).toHaveCount(1);
  });

  test("minimise toggle keeps the same background as neighbouring view cluster buttons", async ({
    page,
  }) => {
    await page.goto("/?fixture=/fixture.json", { waitUntil: "networkidle" });
    await waitForEngine(page);
    const cluster = page.getByTestId("view-cta");
    const neighbour = page.getByTestId("toggle-rulers");
    const toggle = page.getByTestId("toggle-minimise-panels");

    const readBg = async (loc: typeof toggle) =>
      loc.evaluate((el) => getComputedStyle(el).backgroundColor);

    const neighbourBg = await readBg(neighbour);
    expect(await readBg(toggle)).toBe(neighbourBg);

    await toggle.click();
    expect(await readBg(toggle)).toBe(neighbourBg);
    expect(await readBg(neighbour)).toBe(neighbourBg);

    await toggle.click();
    expect(await readBg(toggle)).toBe(neighbourBg);
  });

  test("minimised left header keeps full section label and pin name", async ({ page }) => {
    await page.goto("/?fixture=/fixture.json", { waitUntil: "networkidle" });
    await waitForEngine(page);
    await setModel(page, { selected_kind: "landmark", selected_index: 0 });
    await page.getByTestId("toggle-minimise-panels").click();

    const header = page.getByTestId("panel-section-landmarks");
    const sectionLabel = header.locator(".landmarks-panel-section-header__label");
    await expect(sectionLabel).toHaveText("Landmarks");
    const labelFits = await sectionLabel.evaluate(
      (el) => el.scrollWidth <= el.clientWidth + 1,
    );
    expect(labelFits).toBe(true);

    const pinLabel = header.locator(".landmarks-panel-section-header__pin-label");
    await expect(pinLabel).toHaveText("harness-point");
    await expect(pinLabel).toBeVisible();
    const pinText = await pinLabel.evaluate((el) => el.textContent?.trim());
    expect(pinText).toBe("harness-point");
  });

  test("pinned header chip is borderless and shows full landmark name", async ({ page }) => {
    await page.goto("/?fixture=/fixture.json", { waitUntil: "networkidle" });
    await waitForEngine(page);
    await setModel(page, { selected_kind: "landmark", selected_index: 0 });
    await page.getByTestId("panel-section-selections").click();
    const pin = page
      .getByTestId("panel-section-landmarks")
      .locator(".landmarks-panel-section-header__pin");
    await expect(pin).toBeVisible();
    const borderWidth = await pin.evaluate((el) =>
      parseFloat(getComputedStyle(el).borderTopWidth),
    );
    expect(borderWidth).toBe(0);
    const label = pin.locator(".landmarks-panel-section-header__pin-label");
    await expect(label).toHaveText("harness-point");
  });

  test("minimised right card is one borderless pill with a single chevron", async ({
    page,
  }) => {
    await page.goto("/?fixture=/fixture.json", { waitUntil: "networkidle" });
    await waitForEngine(page);
    await page.getByTestId("toggle-minimise-panels").click();
    const right = page.locator(".landmarks__chrome-dock--right");
    await expect(right).toHaveClass(/landmarks__chrome-dock--right-chip/);
    await expect(page.getByTestId("panel-collapse-caret-right")).toBeHidden();
    const chipBtn = page.getByTestId("minimise-color-chip-expand");
    const borderWidth = await chipBtn.evaluate((el) =>
      parseFloat(getComputedStyle(el).borderTopWidth),
    );
    expect(borderWidth).toBe(0);
    const chevrons = right.locator("svg.lucide-chevron-down");
    await expect(chevrons).toHaveCount(1);
  });

  test("cat tab selection copy and dual composition bars", async ({ page }) => {
    await page.goto("/?fixture=/fixture.json", { waitUntil: "networkidle" });
    await waitForEngine(page);
    await setModel(page, { selected_kind: "selection", selected_index: 0 });
    await page.getByRole("tab", { name: "cat" }).click();
    const context = page.getByTestId("info-context-row");
    await expect(context).toContainText(/^Selection:/);
    await expect(context).toContainText(/ of .* cells$/);
    const selectionBar = page.getByTestId("info-selection-bar");
    const allCellsBar = page.getByTestId("info-allcells-bar");
    await expect(selectionBar).toBeVisible();
    await expect(allCellsBar).toBeVisible();
    await expect(page.getByTestId("info-allcells-bar-row")).toContainText("All cells");
    const selectionHeight = await selectionBar.evaluate((el) => el.getBoundingClientRect().height);
    const allHeight = await allCellsBar.evaluate((el) => el.getBoundingClientRect().height);
    expect(selectionHeight).toBeGreaterThanOrEqual(23);
    expect(selectionHeight).toBeLessThanOrEqual(25);
    expect(allHeight).toBeGreaterThanOrEqual(7);
    expect(allHeight).toBeLessThanOrEqual(9);
  });

  test("cat tab without selection shows All N cells", async ({ page }) => {
    await page.goto("/?fixture=/fixture.json", { waitUntil: "networkidle" });
    await waitForEngine(page);
    await setModel(page, { selected_kind: "", selected_index: -1 });
    await page.getByRole("tab", { name: "cat" }).click();
    await expect(page.getByTestId("info-context-row")).toContainText(/^All .* cells$/);
    await expect(page.getByTestId("info-stacked-bar")).toBeVisible();
    await expect(page.getByTestId("info-selection-bar")).toHaveCount(0);
  });
});
