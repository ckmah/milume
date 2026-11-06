import { expect } from "@playwright/test";

import { test } from "../fixtures";
import { stabilizeUi, waitForEngine } from "../helpers";

const volumeHarness = process.env.E2E_HARNESS === "landmarks-volume";
const issue3953d = (process.env.E2E_VOLUME_PROFILE ?? "toy") === "issue395-3d";

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

  test(
    "issue395-3d harness: docks end above minimap and depth rail in fullscreen (per side)",
    { tag: "@isolated" },
    async ({ page }) => {
      test.skip(!volumeHarness || !issue3953d, "requires E2E_HARNESS=landmarks-volume and E2E_VOLUME_PROFILE=issue395-3d");

      await page.goto("/?noDialkit=1", { waitUntil: "networkidle" });
      await waitForEngine(page);
      await stabilizeUi(page);

      const root = page.locator(".milume-widget.landmarks");
      await expect(root).not.toHaveClass(/landmarks--narrow/);
      await expect(root).not.toHaveClass(/landmarks--no-z/);

      await page.getByRole("button", { name: "Full screen" }).click();
      await expect(root).toHaveClass(/landmarks--fs/);

      // Stress each dock's max-height budget. Main's fullscreen rule omits minimap / depth-rail
      // terms; without tall content both branches can look fine at rest (#420).
      await page.evaluate(() => {
        const leftPanel = document.querySelector(".landmarks__chrome-dock--left .landmarks__layers-panel");
        const rightStack = document.querySelector(
          '.landmarks__chrome-dock--right [data-testid="info-explore-stack"]',
        );
        if (leftPanel) leftPanel.style.minHeight = "2000px";
        if (rightStack) rightStack.style.minHeight = "2000px";
      });
      await page.waitForTimeout(150);

      const {
        leftOk,
        rightOk,
        leftBottom,
        rightBottom,
        minimapTop,
        railTop,
        depthRailVar,
        leftW,
        rightW,
        minimapW,
        railW,
      } = await page.evaluate(() => {
        const left = document.querySelector(".landmarks__chrome-dock--left");
        const right = document.querySelector(".landmarks__chrome-dock--right");
        const minimap = document.querySelector(".landmarks__chrome-minimap");
        const rail = document.querySelector(".landmarks__chrome-depth-rail");
        const widget = document.querySelector(".milume-widget.landmarks");
        if (!left || !right || !widget) {
          throw new Error("expected left dock, right dock, and widget root");
        }
        const lb = left.getBoundingClientRect();
        const rb = right.getBoundingClientRect();
        const mm =
          minimap && getComputedStyle(minimap).display !== "none" ? minimap.getBoundingClientRect() : null;
        const dr = rail && getComputedStyle(rail).display !== "none" ? rail.getBoundingClientRect() : null;
        if (!mm) throw new Error("expected minimap in harness");
        if (!dr) throw new Error("expected depth rail in 3D harness");
        const depthRailVar = getComputedStyle(widget).getPropertyValue("--lm-depth-rail-active").trim();
        const eps = 0.75;
        return {
          leftOk: lb.bottom <= mm.top + eps,
          rightOk: rb.bottom <= dr.top + eps,
          leftBottom: lb.bottom,
          rightBottom: rb.bottom,
          minimapTop: mm.top,
          railTop: dr.top,
          depthRailVar,
          leftW: lb.width,
          rightW: rb.width,
          minimapW: mm.width,
          railW: dr.width,
        };
      });

      expect(depthRailVar, "depth rail CSS var should be non-zero when rail is mounted").not.toMatch(
        /^(0|0px)\s*$/,
      );
      expect(leftW, "left dock should not be collapsed width").toBeGreaterThan(8);
      expect(rightW, "right dock should not be collapsed width").toBeGreaterThan(8);
      expect(minimapW, "minimap should be visible").toBeGreaterThan(8);
      expect(railW, "depth rail should be visible").toBeGreaterThan(8);

      expect(
        leftOk,
        `left dock bottom ${leftBottom} should be at or above minimap top ${minimapTop}`,
      ).toBe(true);
      expect(
        rightOk,
        `right dock bottom ${rightBottom} should be at or above depth rail top ${railTop}`,
      ).toBe(true);

      await page.getByRole("button", { name: "Exit full screen" }).click();
      await expect(root).not.toHaveClass(/landmarks--fs/);
    },
  );
});
