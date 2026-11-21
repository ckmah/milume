import { expect, test } from "../fixtures";
import { bootLandmarksHarness, setModel } from "../helpers";

const CATEGORY =
  "Enterocyte (secretory, villus tip, a category name that clips)";

async function openBuffer(page: import("@playwright/test").Page, width: number) {
  await setModel(page, {
    x_bounds: [0, 40],
    y_bounds: [0, 40],
    landmarks: [
      {
        id: "lm-line",
        type: "line",
        vertices: [
          [10, 12],
          [28, 22],
        ],
        buffer_width: width,
        buffer_side: width === 0 ? "right" : "left",
        line_style: "solid",
        color: "#00e5ff",
      },
    ],
    selected_kind: "landmark",
    selected_index: 0,
  });
  await page.getByTestId("context-buffer-toggle").click();
  await expect(page.getByTestId("context-buffer-panel")).toBeVisible();
}

test.describe("Tactical refinements #468", () => {
  test.beforeEach(async ({ page }) => {
    await bootLandmarksHarness(page);
  });

  test("surface is black glass with a 4px blur", async ({ page }) => {
    const panel = page.locator(".landmarks-float--panel").first();
    await expect(panel).toBeVisible();
    const paint = await panel.evaluate((el) => {
      const cs = getComputedStyle(el);
      return {
        background: cs.backgroundColor,
        blur: cs.backdropFilter,
        border: cs.borderTop,
        shadow: cs.boxShadow,
        radius: cs.borderRadius,
      };
    });
    expect(paint.blur).toContain("blur(4px)");
    expect(paint.background).toMatch(/rgba?\(0,\s*0,\s*0,\s*0\.65\)/);
    expect(paint.border).toMatch(/1px solid rgba\(255,\s*255,\s*255,\s*0\.14\)/);
    expect(paint.shadow).toContain("rgba(0, 0, 0, 0.5)");
    expect(paint.radius).toBe("0px");
    const panelCorners = await panel.evaluate((el) => getComputedStyle(el).backgroundImage);
    expect(panelCorners).toContain("linear-gradient");
    const caret = await page.getByTestId("panel-collapse-caret-left").evaluate((el) => {
      return getComputedStyle(el).backgroundImage;
    });
    expect(caret).toBe("none");
  });

  test("surface blur and opacity follow the light notebook theme", { tag: "@isolated" }, async ({ page }) => {
    await page.getByRole("button", { name: "Switch to light" }).click();
    await expect(page.locator(".milume-widget.landmarks")).not.toHaveClass(/dark/);
    const panel = page.locator(".landmarks-float--panel").first();
    const paint = await panel.evaluate((el) => {
      const cs = getComputedStyle(el);
      return { background: cs.backgroundColor, blur: cs.backdropFilter };
    });
    expect(paint.blur).toContain("blur(4px)");
    expect(paint.background).toMatch(/rgba?\(214,\s*214,\s*214,\s*0\.97\)/);
  });

  test("category row tooltip shows the full category name", async ({ page }) => {
    await setModel(page, {
      category_columns: [
        {
          name: CATEGORY,
          labels: ["tip", "base"],
          palette: ["#3d7dff", "#ff8a00"],
        },
      ],
      active_category: CATEGORY,
      color: CATEGORY,
    });
    await page.getByTestId("explore-color-by").getByRole("tab", { name: "cat" }).click();
    const name = page.getByTestId("category-name").filter({ hasText: CATEGORY });
    await expect(name).toBeVisible();
    await name.hover();
    await expect(page.locator("[data-slot=tooltip-content]")).toHaveText(CATEGORY);
  });

  test("toolbar indicator matches the active button width", async ({ page }) => {
    const bar = page.getByRole("toolbar", { name: "Drawing tools" });
    const button = bar.getByRole("radio", { name: "Select", exact: true });
    await expect(button).toHaveAttribute("aria-checked", "true");
    await expect.poll(async () => {
      const buttonBox = await button.boundingBox();
      if (!buttonBox) return false;
      const marks = bar.locator(".tact-toolbar-mark");
      const count = await marks.count();
      for (let i = 0; i < count; i++) {
        const markBox = await marks.nth(i).boundingBox();
        if (!markBox) continue;
        const width = Math.abs(markBox.width - buttonBox.width) < 1.5;
        const left = Math.abs(markBox.x - buttonBox.x) < 2;
        if (width && left) return true;
      }
      return false;
    }).toBe(true);
  });

  test("signed buffer popup stays narrow and the fill starts at zero", async ({ page }) => {
    await openBuffer(page, 6.8542135);
    const panel = page.getByTestId("context-buffer-panel");
    const rem = await panel.evaluate((el) => {
      const px = el.getBoundingClientRect().width;
      const root = parseFloat(getComputedStyle(document.documentElement).fontSize);
      return px / root;
    });
    expect(rem).toBeGreaterThan(14.5);
    expect(rem).toBeLessThan(15.5);
    await expect(panel.locator(".landmarks-slider-caption")).toHaveText("Buffer");
    await expect(panel.locator(".tact-readout")).toHaveText("-6.9");
    await expect(panel.locator(".landmarks-slider-ends")).toHaveText("−+");

    const track = panel.locator("[data-slot=slider-track]");
    const range = panel.locator("[data-fill=zero]");
    const reset = page.getByTestId("context-buffer-reset");
    await expect.poll(async () => {
      const trackBox = await track.boundingBox();
      const rangeBox = await range.boundingBox();
      const resetBox = await reset.boundingBox();
      if (!trackBox || !rangeBox || !resetBox) return false;
      const zero = trackBox.x + trackBox.width / 2;
      const overlaps =
        resetBox.y < trackBox.y + trackBox.height && resetBox.y + resetBox.height > trackBox.y;
      const fromZero = Math.abs(rangeBox.x + rangeBox.width - zero) < 4;
      const notFromTheLeft = rangeBox.x > trackBox.x + 4;
      return overlaps && fromZero && notFromTheLeft && rangeBox.width > 4;
    }).toBe(true);

    await panel.locator(".landmarks-slider-caption").hover();
    await expect(page.locator("[data-slot=tooltip-content]")).toHaveText(
      "Negative is left or in, positive is right or out.",
    );
  });

  test("signed buffer fill collapses at zero", async ({ page }) => {
    await openBuffer(page, 0);
    const panel = page.getByTestId("context-buffer-panel");
    await expect(panel.locator(".tact-readout")).toHaveText("0.0");
    const range = panel.locator("[data-fill=zero]");
    await expect.poll(async () => (await range.boundingBox())?.width ?? 99).toBeLessThan(2);
  });
});
