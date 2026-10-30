import { expect } from "@playwright/test";

import { test } from "../fixtures";

import { setModel, waitForEngine } from "../helpers";

const ILEUM_FIXTURE = "/e2e-galt-lasso-fixture.json";

async function galtLassoViaModel(page: import("@playwright/test").Page) {
  const bounds = await page.evaluate(() => {
    const m = window.__landmarksModel;
    const eng = window.__landmarksEngine;
    const cols = m.get("category_columns") || [];
    const colIdx = cols.findIndex((c: { name: string }) => c.name === "anatomical_layer");
    if (colIdx < 0) return null;
    const galtIdx = cols[colIdx].labels.indexOf("GALT");
    if (galtIdx < 0) return null;
    const b64 = m.get("category_codes");
    const raw = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const codes = new Int32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4);
    const pts = eng.getPoints();
    const n = pts.length;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < n; i++) {
      if (codes[colIdx * n + i] !== galtIdx) continue;
      const [x, y] = pts[i];
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
    const pad = Math.max(maxX - minX, maxY - minY) * 0.35 + 40;
    return { minX, maxX, minY, maxY, pad };
  });
  if (!bounds) throw new Error("GALT bounds not found in ileum fixture");
  await setModel(page, {
    active_category: "cell_type",
    color_mode: "categorical",
    selections: [
      {
        id: "galt-lasso",
        type: "lasso",
        vertices: [
          [bounds.minX - bounds.pad * 0.2, bounds.minY - bounds.pad * 0.2],
          [bounds.maxX + bounds.pad * 0.2, bounds.minY - bounds.pad * 0.15],
          [bounds.maxX + bounds.pad * 0.15, bounds.maxY + bounds.pad * 0.2],
          [bounds.minX - bounds.pad * 0.15, bounds.maxY + bounds.pad * 0.15],
        ],
      },
    ],
    selected_kind: "selection",
    selected_index: 0,
  });
}

test.describe("ileum GALT lasso composition", { tag: "@isolated" }, () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`/?fixture=${encodeURIComponent(ILEUM_FIXTURE)}`, { waitUntil: "networkidle" });
    await waitForEngine(page);
  });

  test("vertex-only lasso shows category counts in the Measure panel", async ({ page }) => {
    await galtLassoViaModel(page);
    const right = page.locator(".landmarks__chrome-dock--right");
    if ((await right.getAttribute("data-collapsed")) === "true") {
      await page.getByRole("button", { name: "Show right panel" }).click();
    }
    const well = right.getByTestId("info-chart-well");
    await expect(well).not.toContainText("No category counts in this scope.");
    await expect(well.locator("svg[aria-label='Cell type composition']")).toBeVisible();
  });
});
