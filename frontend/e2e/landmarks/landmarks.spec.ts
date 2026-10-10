import { expect, type Page } from "@playwright/test";

import { test } from "../fixtures";

import {
  bootLandmarksHarness,
  canvasBox,
  clickLandmarkTool,
  getModel,
  getZoom,
  setModel,
  shot,
  waitForEngine,
} from "../helpers";

function cssColorToHex(css: string): string {
  const t = css.trim().toLowerCase();
  if (t.startsWith("#")) return t;
  const m = t.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (!m) return t;
  const hex = (n: string) => Number(n).toString(16).padStart(2, "0");
  return `#${hex(m[1]!)}${hex(m[2]!)}${hex(m[3]!)}`;
}

async function panelSwatchHex(page: Page, label: string) {
  const row = page.locator(".landmarks-layer-row").filter({
    has: page.getByText(label, { exact: true }),
  });
  const swatch = row.locator(".landmarks-layer-swatch").first();
  const bg = await swatch.evaluate((el) => getComputedStyle(el).backgroundColor);
  return cssColorToHex(bg);
}

async function expectLandmarkColorsAligned(page: Page, ids: string[]) {
  const landmarks = (await getModel(page, "landmarks")) as { id: string }[];
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i]!;
    const index = landmarks.findIndex((lm) => lm.id === id);
    expect(index).toBeGreaterThanOrEqual(0);
    const mapHex = await page.evaluate(
      (idx) => (window as any).__landmarksEngine.landmarkStrokeColor(idx) as string,
      index,
    );
    const panelHex = await panelSwatchHex(page, id);
    expect(panelHex).toBe(mapHex);
  }
}

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

    // k-NN neighborhood: edge lines only for small selections (see neighborhood-perf.js).
    const sels = (await getModel(page, "selections")) as any[];
    const smallSeeds = Array.from({ length: 40 }, (_, i) => i);
    await setModel(page, {
      selections: [
        {
          id: "knn-small",
          type: "points",
          point_indices: smallSeeds,
          neighborhood: "knn",
          neighborhood_k: 8,
        },
        ...sels.slice(1),
      ],
      selected_kind: "selection",
      selected_index: 0,
    });
    await expect.poll(async () => (await hoodOverlay()).mode).toBe("knn");
    await expect.poll(async () => (await hoodOverlay()).knnEdgeLinesDrawn).toBe(true);
    await expect.poll(async () => (await hoodOverlay()).edgeCount).toBeGreaterThan(0);
    hood = await hoodOverlay();
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
    const before = await getModel(page, "selections");
    const box = await canvasBox(page);
    await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.5);
    await expect.poll(async () => getModel(page, "inspect_cx")).not.toBeNull();
    await expect(page.getByRole("dialog", { name: "Cube" })).toHaveCount(0);
    // Placement only: no inspect selection is committed.
    expect(await getModel(page, "selections")).toEqual(before);
    // The Inspect pill (armed: no cube to open) stands in for the tool pill; Exit leaves Inspect.
    const pill = page.getByTestId("inspect-pill");
    await expect(pill).toHaveAttribute("data-state", "armed");
    await pill.getByRole("button", { name: "Exit Inspect" }).click();
    await expect(page.getByTestId("context-inspect-no-volume")).toHaveCount(0);
    await expect.poll(() => getModel(page, "mode")).toBe("select");
  });

  test("Inspect without a 3D image: Esc leaves it for the tool pill", async ({ page }) => {
    await page.getByRole("radio", { name: "Inspect", exact: true }).click();
    const pill = page.getByTestId("inspect-pill");
    await expect(pill).toHaveAttribute("data-state", "armed");
    await expect(page.getByRole("toolbar", { name: "Drawing tools" })).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(pill).toHaveCount(0);
    await expect(page.getByRole("toolbar", { name: "Drawing tools" })).toBeVisible();
    await expect.poll(() => getModel(page, "mode")).toBe("select");
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
    const xb = (await getModel(page, "x_bounds")) as [number, number];
    const yb = (await getModel(page, "y_bounds")) as [number, number];
    const [x0, x1] = xb;
    const [y0, y1] = yb;
    const mx = (x0 + x1) * 0.5;
    const my = (y0 + y1) * 0.5;
    const dx = (x1 - x0) * 0.35;
    const dy = (y1 - y0) * 0.35;
    await setModel(page, {
      selected_kind: "selection",
      selected_index: 0,
      selections: [
        {
          id: "lasso-1",
          type: "polygon",
          vertices: [
            [mx - dx, my - dy],
            [mx + dx, my - dy],
            [mx + dx, my + dy],
            [mx - dx, my + dy],
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

  test("rulers: labels sit on the data and follow a pan; a grid line at every tick above the map", async ({
    page,
  }) => {
    await setModel(page, { show_rulers: true });
    const rulers = page.getByTestId("canvas-rulers");
    const yTicks = rulers.locator(".landmarks-ruler--y .landmarks-ruler-tick");
    const xTicks = rulers.locator(".landmarks-ruler--x .landmarks-ruler-tick");
    await expect(yTicks.first()).toBeVisible();
    const box = await canvasBox(page);
    /** Each tick label's value and its centre, next to where the view puts that value. */
    const layout = () =>
      page.evaluate(
        ({ b }) => {
          const vs = (window as any).__landmarksEngine.getViewState();
          const k = 2 ** vs.zoom;
          const read = (sel: string, axis: 0 | 1) =>
            [...document.querySelectorAll(sel)].map((el) => {
              const r = el.getBoundingClientRect();
              const value = Number(el.getAttribute("data-value"));
              const at = axis
                ? b.y + b.height / 2 + (value - vs.target[1]) * k
                : b.x + b.width / 2 + (value - vs.target[0]) * k;
              return { value, centre: axis ? r.y + r.height / 2 : r.x + r.width / 2, at };
            });
          return {
            x: read(".landmarks-ruler--x .landmarks-ruler-tick", 0),
            y: read(".landmarks-ruler--y .landmarks-ruler-tick", 1),
          };
        },
        { b: box },
      );
    const onData = (ticks: { centre: number; at: number }[]) =>
      ticks.every((t) => Math.abs(t.centre - t.at) < 2);
    // Once the rulers have risen in.
    await expect.poll(async () => { const l = await layout(); return onData(l.x) && onData(l.y); }).toBe(true);
    const before = await layout();

    // Pan down: the data moves down, and so does each Y label.
    await page.getByRole("radio", { name: "Move", exact: true }).click();
    const cx = box.x + box.width * 0.5;
    const cy = box.y + box.height * 0.5;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx, cy + 60, { steps: 6 });
    await page.mouse.up();
    const after = await layout();
    expect(onData(after.y)).toBe(true);
    // Per value kept on screen: how far its label and its data point moved.
    const moved = before.y.flatMap((t) => {
      const same = after.y.find((u) => u.value === t.value);
      return same ? [{ label: same.centre - t.centre, data: same.at - t.at }] : [];
    });
    expect(moved.length).toBeGreaterThan(0);
    for (const m of moved) {
      expect(m.data).toBeGreaterThan(10);
      expect(Math.abs(m.label - m.data)).toBeLessThan(2);
    }

    // One full-length grid line per tick, over the map, never hit by the pointer.
    const grid = rulers.locator(".landmarks-ruler-grid");
    await expect(grid.locator(".landmarks-ruler-grid-line--x")).toHaveCount(await xTicks.count());
    await expect(grid.locator(".landmarks-ruler-grid-line--y")).toHaveCount(await yTicks.count());
    const stack = await page.evaluate(() => {
      const canvas = document.querySelector("canvas.landmarks__webgl")!;
      const g = document.querySelector(".landmarks-ruler-grid")!;
      const line = g.querySelector(".landmarks-ruler-grid-line--y")!;
      const overlay = g.closest("[data-testid=canvas-rulers]")!;
      const host = canvas.closest(".landmarks__plot-host")!;
      return {
        after: Boolean(canvas.compareDocumentPosition(g) & Node.DOCUMENT_POSITION_FOLLOWING),
        above: Number(getComputedStyle(overlay).zIndex) > (Number(getComputedStyle(host).zIndex) || 0),
        pointer: getComputedStyle(line).pointerEvents,
        width: line.getBoundingClientRect().width,
        gridWidth: g.getBoundingClientRect().width,
      };
    });
    expect(stack.after).toBe(true);
    expect(stack.above).toBe(true);
    expect(stack.pointer).toBe("none");
    expect(stack.width).toBeCloseTo(stack.gridWidth, 0);
    await expect(rulers.locator(".landmarks-ruler-cross")).toHaveCount(0);
  });

  test("Space pans on the first try: pointer over the map, never clicked", async ({ page }) => {
    const box = await canvasBox(page);
    const target = () =>
      page.evaluate(() => (window as any).__landmarksEngine.getViewState()?.target as number[]);
    const cx = box.x + box.width * 0.5;
    const cy = box.y + box.height * 0.5;
    const spaceDrag = async () => {
      await page.keyboard.down(" ");
      await page.mouse.down();
      await page.mouse.move(cx + 80, cy + 40, { steps: 6 });
      await page.mouse.up();
      await page.keyboard.up(" ");
      await page.mouse.move(cx, cy);
    };
    const panned = (a: number[], b: number[]) => Math.abs(b[0]! - a[0]!) + Math.abs(b[1]! - a[1]!) > 0;

    // Fresh load, focus on the page body: hovering the map is enough.
    await page.mouse.move(cx, cy, { steps: 3 });
    const t0 = await target();
    await spaceDrag();
    expect(panned(t0, await target())).toBe(true);

    // Focus in an editor outside the widget (a notebook cell): the pointer over
    // the map still wins, and the space is not typed.
    const textarea = await page.evaluateHandle(() => {
      const el = document.createElement("textarea");
      el.setAttribute("aria-label", "Outside editor");
      el.style.cssText = "position:fixed;left:0;top:0;width:60px;height:24px;z-index:9999";
      document.body.append(el);
      el.focus();
      return el;
    });
    await page.mouse.move(cx + 4, cy + 4, { steps: 3 });
    await page.mouse.move(cx, cy);
    const t1 = await target();
    await spaceDrag();
    expect(panned(t1, await target())).toBe(true);
    expect(await textarea.evaluate((el) => (el as HTMLTextAreaElement).value)).toBe("");

    // Typing there with the pointer parked over the map types its spaces.
    await textarea.evaluate((el) => (el as HTMLTextAreaElement).focus());
    const t2 = await target();
    await page.keyboard.type("a b");
    expect(await textarea.evaluate((el) => (el as HTMLTextAreaElement).value)).toBe("a b");
    expect(await target()).toEqual(t2);

    // Over a side panel (not the map) the space is typed, even after a move there.
    const panel = (await page.locator(".landmarks__chrome-dock--right").boundingBox())!;
    await page.mouse.move(panel.x + panel.width / 2, panel.y + panel.height / 2, { steps: 3 });
    await page.mouse.move(panel.x + panel.width / 2 + 4, panel.y + panel.height / 2);
    await page.keyboard.type(" c");
    expect(await textarea.evaluate((el) => (el as HTMLTextAreaElement).value)).toBe("a b c");
    expect(await target()).toEqual(t2);
  });

  test("landmark panel swatch matches map stroke (id hash, delete, reorder)", async ({
    page,
  }) => {
    const [xMin, xMax] = (await getModel(page, "x_bounds")) as [number, number];
    const [yMin, yMax] = (await getModel(page, "y_bounds")) as [number, number];
    const cx = (xMin + xMax) / 2;
    const cy = (yMin + yMax) / 2;
    const landmarks = [
      {
        id: "vessel",
        type: "line",
        vertices: [[cx - 120, cy - 40], [cx + 80, cy + 20]],
      },
      {
        id: "tumour nest",
        type: "shape",
        vertices: [
          [cx - 60, cy + 60],
          [cx + 40, cy + 50],
          [cx + 30, cy + 120],
          [cx - 50, cy + 110],
        ],
        tension: 0,
      },
    ];
    await setModel(page, {
      landmarks,
      selections: [],
      selected_kind: "",
      selected_index: -1,
    });
    await waitForEngine(page);
    await expectLandmarkColorsAligned(page, ["vessel", "tumour nest"]);

    await setModel(page, {
      landmarks: [landmarks[0]],
    });
    await waitForEngine(page);
    await expectLandmarkColorsAligned(page, ["vessel"]);

    await setModel(page, {
      landmarks: [
        landmarks[1],
        {
          id: "crypt",
          type: "point",
          vertices: [[cx, cy]],
        },
      ],
    });
    await waitForEngine(page);
    await expectLandmarkColorsAligned(page, ["tumour nest", "crypt"]);

    await setModel(page, {
      landmarks: [landmarks[1]!, landmarks[0]!],
    });
    await waitForEngine(page);
    await expectLandmarkColorsAligned(page, ["tumour nest", "vessel"]);
  });

  test("landmark panel swatch matches map stroke (explicit color, reorder)", async ({
    page,
  }) => {
    const [xMin, xMax] = (await getModel(page, "x_bounds")) as [number, number];
    const [yMin, yMax] = (await getModel(page, "y_bounds")) as [number, number];
    const cx = (xMin + xMax) / 2;
    const cy = (yMin + yMax) / 2;
    const explicit = "#e85d04";
    const landmarks = [
      {
        id: "vessel",
        type: "line",
        vertices: [[cx - 100, cy], [cx + 60, cy + 30]],
      },
      {
        id: "custom crypt",
        type: "point",
        color: explicit,
        vertices: [[cx, cy - 40]],
      },
    ];
    await setModel(page, {
      landmarks,
      selections: [],
      selected_kind: "",
      selected_index: -1,
    });
    await waitForEngine(page);
    await expectLandmarkColorsAligned(page, ["vessel", "custom crypt"]);

    await setModel(page, {
      landmarks: [landmarks[1]!, landmarks[0]!],
    });
    await waitForEngine(page);
    await expectLandmarkColorsAligned(page, ["custom crypt", "vessel"]);
    const panelHex = await panelSwatchHex(page, "custom crypt");
    expect(panelHex).toBe(explicit);
  });
});
