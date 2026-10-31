import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { expect, type Locator, type Page } from "@playwright/test";

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

/** Legend title and value ticks must not share pixels. */
async function expectLegendTicksDoNotOverlap(strip: Locator) {
  const overlapping = await strip.evaluate((root) => {
    const nodes = root.querySelectorAll("[data-legend-tick]");
    const rects: DOMRect[] = [];
    for (const node of nodes) {
      const r = node.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) continue;
      rects.push(r);
    }
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i];
        const b = rects[j];
        if (a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top) {
          return true;
        }
      }
    }
    return false;
  });
  expect(overlapping).toBe(false);
}

async function expectSingleNumObsLegend(page: Page, right: Locator) {
  await expect(right.getByTestId("num-heat-strip")).toHaveCount(1);
  await expect(page.getByTestId("obs-channel-legend")).toHaveCount(0);
  await expect(page.getByTestId("obs-ramp-legend")).toHaveCount(0);
}

test.describe("Landmarks numeric obs heat strip", () => {
  test.beforeEach(async ({ page }) => {
    await bootLandmarksHarness(page);
    await waitForEngine(page);
  });

  test("num tab shows heat strip scale; cat and genes hide it", async ({ page }) => {
    await setModel(page, obsColor);
    await expect
      .poll(async () => ((await getModel(page, "_color_state")) as { color_mode?: string }).color_mode)
      .toBe("obs");

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

  test("signed obs column uses diverging symmetric limits", async ({ page }) => {
    const signed = JSON.parse(
      readFileSync(
        fileURLToPath(new URL("../../dev/harness-twin-obs-signed.json", import.meta.url)),
        "utf8",
      ),
    );
    await setModel(page, signed);
    await expect
      .poll(async () => ((await getModel(page, "_color_state")) as { color_mode?: string }).color_mode)
      .toBe("obs");
    const right = await openExploreRight(page);
    await right.getByTestId("explore-color-by").getByRole("tab", { name: "num" }).click();
    const look = (await getModel(page, "_look")) as {
      color_vmin?: number;
      color_vmax?: number;
      color_diverging?: boolean;
    };
    expect(look.color_diverging).toBe(true);
    expect(look.color_vmin).toBeLessThan(0);
    expect(look.color_vmax).toBeGreaterThan(0);
    expect(Math.abs(look.color_vmin! + look.color_vmax!)).toBeLessThan(1e-6);
    await expect(right.getByTestId("num-heat-max")).toHaveText(
      formatLegendValue(look.color_vmax!),
    );
    await expectSingleNumObsLegend(page, right);
    const strip = right.getByTestId("num-heat-strip");
    await expect(strip.getByTestId("num-heat-zero")).toHaveText(formatLegendValue(0));
    await expectLegendTicksDoNotOverlap(strip);
  });

  test("positive numeric obs keeps single strip legend without zero tick", async ({ page }) => {
    await setModel(page, obsColor);
    const right = await openExploreRight(page);
    await right.getByTestId("explore-color-by").getByRole("tab", { name: "num" }).click();
    const strip = right.getByTestId("num-heat-strip");
    await expect(strip).toBeVisible();
    await expect(strip.getByTestId("num-heat-zero")).toHaveCount(0);
    await expectSingleNumObsLegend(page, right);
    await expectLegendTicksDoNotOverlap(strip);
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
