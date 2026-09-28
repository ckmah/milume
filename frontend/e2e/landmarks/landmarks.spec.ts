import { expect, test, type Page } from "@playwright/test";

import {
  bootLandmarksHarness,
  canvasBox,
  clickLandmarkTool,
  getModel,
  getZoom,
  setModel,
  shot,
} from "../helpers";

const landmarkCount = async (page: Page) =>
  ((await getModel(page, "landmarks")) as unknown[]).length;
const lastLandmark = async (page: Page) =>
  ((await getModel(page, "landmarks")) as any[]).at(-1);

/**
 * Landmarks widget tier — functional coverage + 3 visual anchors:
 * rest chrome, selection+neighborhood, authoring commit.
 */
test.describe("LandmarksWidget", () => {
  test.beforeEach(async ({ page }) => {
    await bootLandmarksHarness(page);
  });

  test("zoom in/out/reset buttons change viewState", async ({ page }) => {
    const widget = page.locator(".landmarks").first();
    await shot(page, "rest", widget);

    const baseline = await getZoom(page);
    await page.getByRole("button", { name: "Zoom in" }).click();
    await expect.poll(() => getZoom(page)).toBeGreaterThan(baseline);
    const afterIn = await getZoom(page);

    await page.getByRole("button", { name: "Zoom out" }).click();
    await expect.poll(() => getZoom(page)).toBeLessThan(afterIn);

    await page.getByRole("button", { name: "Reset view" }).click();
    await expect
      .poll(async () => Math.abs((await getZoom(page)) - baseline))
      .toBeLessThan(0.35);
  });

  test("landmark point authoring happy path", async ({ page }) => {
    const widget = page.locator(".landmarks").first();
    const before = await landmarkCount(page);
    await clickLandmarkTool(page, "Point");
    await expect.poll(() => getModel(page, "mode")).toBe("point");

    const box = await canvasBox(page);
    await page.mouse.click(box.x + box.width * 0.55, box.y + box.height * 0.45);
    await expect.poll(() => landmarkCount(page)).toBe(before + 1);
    const placed = await lastLandmark(page);
    expect(placed.type).toBe("point");
    expect(placed.vertices?.length).toBe(1);
    await shot(page, "after-place-point", widget);
  });

  test("line drag places a two-vertex landmark", async ({ page }) => {
    const before = await landmarkCount(page);
    await clickLandmarkTool(page, "Line");
    await expect.poll(() => getModel(page, "mode")).toBe("line");

    const box = await canvasBox(page);
    await page.mouse.move(box.x + box.width * 0.35, box.y + box.height * 0.4);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.65, box.y + box.height * 0.55, { steps: 8 });
    await page.mouse.up();

    await expect.poll(() => landmarkCount(page)).toBe(before + 1);
    const line = await lastLandmark(page);
    expect(line.type).toBe("line");
    expect(line.vertices?.length).toBe(2);
  });

  test("spline and shape are click-to-add only (no drag stroke)", async ({
    page,
  }) => {
    const box = await canvasBox(page);
    const at = (fx: number, fy: number) =>
      page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
    const dragStroke = async (fx0: number, fy0: number, fx1: number, fy1: number) => {
      await page.mouse.move(box.x + box.width * fx0, box.y + box.height * fy0);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width * fx1, box.y + box.height * fy1, { steps: 8 });
      await page.mouse.up();
    };

    await clickLandmarkTool(page, "Spline");
    await expect.poll(() => getModel(page, "mode")).toBe("spline");
    const beforeSpline = await landmarkCount(page);
    await dragStroke(0.3, 0.3, 0.36, 0.34);
    expect(await landmarkCount(page)).toBe(beforeSpline);
    await page.keyboard.press("Escape");

    await at(0.32, 0.32);
    await at(0.48, 0.28);
    await page.keyboard.press("Enter");
    await expect.poll(() => landmarkCount(page)).toBe(beforeSpline + 1);
    const spline = await lastLandmark(page);
    expect(spline.type).toBe("spline");
    expect(spline.vertices?.length).toBe(2);

    await clickLandmarkTool(page, "Shape");
    await expect.poll(() => getModel(page, "mode")).toBe("shape");
    const beforeShape = beforeSpline + 1;
    await dragStroke(0.6, 0.35, 0.75, 0.5);
    expect(await landmarkCount(page)).toBe(beforeShape);
    await page.keyboard.press("Escape");

    await at(0.6, 0.35);
    await at(0.72, 0.38);
    await at(0.66, 0.52);
    await page.keyboard.press("Enter");
    await expect.poll(() => landmarkCount(page)).toBe(beforeShape + 1);
    const shape = await lastLandmark(page);
    expect(shape.type).toBe("shape");
    expect(shape.vertices?.length).toBe(3);
  });

  test("selection neighborhood: highlight, Shift+wheel radius, radius gradient vs knn edges", async ({
    page,
  }) => {
    const widget = page.locator(".landmarks").first();
    const selectionOverlay = () =>
      page.evaluate(() => (window as any).__landmarksEngine.getSelectionOverlay());
    const hoodOverlay = () =>
      page.evaluate(() => (window as any).__landmarksEngine.getNeighborhoodOverlay());

    // Focusing a landmark leaves every selection unhighlighted and unoutlined.
    await setModel(page, { selected_kind: "landmark", selected_index: 0 });
    await expect.poll(async () => (await selectionOverlay()).length).toBeGreaterThan(0);
    for (const row of await selectionOverlay()) {
      expect(row.selected).toBe(false);
      expect(row.lineWidth).toBe(0);
    }

    // Focusing a selection highlights its points, still without an outline.
    await setModel(page, { selected_kind: "selection", selected_index: 0 });
    await expect
      .poll(async () => (await selectionOverlay()).find((r: any) => r.index === 0)?.selected)
      .toBe(true);
    const active = (await selectionOverlay()).find((r: any) => r.index === 0);
    expect(active.pointCount).toBeGreaterThan(0);
    expect(active.lineWidth).toBe(0);
    expect(active.lineAlpha).toBe(0);
    await shot(page, "selection-neighborhood", widget);

    // Radius neighborhood: a soft bitmap gradient covering the radius (ADR 0004), no disks or edges.
    let hood = await hoodOverlay();
    expect(hood.mode).toBe("radius");
    expect(hood.radiusGradient).toBe(true);
    expect(hood.gradientKind).toBe("bitmap");
    expect(hood.gradientSeedCount).toBeGreaterThan(0);
    expect(hood.radiusDiskCount).toBe(0);
    expect(hood.edgeCount).toBe(0);
    expect(hood.radius).toBeGreaterThan(0);
    expect(hood.gradientBakeRadius).toBeGreaterThanOrEqual(hood.radius);

    // Shift+wheel on either axis grows, then shrinks, the radius.
    const box = await canvasBox(page);
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    const radius = async () =>
      Number(((await getModel(page, "selections")) as any[])[0].neighborhood_radius);
    await page.keyboard.down("Shift");
    for (const [dx, dy] of [
      [0, -120],
      [-120, 0],
    ] as const) {
      const start = await radius();
      await page.mouse.wheel(dx, dy);
      await expect.poll(radius).toBeGreaterThan(start);
      const grown = await radius();
      await page.mouse.wheel(-dx, -dy);
      await expect.poll(radius).toBeLessThan(grown);
    }
    await page.keyboard.up("Shift");

    // knn neighborhood: edges instead of the gradient.
    const sels = (await getModel(page, "selections")) as any[];
    await setModel(page, {
      selections: [{ ...sels[0], neighborhood: "knn", neighborhood_k: 8 }, ...sels.slice(1)],
      selected_kind: "selection",
      selected_index: 0,
    });
    await expect.poll(async () => (await hoodOverlay()).mode).toBe("knn");
    hood = await hoodOverlay();
    expect(hood.edgeCount).toBeGreaterThan(0);
    expect(hood.radiusGradient).toBe(false);
    expect(hood.radiusDiskCount).toBe(0);
  });

  test("Select / Node / Move / Probe and lasso geometry control", async ({ page }) => {
    for (const name of ["Select", "Node", "Move", "Probe"]) {
      await expect(page.getByRole("radio", { name, exact: true })).toBeVisible();
    }
    // Geometry is a right-click menu on the lasso button, not a ModeToggle radio.
    await expect(page.getByRole("radio", { name: "Selection", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Lasso/i })).toBeVisible();

    await page.getByRole("button", { name: /Lasso/i }).click();
    await expect.poll(() => getModel(page, "mode")).toBe("lasso");
    for (const [radio, mode] of [
      ["Move", "move"],
      ["Probe", "probe"],
      ["Node", "node"],
      ["Select", "select"],
    ] as const) {
      await page.getByRole("radio", { name: radio, exact: true }).click();
      await expect.poll(() => getModel(page, "mode")).toBe(mode);
    }
  });

  test("select pin via model + Esc clears", async ({ page }) => {
    const pin = () => page.evaluate(() => (window as any).__landmarksEngine.getInspectPin());
    await page.getByRole("radio", { name: "Select", exact: true }).click();
    await setModel(page, { selected_kind: "", selected_index: -1 });
    await expect.poll(pin).toBeNull();

    await setModel(page, { selected_kind: "molecule", selected_index: 0 });
    await expect.poll(pin).toEqual({ kind: "molecule", index: 0 });

    await page.locator("canvas.landmarks__webgl").first().focus();
    await page.keyboard.press("Escape");
    await expect.poll(pin).toBeNull();
    expect(await getModel(page, "selected_kind")).toBe("");
  });

  test("Inspect without a 3D image places the square and opens no cube", async ({ page }) => {
    await page.getByRole("radio", { name: "Inspect", exact: true }).click();
    await expect(page.getByTestId("context-inspect-no-volume")).toHaveText(
      "No 3D image: build the widget from a SpatialData with a 3D image",
    );
    const box = await canvasBox(page);
    await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.5);
    await expect.poll(async () => getModel(page, "inspect_cx")).not.toBeNull();
    await expect(page.getByRole("dialog", { name: "Cube" })).toHaveCount(0);
    await page.getByRole("radio", { name: "Select", exact: true }).click();
    await expect(page.getByTestId("context-inspect-no-volume")).toHaveCount(0);
  });

  test("context toolbar docks at bottom center for selected landmark", async ({
    page,
  }) => {
    await setModel(page, {
      landmarks: [
        {
          id: "lm-line",
          type: "line",
          vertices: [
            [2500, 800],
            [2800, 1000],
          ],
          buffer_width: 40,
          buffer_side: "both",
          line_style: "solid",
          color: "#00e5ff",
        },
      ],
      selected_kind: "landmark",
      selected_index: 0,
    });

    const bar = page.getByTestId("context-selection-toolbar");
    await expect(bar).toBeVisible();
    await expect(bar).toHaveAttribute("data-placement", "dock");
    const widgetBox = await page.locator(".landmarks").first().boundingBox();
    const box = await bar.boundingBox();
    expect(box && widgetBox).toBeTruthy();
    expect(box!.y + box!.height).toBeGreaterThan(widgetBox!.y + widgetBox!.height * 0.6);

    const first = async () => ((await getModel(page, "landmarks")) as any[])[0];
    await page.getByTestId("context-line-style").click();
    await expect.poll(async () => (await first()).line_style).toBe("dashed");

    await page.getByTestId("context-buffer-toggle").click();
    await expect(page.getByTestId("context-buffer-panel")).toBeVisible();
    await page.getByTestId("context-buffer-both").click();
    await expect.poll(async () => (await first()).buffer_side).toBe("right");
  });

  test("context toolbar promote from selection neighborhood", async ({
    page,
  }) => {
    await setModel(page, {
      selected_kind: "selection",
      selected_index: 0,
      selections: [
        {
          id: "lasso-1",
          type: "polygon",
          vertices: [
            [2800, 600],
            [3100, 600],
            [3100, 900],
            [2800, 900],
          ],
          neighborhood: "knn",
          neighborhood_k: 4,
        },
      ],
    });

    await expect(page.getByTestId("context-selection-toolbar")).toBeVisible();
    await expect(page.getByTestId("context-hood-knn-mode")).toHaveAttribute(
      "aria-checked",
      "true",
    );
    const selections = async () => (await getModel(page, "selections")) as any[];
    await page.getByTestId("promote-neighborhood").click();
    // The seeds plus their neighbours become a new, focused point selection.
    await expect.poll(async () => (await selections()).length).toBe(2);
    const promoted = (await selections())[1];
    expect(promoted.type).toBe("points");
    expect(promoted.point_indices.length).toBeGreaterThan(0);
    expect(await getModel(page, "selected_index")).toBe(1);
  });

  test("toolbar: interaction order, lasso and landmark dropdowns, cube icon", async ({ page }) => {
    const bar = page.getByRole("toolbar", { name: "Drawing tools" });
    const radios = bar.getByRole("radio");
    const names = await radios.evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")));
    expect(names).toEqual(["Select", "Move", "Inspect", "Probe", "Node"]);
    await expect(bar.locator('[aria-label="Inspect"] svg.lucide-box')).toHaveCount(1);
    const landmark = bar.getByRole("button", { name: /Point\. Right-click for landmark menu/ });
    await landmark.click();
    await expect.poll(() => getModel(page, "mode")).toBe("point");
    await landmark.click({ button: "right" });
    await page.getByRole("menuitem", { name: /Spline/ }).click();
    await expect.poll(() => getModel(page, "mode")).toBe("spline");
    await bar.getByRole("radio", { name: "Select" }).click();
    await bar.getByRole("button", { name: /Spline\. Right-click for landmark menu/ }).click(); // remembers last used
    await expect.poll(() => getModel(page, "mode")).toBe("spline");
  });

  test("active lasso keeps its colours on hover in dark mode", async ({ page }) => {
    const lasso = page.getByRole("button", { name: /Lasso\. Right-click for shape menu/ });
    await lasso.click();
    await lasso.hover();
    const [bg, fg] = await lasso.evaluate((el) => [getComputedStyle(el).backgroundColor, getComputedStyle(el).color]);
    expect(bg).not.toBe(fg);
    const select = page.getByRole("radio", { name: "Select" });
    await select.click();
    await select.hover();
    const onBg = await select.evaluate((el) => getComputedStyle(el).backgroundColor);
    await lasso.click();
    await lasso.hover();
    expect(await lasso.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(onBg);
  });

  test("side panels collapse to a peek tab and come back", async ({ page }) => {
    // Collapse buttons sit beside their panels, not on them.
    for (const side of ["left", "right"] as const) {
      const dock = await page.locator(`.landmarks__chrome-dock--${side}`).boundingBox();
      const btn = await page.getByRole("button", { name: `Collapse ${side} panel` }).boundingBox();
      expect(dock && btn).toBeTruthy();
      if (side === "left") expect(btn!.x).toBeGreaterThanOrEqual(dock!.x + dock!.width);
      else expect(btn!.x + btn!.width).toBeLessThanOrEqual(dock!.x);
    }

    const left = page.locator(".landmarks__chrome-dock--left");
    await page.getByRole("button", { name: "Collapse left panel" }).click();
    await expect(left).toHaveAttribute("data-collapsed", "true");
    // A collapsed dock is inert: its controls cannot take focus.
    const focusable = (loc: typeof left) =>
      loc.locator("button").first().evaluate((el: HTMLElement) => {
        el.focus();
        return document.activeElement === el;
      });
    expect(await focusable(left)).toBe(false);
    await page.getByRole("button", { name: "Show left panel" }).click();
    expect(await focusable(left)).toBe(true);
    await expect(left).toHaveAttribute("data-collapsed", "false");
    const box = await canvasBox(page);
    await page.mouse.click(box.x + 5, box.y + box.height - 5); // focus the widget
    const right = page.locator(".landmarks__chrome-dock--right");
    await page.keyboard.press("]");
    await expect(right).toHaveAttribute("data-collapsed", "true");
    await page.keyboard.press("]");
    await expect(right).toHaveAttribute("data-collapsed", "false");
  });

  test("hold Space to pan in any tool without changing the mode", async ({ page }) => {
    const box = await canvasBox(page);
    const target = () =>
      page.evaluate(() => (window as any).__landmarksEngine.getViewState()?.target as number[]);
    const selectionCount = async () => ((await getModel(page, "selections")) as unknown[]).length;
    const cx = box.x + box.width * 0.5;
    const cy = box.y + box.height * 0.5;
    const drag = async () => {
      await page.mouse.move(cx, cy);
      await page.mouse.down();
      await page.mouse.move(cx + 80, cy + 40, { steps: 6 });
      await page.mouse.up();
    };

    // Plain drag in Select does not pan.
    const before = await target();
    await drag();
    expect(await target()).toEqual(before);

    // Lasso armed, Space held: the drag pans instead of drawing, and the tool stays.
    await page.keyboard.press("l");
    await expect.poll(() => getModel(page, "mode")).toBe("lasso");
    const selections = await selectionCount();
    await page.keyboard.down(" ");
    await drag();
    await page.keyboard.up(" ");
    const after = await target();
    expect(Math.abs(after[0]! - before[0]!) + Math.abs(after[1]! - before[1]!)).toBeGreaterThan(0);
    expect(await getModel(page, "mode")).toBe("lasso");
    expect(await selectionCount()).toBe(selections);

    // Released: the lasso draws again (no pan).
    const settled = await target();
    await drag();
    expect(await target()).toEqual(settled);
  });
});
