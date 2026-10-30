import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { expect, type Page } from "@playwright/test";

import { test } from "../fixtures";

import { bootLandmarksHarness, getModel, setModel, waitForEngine } from "../helpers";

function formatLegendValue(value: number) {
  const a = Math.abs(value);
  if (a !== 0 && (a >= 1000 || a < 0.01)) return value.toExponential(1);
  if (a >= 100) return value.toFixed(0);
  if (a >= 10) return value.toFixed(1);
  return value.toFixed(2);
}

const obsColor = JSON.parse(
  readFileSync(fileURLToPath(new URL("../../dev/harness-twin-obs-color.json", import.meta.url)), "utf8"),
);

const twinColor = JSON.parse(
  readFileSync(fileURLToPath(new URL("../../dev/harness-twin-color.json", import.meta.url)), "utf8"),
);

async function openExploreRight(page: Page) {
  const right = page.locator(".landmarks__chrome-dock--right");
  if ((await right.getAttribute("data-collapsed")) === "true") {
    await page.getByRole("button", { name: "Show right panel" }).click();
  }
  await expect(right).toHaveAttribute("data-collapsed", "false");
  return right;
}

test.describe("Landmarks numeric obs heat strip", () => {
  test.beforeEach(async ({ page }) => {
    await bootLandmarksHarness(page);
    await waitForEngine(page);
  });

  test("num tab shows heat strip scale; cat and genes hide it", async ({ page }) => {
    await setModel(page, obsColor);
    await expect.poll(() => getModel(page, "color_mode")).toBe("obs");

    const right = await openExploreRight(page);
    await right.getByTestId("explore-color-by").getByRole("tab", { name: "num" }).click();

    const strip = right.getByTestId("num-heat-strip");
    await expect(strip).toBeVisible();
    await expect(strip.getByTestId("num-heat-max")).toHaveText(
      formatLegendValue(obsColor.color_vmax),
    );

    await right.getByRole("tab", { name: "cat" }).click();
    await expect(right.getByTestId("num-heat-strip")).toHaveCount(0);
    await expect(right.getByTestId("info-stacked-bar")).toBeVisible();

    await setModel(page, twinColor);
    await right.getByRole("tab", { name: "genes" }).click();
    await expect(right.getByTestId("num-heat-strip")).toHaveCount(0);
  });

  test("color_vmin and color_vmax updates re-render strip scale", async ({ page }) => {
    await setModel(page, obsColor);
    const right = await openExploreRight(page);
    await right.getByTestId("explore-color-by").getByRole("tab", { name: "num" }).click();
    const maxEl = right.getByTestId("num-heat-max");
    await expect(maxEl).toHaveText(formatLegendValue(obsColor.color_vmax));

    const nextVmax = obsColor.color_vmax - 2.25;
    await setModel(page, { color_vmin: obsColor.color_vmin + 1.5, color_vmax: nextVmax });
    await expect(maxEl).toHaveText(formatLegendValue(nextVmax));
  });
});
