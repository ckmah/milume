import { expect } from "@playwright/test";

import { test } from "../fixtures";
import { waitForEngine } from "../helpers";

/** Issue #420: fullscreen dock height must stay above minimap and depth rail. */
test.describe("fullscreen dock chrome (#420)", () => {
  test(
    "docks end above minimap and depth rail in fullscreen",
    { tag: "@isolated" },
    async ({ page }) => {
      await page.goto("/?fixture=/fixture.json", { waitUntil: "networkidle" });
      await waitForEngine(page);

      const root = page.locator(".milume-widget.landmarks");
      await expect(root).not.toHaveClass(/landmarks--narrow/);

      await page.getByRole("button", { name: "Full screen" }).click();
      await expect(root).toHaveClass(/landmarks--fs/);

      const { leftOk, rightOk, leftBottom, rightBottom, chromeTop } = await page.evaluate(() => {
        const left = document.querySelector(".landmarks__chrome-dock--left");
        const right = document.querySelector(".landmarks__chrome-dock--right");
        const minimap = document.querySelector(".landmarks__chrome-minimap");
        const rail = document.querySelector(".landmarks__chrome-depth-rail");
        if (!left || !right) {
          throw new Error("expected left and right docks");
        }
        const lb = left.getBoundingClientRect();
        const rb = right.getBoundingClientRect();
        let minTop = Infinity;
        if (minimap && getComputedStyle(minimap).display !== "none") {
          minTop = Math.min(minTop, minimap.getBoundingClientRect().top);
        }
        if (rail && getComputedStyle(rail).display !== "none") {
          minTop = Math.min(minTop, rail.getBoundingClientRect().top);
        }
        if (!Number.isFinite(minTop)) {
          throw new Error("expected minimap and/or depth rail in harness");
        }
        const eps = 0.75;
        return {
          leftOk: lb.bottom <= minTop + eps,
          rightOk: rb.bottom <= minTop + eps,
          leftBottom: lb.bottom,
          rightBottom: rb.bottom,
          chromeTop: minTop,
        };
      });

      expect(leftOk, `left dock bottom ${leftBottom} above chrome top ${chromeTop}`).toBe(true);
      expect(rightOk, `right dock bottom ${rightBottom} above chrome top ${chromeTop}`).toBe(true);

      await page.getByRole("button", { name: "Exit full screen" }).click();
      await expect(root).not.toHaveClass(/landmarks--fs/);
    },
  );
});
