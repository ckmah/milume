import { expect, test, type Page } from "@playwright/test";

import {
  bootLandmarksHarness,
  canvasBox,
  clickLandmarkTool,
  getModel,
  setModel,
} from "../helpers";

/**
 * Landmark tool-completeness coverage: point/shape buffers, node editing
 * (drag / insert / delete vertex), undo, reverse/convert, and the
 * buffer→selection promote, driven through the context toolbar and canvas.
 */
test.describe("LandmarksWidget tool completeness", () => {
  test.beforeEach(async ({ page }) => {
    await bootLandmarksHarness(page);
  });

  const landmarks = async (page: Page) => (await getModel(page, "landmarks")) as any[];
  const selections = async (page: Page) => (await getModel(page, "selections")) as any[];

  async function bounds(page: Page) {
    const [xMin, xMax] = (await getModel(page, "x_bounds")) as [number, number];
    const [yMin, yMax] = (await getModel(page, "y_bounds")) as [number, number];
    return { xMin, xMax, yMin, yMax, spanX: xMax - xMin, spanY: yMax - yMin };
  }

  /**
   * Derive the screen<->world mapping for the current (unrotated,
   * axis-aligned) orthographic view. The scale/offset come from the engine's
   * own `getViewportWorldBounds()` (deck.gl `viewport.unproject`, exact — no
   * click round-trip error); a single point placement is only used to
   * disambiguate the y-axis sign, since we don't assume deck.gl's
   * screen/world y orientation.
   */
  async function calibrate(page: Page) {
    const box = await canvasBox(page);
    const [xMin, yMin, xMax, yMax] = (await page.evaluate(() =>
      (window as any).__landmarksEngine.getViewportWorldBounds(),
    )) as [number, number, number, number];

    const before = (await landmarks(page)).length;
    await clickLandmarkTool(page, "Point");
    await expect.poll(() => getModel(page, "mode")).toBe("point");
    const sample = { fx: 0.3, fy: 0.35 };
    await page.mouse.click(box.x + box.width * sample.fx, box.y + box.height * sample.fy);
    await expect.poll(async () => (await landmarks(page)).length).toBe(before + 1);

    const placed = await landmarks(page);
    const [, wy] = placed[placed.length - 1].vertices[0];
    const predictedNoFlip = yMin + sample.fy * (yMax - yMin);
    const predictedFlip = yMax - sample.fy * (yMax - yMin);
    const flipY = Math.abs(wy - predictedFlip) < Math.abs(wy - predictedNoFlip);

    await setModel(page, {
      landmarks: placed.slice(0, before),
      selected_kind: "",
      selected_index: -1,
    });
    await page.getByRole("radio", { name: "Select", exact: true }).click();
    await expect.poll(() => getModel(page, "mode")).toBe("select");
    return {
      worldToScreen: (wx: number, worldY: number) => ({
        x: box.x + ((wx - xMin) / (xMax - xMin)) * box.width,
        y: flipY
          ? box.y + ((yMax - worldY) / (yMax - yMin)) * box.height
          : box.y + ((worldY - yMin) / (yMax - yMin)) * box.height,
      }),
    };
  }

  async function dragBetween(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 6 });
    await page.mouse.up();
  }

  test("point buffer promotes contained points to a selection", async ({
    page,
  }) => {
    await setModel(page, {
      landmarks: [
        {
          id: "seed-point",
          type: "point",
          vertices: [[2650, 320]],
          buffer_width: 80,
          buffer_side: "both",
          line_style: "solid",
          color: "#00e5ff",
        },
      ],
      selected_kind: "landmark",
      selected_index: 0,
      selections: [],
    });

    await page.getByTestId("promote-buffer").click();
    await expect.poll(async () => (await selections(page)).length).toBe(1);
    expect((await selections(page))[0].point_indices.length).toBeGreaterThan(0);
    // The buffer is consumed by the promote.
    expect((await landmarks(page))[0].buffer_width).toBe(0);
  });

  test("shape buffer side (out/in/both) shapes the promoted selection", async ({
    page,
  }) => {
    const { xMin, spanX, yMin, spanY } = await bounds(page);
    const tri = [
      [xMin + spanX * 0.35, yMin + spanY * 0.25],
      [xMin + spanX * 0.55, yMin + spanY * 0.25],
      [xMin + spanX * 0.45, yMin + spanY * 0.45],
    ];

    async function promoteCount(side: string) {
      await setModel(page, {
        landmarks: [
          {
            id: "shape-1",
            type: "shape",
            vertices: tri,
            tension: 0,
            buffer_width: spanX * 0.06,
            buffer_side: side,
            line_style: "solid",
            color: "#ff2d95",
          },
        ],
        selected_kind: "landmark",
        selected_index: 0,
        selections: [],
      });
      await page.getByTestId("promote-buffer").click();
      await expect.poll(async () => (await selections(page)).length).toBe(1);
      return (await selections(page))[0].point_indices.length as number;
    }

    const outCount = await promoteCount("out");
    const inCount = await promoteCount("in");
    const bothCount = await promoteCount("both");

    // "both" spans the full [-width, +width] corridor, so it is a superset of
    // (or equal to) either single-sided corridor for a convex shape.
    expect(bothCount).toBeGreaterThanOrEqual(inCount);
    expect(bothCount).toBeGreaterThanOrEqual(outCount);
    expect(bothCount).toBeGreaterThan(0);
  });

  test("reverse and convert the selected landmark from the context toolbar", async ({
    page,
  }) => {
    await setModel(page, {
      landmarks: [
        {
          id: "lm-line",
          type: "line",
          vertices: [
            [2500, 300],
            [2700, 500],
          ],
          buffer_width: 20,
          buffer_side: "left",
          line_style: "solid",
          color: "#00e5ff",
        },
      ],
      selected_kind: "landmark",
      selected_index: 0,
    });

    await page.getByTestId("context-reverse").click();
    await expect.poll(async () => (await landmarks(page))[0].vertices).toEqual([
      [2700, 500],
      [2500, 300],
    ]);
    // Reversing keeps the buffer on the same side of the path on screen.
    expect((await landmarks(page))[0].buffer_side).toBe("right");

    await page.getByTestId("context-convert-toggle").click();
    await page.getByTestId("context-convert-spline").click();
    await expect.poll(async () => (await landmarks(page))[0].type).toBe("spline");
    expect((await landmarks(page))[0].tension).toBe(0);
  });

  test("Mod+Z undoes the last landmark geometry edit", async ({ page }) => {
    await setModel(page, {
      landmarks: [
        {
          id: "lm-nudge",
          type: "point",
          vertices: [[2650, 320]],
          line_style: "solid",
          color: "#00e5ff",
        },
      ],
      selected_kind: "landmark",
      selected_index: 0,
    });
    const box = await canvasBox(page);
    // Click a spot far from the point landmark to focus the canvas without
    // hitting/dragging it (pointer mode ignores clicks that miss a landmark).
    await page.mouse.click(box.x + box.width * 0.05, box.y + box.height * 0.9);
    await setModel(page, { selected_kind: "landmark", selected_index: 0 });

    const vertex = async () => (await landmarks(page))[0].vertices[0] as [number, number];
    const before = await vertex();
    await page.keyboard.press("ArrowRight");
    await expect.poll(async () => (await vertex())[0]).not.toBeCloseTo(before[0], 5);

    const mod = process.platform === "darwin" ? "Meta" : "Control";
    await page.keyboard.press(`${mod}+z`);
    await expect.poll(async () => (await vertex())[0]).toBeCloseTo(before[0], 5);
    expect((await vertex())[1]).toBeCloseTo(before[1], 5);
  });

  test("node mode: drag a vertex, insert via midpoint, then delete", async ({
    page,
  }) => {
    const { worldToScreen } = await calibrate(page);
    const { xMin, spanX, yMin, spanY } = await bounds(page);
    const v0: [number, number] = [xMin + spanX * 0.3, yMin + spanY * 0.3];
    const v1: [number, number] = [xMin + spanX * 0.7, yMin + spanY * 0.3];

    await setModel(page, {
      landmarks: [
        {
          id: "lm-edit",
          type: "line",
          vertices: [v0, v1],
          line_style: "solid",
          color: "#00e5ff",
        },
      ],
      selected_kind: "landmark",
      selected_index: 0,
    });

    // Node interactions require node mode (select mode never hit-tests vertices).
    await page.getByRole("radio", { name: "Node", exact: true }).click();
    await expect.poll(() => getModel(page, "mode")).toBe("node");

    // Drag the first vertex to a new world position.
    const target: [number, number] = [xMin + spanX * 0.35, yMin + spanY * 0.45];
    await dragBetween(page, worldToScreen(v0[0], v0[1]), worldToScreen(target[0], target[1]));
    await expect.poll(async () => (await landmarks(page))[0].vertices[0][0]).toBeCloseTo(target[0], -1);
    let edited = (await landmarks(page))[0];
    expect(edited.vertices[0][1]).toBeCloseTo(target[1], -1);
    expect(edited.vertices.length).toBe(2);

    // Click the segment midpoint to insert a new vertex.
    const mid = worldToScreen(
      (edited.vertices[0][0] + edited.vertices[1][0]) / 2,
      (edited.vertices[0][1] + edited.vertices[1][1]) / 2,
    );
    await page.mouse.click(mid.x, mid.y);
    await expect.poll(async () => (await landmarks(page))[0].vertices.length).toBe(3);

    // The inserted vertex is active — Delete removes just that vertex.
    await page.keyboard.press("Delete");
    await expect.poll(async () => (await landmarks(page))[0].vertices.length).toBe(2);
    expect((await landmarks(page)).length).toBe(1);

    // Esc clears active node, then leaves node → select; Delete removes landmark.
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    await expect.poll(() => getModel(page, "mode")).toBe("select");
    await setModel(page, { selected_kind: "landmark", selected_index: 0 });
    await page.keyboard.press("Delete");
    await expect.poll(async () => (await landmarks(page)).length).toBe(0);
  });

  test("the legacy `locked` field no longer blocks nudge or drag edits", async ({
    page,
  }) => {
    const { worldToScreen } = await calibrate(page);
    const { xMin, spanX, yMin, spanY } = await bounds(page);
    const v0: [number, number] = [xMin + spanX * 0.3, yMin + spanY * 0.3];
    const v1: [number, number] = [xMin + spanX * 0.7, yMin + spanY * 0.3];

    await setModel(page, {
      landmarks: [
        {
          id: "lm-locked",
          type: "line",
          vertices: [v0, v1],
          locked: true,
          line_style: "solid",
          color: "#00e5ff",
        },
      ],
      selected_kind: "landmark",
      selected_index: 0,
    });
    await page.locator(".landmarks").first().click({ position: { x: 5, y: 5 } });
    await setModel(page, { selected_kind: "landmark", selected_index: 0 });

    const first = async () => (await landmarks(page))[0].vertices[0] as [number, number];
    await page.keyboard.press("ArrowRight");
    await expect.poll(async () => (await first())[0]).not.toBeCloseTo(v0[0], 5);

    const nudged = await first();
    const to: [number, number] = [v0[0] + spanX * 0.1, v0[1] + spanY * 0.1];
    await dragBetween(page, worldToScreen(nudged[0], nudged[1]), worldToScreen(to[0], to[1]));
    await expect.poll(async () => (await first())[0]).toBeCloseTo(to[0], -1);
    expect((await first())[1]).toBeCloseTo(to[1], -1);
  });
});
