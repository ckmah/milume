import { expect, type Page } from "@playwright/test";

import { test } from "../fixtures";

import { bootLandmarksHarness, stabilizeUi, waitForEngine } from "../helpers";

async function loadNicheDonutFixture(page: Page) {
  await page.evaluate(async () => {
    const res = await fetch("/squidpy-niche-fixture.json");
    if (!res.ok) throw new Error(`fixture ${res.status}`);
    const patch = (await res.json()) as Record<string, unknown>;
    const model = (window as any).__landmarksModel;
    for (const [k, v] of Object.entries(patch)) model.set(k, v);
    model.save_changes();
  });
  await waitForEngine(page, 150);
  await stabilizeUi(page);
}

async function openCategoryDonut(page: Page) {
  const right = page.locator(".landmarks__chrome-dock--right");
  if ((await right.getAttribute("data-collapsed")) === "true") {
    await page.getByRole("button", { name: "Show right panel" }).click();
  }
  await page.getByTestId("explore-color-by").getByRole("tab", { name: "category" }).click();
  await expect(page.getByTestId("explore-coloring-by")).toContainText(
    "nhood_niche_res=0.5",
  );
  const donut = page.getByTestId("info-donut");
  await expect(donut).toBeVisible();
  return donut;
}

function expectBoxInside(
  inner: { x: number; y: number; width: number; height: number },
  outer: { x: number; y: number; width: number; height: number },
  margin = 1,
) {
  expect(inner.x).toBeGreaterThanOrEqual(outer.x - margin);
  expect(inner.y).toBeGreaterThanOrEqual(outer.y - margin);
  expect(inner.x + inner.width).toBeLessThanOrEqual(outer.x + outer.width + margin);
  expect(inner.y + inner.height).toBeLessThanOrEqual(outer.y + outer.height + margin);
}

test.describe("Info donut", () => {
  test.beforeEach(async ({ page }) => {
    await bootLandmarksHarness(page);
    await loadNicheDonutFixture(page);
  });

  test("slice paths use SVG arcs without polyline wobble", async ({ page }) => {
    const donut = await openCategoryDonut(page);
    const paths = await donut.getByTestId("info-donut-segment").evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute("d") ?? ""),
    );
    expect(paths.length).toBeGreaterThan(0);
    for (const d of paths) {
      expect(d).toMatch(/\bA\b/);
      expect((d.match(/\bL\b/g) ?? []).length).toBeLessThanOrEqual(1);
      expect(d.split(/\bL\b/).length - 1).toBeLessThanOrEqual(1);
    }
  });

  test("category coloring shows donut segments and hover tooltip", async ({
    page,
  }) => {
    const donut = await openCategoryDonut(page);
    const segments = donut.getByTestId("info-donut-segment");
    expect(await segments.count()).toBeGreaterThan(0);

    await stabilizeUi(page);
    const box = await donut.boundingBox();
    expect(box).toBeTruthy();
    await page.mouse.move(
      box!.x + box!.width * 0.88,
      box!.y + box!.height * 0.42,
    );
    const tooltip = page.getByTestId("info-donut-tooltip");
    await expect(tooltip).toBeVisible();
    await expect(tooltip).toContainText("cells ·");
  });

  test("edge slice tooltips stay inside the widget root", async ({ page }) => {
    const donut = await openCategoryDonut(page);
    const widget = page.locator(".milume-widget.landmarks").first();
    const widgetBox = (await widget.boundingBox())!;

    const segmentCenters = await donut.getByTestId("info-donut-segment").evaluateAll((nodes) =>
      nodes.map((node) => {
        const box = node.getBoundingClientRect();
        return {
          x: box.x + box.width / 2,
          y: box.y + box.height / 2,
        };
      }),
    );
    expect(segmentCenters.length).toBeGreaterThan(0);

    const pickExtreme = (key: "x" | "y", min: boolean) => {
      let best = segmentCenters[0]!;
      for (const center of segmentCenters) {
        if (min ? center[key] < best[key] : center[key] > best[key]) best = center;
      }
      return best;
    };

    const hoverPoints = [
      pickExtreme("y", false),
      pickExtreme("y", true),
      pickExtreme("x", true),
      pickExtreme("x", false),
    ];

    for (const point of hoverPoints) {
      await page.mouse.move(point.x, point.y);
      const tooltip = page.getByTestId("info-donut-tooltip");
      await expect(tooltip).toBeVisible({ timeout: 5000 });
      const tooltipBox = (await tooltip.boundingBox())!;
      expectBoxInside(tooltipBox, widgetBox);
    }
  });
});
