import { expect } from "@playwright/test";

import { test } from "../fixtures";

import { bootLandmarksHarness } from "../helpers";

/**
 * The Vite harness default frame is a marimo edit-mode output cell.
 * The widget must render fully inside that box, with no clipped chrome.
 */
test.describe("marimo output frame", () => {
  test.beforeEach(async ({ page }) => {
    await bootLandmarksHarness(page);
  });

  test("the widget fits inside the mock output area", async ({ page }) => {
    const output = page.locator(".harness-cell-output");
    const widget = page.locator(".landmarks").first();
    await expect(widget).toBeVisible();
    await expect(page.locator(".landmarks__body").first()).toHaveCSS("height", "550px");

    const frame = await output.evaluate((el) => {
      const style = getComputedStyle(el);
      return {
        boxSizing: style.boxSizing,
        maxHeight: style.maxHeight,
        paddingTop: style.paddingTop,
        paddingRight: style.paddingRight,
        paddingBottom: style.paddingBottom,
        paddingLeft: style.paddingLeft,
        overflowX: style.overflowX,
        overflowY: style.overflowY,
        width: Math.round(el.getBoundingClientRect().width),
        scrollHeight: el.scrollHeight,
        clientHeight: el.clientHeight,
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth,
      };
    });

    expect(frame.boxSizing).toBe("border-box");
    expect(frame.maxHeight).toBe("none");
    expect(frame.paddingTop).toBe("16px");
    expect(frame.paddingRight).toBe("16px");
    expect(frame.paddingBottom).toBe("16px");
    expect(frame.paddingLeft).toBe("16px");
    expect(frame.overflowX).toBe("visible");
    expect(frame.overflowY).toBe("visible");
    // Default 1280 viewport: marimo medium column (--content-width-medium).
    expect(frame.width).toBe(1110);
    expect(frame.scrollHeight).toBeLessThanOrEqual(frame.clientHeight);
    expect(frame.scrollWidth).toBeLessThanOrEqual(frame.clientWidth);

    const chrome = [
      page.getByRole("toolbar", { name: "Drawing tools" }),
      page.locator(".landmarks__chrome-dock--left"),
      page.locator(".landmarks__chrome-dock--right"),
      page.getByRole("button", { name: "Resize height" }),
    ];
    const outputBox = (await output.boundingBox())!;
    for (const locator of chrome) {
      await expect(locator).toBeVisible();
      const box = (await locator.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(outputBox.x - 1);
      expect(box.y).toBeGreaterThanOrEqual(outputBox.y - 1);
      expect(box.x + box.width).toBeLessThanOrEqual(outputBox.x + outputBox.width + 1);
      expect(box.y + box.height).toBeLessThanOrEqual(outputBox.y + outputBox.height + 1);
    }
  });
});
