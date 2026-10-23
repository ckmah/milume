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

test.describe("Landmarks numeric obs ramp legend", () => {
  test.beforeEach(async ({ page }) => {
    await bootLandmarksHarness(page);
    await waitForEngine(page);
  });

  test("numeric obs shows ramp title and scale ends; category and gene hide it", async ({ page }) => {
    await setModel(page, obsColor);
    await expect.poll(() => getModel(page, "color_mode")).toBe("obs");

    const right = await openExploreRight(page);
    await expect(right.getByTestId("explore-color-by").getByRole("tab", { name: "category" })).toHaveAttribute(
      "data-state",
      "active",
    );

    const ramp = right.getByTestId("obs-ramp-legend");
    await expect(ramp).toBeVisible();
    await expect(ramp).toContainText("harness_area");
    await expect(ramp.getByTestId("obs-ramp-vmin")).toHaveText(formatLegendValue(obsColor.color_vmin));
    await expect(ramp.getByTestId("obs-ramp-vmax")).toHaveText(formatLegendValue(obsColor.color_vmax));
    await expect(right.getByTestId("info-chart-well")).not.toContainText("No category counts in this scope.");

    await setModel(page, twinColor);
    await expect.poll(() => getModel(page, "color_mode")).toBe("categorical");
    await expect(right.getByTestId("obs-ramp-legend")).toHaveCount(0);

    await right.getByRole("tab", { name: "genes" }).click();
    const genePicker = page.getByTestId("explore-color-controls").getByPlaceholder("Select genes");
    await genePicker.click();
    await page.keyboard.type("Abtb3");
    await page.getByRole("option", { name: "Abtb3", exact: true }).click();
    await expect.poll(() => getModel(page, "active_genes")).toEqual(["Abtb3"]);
    await expect(right.getByTestId("obs-ramp-legend")).toHaveCount(0);
    await expect(right.getByTestId("genes-channel-legend")).toBeVisible();

    await right.screenshot({
      path: "/opt/cursor/artifacts/screenshots/issue-209-obs-ramp-explore.png",
    });
  });

  test("color_vmin and color_vmax updates re-render scale ends", async ({ page }) => {
    await setModel(page, obsColor);
    const right = await openExploreRight(page);
    const vmax = right.getByTestId("obs-ramp-vmax");
    await expect(vmax).toHaveText(formatLegendValue(obsColor.color_vmax));

    const nextVmin = obsColor.color_vmin + 1.5;
    const nextVmax = obsColor.color_vmax - 2.25;
    await setModel(page, { color_vmin: nextVmin, color_vmax: nextVmax });
    await expect(right.getByTestId("obs-ramp-vmin")).toHaveText(formatLegendValue(nextVmin));
    await expect(vmax).toHaveText(formatLegendValue(nextVmax));
  });
});
