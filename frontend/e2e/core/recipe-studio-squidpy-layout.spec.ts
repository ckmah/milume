import { expect, test } from "@playwright/test";

const RECIPE_PATH = "/docs/how-to/recipes/squidpy_color/index.html";

test.describe("recipe studio squidpy layout", () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test("single site chrome and widget contained in content column", async ({ page }) => {
    await page.goto(RECIPE_PATH, { waitUntil: "networkidle", timeout: 120_000 });
    await page.locator("canvas").first().waitFor({ state: "visible", timeout: 120_000 });
    await page.locator(".milume-recipe-studio-wide").scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);

    await expect(page.locator("header.md-header")).toHaveCount(1);
    await expect(page.locator("nav.md-nav--primary")).toHaveCount(1);

    const layout = await page.evaluate(() => {
      const content = document.querySelector(".md-content__inner");
      const wide = document.querySelector(".milume-recipe-studio-wide");
      const widgetCell = wide?.querySelector("marimo-cell");
      const widgetBox =
        widgetCell?.getBoundingClientRect() ?? wide?.getBoundingClientRect();
      const contentBox = content?.getBoundingClientRect();
      if (!widgetBox || !contentBox) return null;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const insideContent =
        widgetBox.left >= contentBox.left - 1 &&
        widgetBox.right <= contentBox.right + 1 &&
        widgetBox.top >= contentBox.top - 1 &&
        widgetBox.bottom <= contentBox.bottom + 1;
      const insideViewport =
        widgetBox.left >= 0 &&
        widgetBox.top >= 0 &&
        widgetBox.right <= vw &&
        widgetBox.bottom <= vh;
      return {
        insideContent,
        insideViewport,
        widgetBox: {
          left: widgetBox.left,
          top: widgetBox.top,
          width: widgetBox.width,
          height: widgetBox.height,
        },
        contentBox: {
          left: contentBox.left,
          top: contentBox.top,
          width: contentBox.width,
          height: contentBox.height,
        },
      };
    });

    expect(layout).not.toBeNull();
    expect(layout!.insideContent).toBe(true);
    expect(layout!.insideViewport).toBe(true);
  });

  test("default export focuses galt-follicle selection on the map", async ({ page }) => {
    await page.goto(RECIPE_PATH, { waitUntil: "networkidle", timeout: 120_000 });
    await page.locator("canvas").first().waitFor({ state: "visible", timeout: 120_000 });
    await page.waitForFunction(
      () => {
        const overlay = window.__landmarksEngine?.getSelectionOverlay?.();
        return overlay?.some((row: { index: number; selected: boolean; pointCount: number }) =>
          row.index === 0 && row.selected && row.pointCount > 0,
        );
      },
      { timeout: 30_000 },
    );
  });
});

declare global {
  interface Window {
    __landmarksEngine?: {
      getSelectionOverlay?: () => {
        index: number;
        selected: boolean;
        pointCount: number;
      }[];
    };
  }
}
