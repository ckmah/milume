import { expect, test, type Page } from "@playwright/test";

import { bootLandmarksVolumeHarness, canvasBox, getModel, setModel } from "../helpers";

/**
 * Landmarks over a toy SpatialData (`E2E_HARNESS=landmarks-volume`): Inspect
 * hovers a window square, a click opens the floating cube, a drag pans it, Esc
 * closes it; the Inspect context bar drives the cube. The cube's `data-*`
 * mirrors are read from its `.volume-cube__view` inside the Cube dialog.
 *
 * The toy table has three cells (labels 1-3) at about (70, 80), (160, 150) and
 * (100, 190) µm, typed type1 / type0 / type1. The Inspect square is 160 screen
 * px, so its µm size follows zoom: tests read it from `inspect_size_um`. At the
 * fitted zoom a square at the canvas centre (~(115, 135)) holds none of them.
 */
const cubeWindow = (page: Page) => page.getByRole("dialog", { name: "Cube" });
const preview = (page: Page) => page.getByTestId("inspect-preview");
const cutOf = async (page: Page) => (await getModel(page, "volume_cut")) as number[];

/**
 * After ten arrow presses on a cut slider: how far `volume_cut[i]` sits inside
 * the window edge `edge`. About 10 µm: the slider snaps to a 1 µm grid, and the
 * square is rarely a whole number of µm.
 */
async function cutTrim(page: Page, i: number, edge: number) {
  const trim = async () => Math.abs((await cutOf(page))[i]! - edge);
  await expect.poll(trim).toBeGreaterThan(9);
  const t = await trim();
  expect(t).toBeLessThan(11);
  return t;
}

type Box = { x: number; y: number; width: number; height: number };
async function dragOnMap(page: Page, box: Box, from: [number, number], to: [number, number]) {
  await page.mouse.move(box.x + box.width * from[0], box.y + box.height * from[1]);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * to[0], box.y + box.height * to[1], { steps: 3 });
  await page.mouse.up();
}

/** The canvas point over a map point (µm), from the engine's orthographic view state. */
async function screenAt(page: Page, box: Box, [x, y]: [number, number]) {
  const vs = await page.evaluate(() => (window as any).__landmarksEngine.getViewState());
  const k = 2 ** vs.zoom;
  return { x: box.x + box.width / 2 + (x - vs.target[0]) * k, y: box.y + box.height / 2 + (y - vs.target[1]) * k };
}

/** Click in Inspect at the canvas centre, or at map point `at` (µm) after zooming out `zoomOut` steps. */
async function openCubeAtCentre(page: Page, { zoomOut = 0, at }: { zoomOut?: number; at?: [number, number] } = {}) {
  await page.getByRole("radio", { name: "Inspect", exact: true }).click();
  if (zoomOut) await page.evaluate((d) => (window as any).__landmarksEngine.zoomBy(-d, { animate: false }), zoomOut);
  const box = await canvasBox(page);
  const p = at ? await screenAt(page, box, at) : { x: box.x + box.width * 0.5, y: box.y + box.height * 0.5 };
  await page.mouse.click(p.x, p.y);
  await expect(cubeWindow(page)).toBeVisible();
  return box;
}

test.describe("Landmarks inspect cube", () => {
  test.beforeEach(async ({ page }) => bootLandmarksVolumeHarness(page));

  test("hover shows the window square without model writes; click opens the cube", async ({ page }) => {
    await page.getByRole("radio", { name: "Inspect", exact: true }).click();
    const box = await canvasBox(page);
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
    const overlay = await page.evaluate(() => (window as any).__landmarksEngine.getInspectOverlay());
    expect(overlay.hover).not.toBeNull();
    expect(overlay.placed).toBeNull();
    expect(await getModel(page, "inspect_cx")).toBeNull();
    await expect(cubeWindow(page)).toHaveCount(0);

    await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.5);
    await expect(cubeWindow(page)).toBeVisible();
    await expect(cubeWindow(page).getByText(/Cube · [\d.]+ µm/)).toBeVisible();
    await expect(cubeWindow(page).locator(".volume-cube__view")).toHaveAttribute("data-channels", /1|2/);
    expect(Number(await getModel(page, "inspect_cx"))).toBeGreaterThan(0);
    expect((await page.evaluate(() => (window as any).__landmarksEngine.getInspectOverlay())).placed).not.toBeNull();

    await cubeWindow(page).getByRole("button", { name: "Close cube" }).click();
    await expect(cubeWindow(page)).toHaveCount(0);
  });

  test("the square's µm size follows zoom", async ({ page }) => {
    await page.getByRole("radio", { name: "Inspect", exact: true }).click();
    await page.evaluate(() => {
      const seen: any[] = [];
      (window as any).__inspectEvents = seen;
      (window as any).__landmarksEngine.subscribeInspect((e: any) => seen.push(e));
    });
    const events = () => page.evaluate(() => (window as any).__inspectEvents as any[]);
    const box = await canvasBox(page);
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
    const overlay = () => page.evaluate(() => (window as any).__landmarksEngine.getInspectOverlay());
    const size0 = (await overlay()).sizeUm as number;
    await page.evaluate(() => (window as any).__landmarksEngine.zoomBy(-1, { animate: false }));
    await expect.poll(async () => (await overlay()).sizeUm as number).toBeCloseTo(size0 * 2, 3);
    // The preview hears the hover, and the new size on zoom; Esc ends the hover.
    const hovers = (await events()).filter((e) => e.type === "hover");
    expect(hovers[0].sizeUm).toBeCloseTo(size0, 6);
    expect(hovers.at(-1).sizeUm).toBeCloseTo(size0 * 2, 6);
    await page.keyboard.press("Escape");
    expect((await events()).at(-2)).toEqual({ type: "hover-end" });
  });

  test("a click commits an inspect selection of the points in the square", async ({ page }) => {
    await openCubeAtCentre(page);
    const selections = (await getModel(page, "selections")) as any[];
    expect(selections).toHaveLength(1);
    const sel = selections[0];
    expect(sel.type).toBe("inspect");
    const size = Number(await getModel(page, "inspect_size_um"));
    expect(sel.window.size_um).toBeCloseTo(size, 6);
    const inside = await page.evaluate((w) => {
      const pts = (window as any).__landmarksEngine.getPoints() as [number, number][];
      return pts.flatMap((p, i) =>
        Math.abs(p[0] - w.cx) <= w.size_um / 2 && Math.abs(p[1] - w.cy) <= w.size_um / 2 ? [i] : [],
      );
    }, sel.window);
    expect([...sel.point_indices].sort()).toEqual(inside.sort());
    expect(await getModel(page, "selected_kind")).toBe("selection");
    expect(await getModel(page, "selected_index")).toBe(0);
  });

  test("dragging the focused square moves its entry; a press elsewhere adds one", async ({ page }) => {
    const box = await openCubeAtCentre(page);
    const first = ((await getModel(page, "selections")) as any[])[0];
    await dragOnMap(page, box, [0.5, 0.5], [0.53, 0.5]);
    await expect
      .poll(async () => ((await getModel(page, "selections")) as any[])[0].window.cx)
      .toBeGreaterThan(first.window.cx);
    expect((await getModel(page, "selections")) as any[]).toHaveLength(1);
    await page.mouse.click(box.x + box.width * 0.15, box.y + box.height * 0.2);
    await expect.poll(async () => ((await getModel(page, "selections")) as any[]).length).toBe(2);
    expect(await getModel(page, "selected_index")).toBe(1);
  });

  test("an off-centre drag moves the entry by the cursor delta, keeping its id, size and cut", async ({ page }) => {
    const box = await openCubeAtCentre(page);
    await page.getByTestId("context-inspect-toolbar").getByRole("button", { name: "Cuts" }).click();
    const zHi = page.getByRole("slider", { name: "Z cut" }).nth(1);
    await zHi.focus();
    for (let i = 0; i < 10; i++) await page.keyboard.press("ArrowLeft");
    const entry = async () => ((await getModel(page, "selections")) as any[])[0];
    await expect.poll(async () => (await entry()).window.cut[5]).toBe(54);
    const before = await entry();
    const w = before.window;
    const k = 2 ** (await page.evaluate(() => (window as any).__landmarksEngine.getViewState().zoom as number));
    // Press a quarter of the square right and a fifth down from its centre.
    const at = await screenAt(page, box, [w.cx + w.size_um / 4, w.cy + w.size_um / 5]);
    const from = { x: Math.round(at.x), y: Math.round(at.y) };
    const to = { x: from.x + 36, y: from.y + 18 };
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    // No jump on press: the square keeps its centre.
    expect(Number(await getModel(page, "inspect_cx"))).toBeCloseTo(w.cx, 6);
    expect(Number(await getModel(page, "inspect_cy"))).toBeCloseTo(w.cy, 6);
    await page.mouse.move(to.x, to.y, { steps: 4 });
    await page.mouse.up();
    await expect.poll(async () => (await entry()).window.cx).toBeCloseTo(w.cx + (to.x - from.x) / k, 3);
    const after = await entry();
    expect(after.window.cy).toBeCloseTo(w.cy + (to.y - from.y) / k, 3);
    expect((await getModel(page, "selections")) as any[]).toHaveLength(1);
    expect(after.id).toBe(before.id);
    expect(after.window.size_um).toBe(w.size_um);
    // The cut settles in the moved window: a Z-only cut is the same absolute cut.
    await page.waitForTimeout(600); // past the settle commit
    expect((await entry()).window.cut).toEqual(w.cut);
  });

  test("after zooming, a press inside the old square adds a new entry at the new size", async ({ page }) => {
    const box = await openCubeAtCentre(page);
    const first = ((await getModel(page, "selections")) as any[])[0];
    await page.evaluate(() => (window as any).__landmarksEngine.zoomBy(2, { animate: false }));
    await expect
      .poll(async () => (await page.evaluate(() => (window as any).__landmarksEngine.getInspectOverlay())).sizeUm)
      .toBeCloseTo(first.window.size_um / 4, 3);
    const p = await screenAt(page, box, [first.window.cx + first.window.size_um / 8, first.window.cy]);
    await page.mouse.click(p.x, p.y);
    await expect.poll(async () => ((await getModel(page, "selections")) as any[]).length).toBe(2);
    const [kept, added] = (await getModel(page, "selections")) as any[];
    expect([kept.window.cx, kept.window.cy, kept.window.size_um]).toEqual([
      first.window.cx,
      first.window.cy,
      first.window.size_um,
    ]);
    expect(added.window.size_um).toBeCloseTo(first.window.size_um / 4, 3);
    expect(await getModel(page, "selected_index")).toBe(1);
  });

  test("a release over the dock still commits; Esc mid-press commits nothing", async ({ page }) => {
    const box = await openCubeAtCentre(page);
    const sels = async () => (await getModel(page, "selections")) as any[];
    const first = (await sels())[0];
    const dock = (await cubeWindow(page).boundingBox())!;
    const overDock = { x: dock.x + dock.width / 2, y: dock.y + 12 }; // its title bar
    // Move: press on the focused square, release over the dock.
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
    await page.mouse.down();
    await page.mouse.move(overDock.x, overDock.y, { steps: 6 });
    await page.mouse.up();
    await expect.poll(async () => (await sels())[0].window.cx).not.toBeCloseTo(first.window.cx, 1);
    expect((await sels())[0].window.cx).toBeCloseTo(Number(await getModel(page, "inspect_cx")), 6);
    expect(await sels()).toHaveLength(1);

    // New: press elsewhere on the map, release over the dock.
    await page.mouse.move(box.x + box.width * 0.15, box.y + box.height * 0.3);
    await page.mouse.down();
    await page.mouse.move(overDock.x, overDock.y, { steps: 6 });
    await page.mouse.up();
    await expect.poll(async () => (await sels()).length).toBe(2);
    expect((await sels())[1].window.cx).toBeCloseTo(Number(await getModel(page, "inspect_cx")), 6);

    // Esc between press and release: no entry, and later moves drag nothing.
    await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.7);
    await page.mouse.down();
    await page.keyboard.press("Escape");
    const cx = Number(await getModel(page, "inspect_cx"));
    await page.mouse.move(box.x + box.width * 0.25, box.y + box.height * 0.7, { steps: 3 });
    await page.mouse.up();
    await page.waitForTimeout(200);
    expect(await sels()).toHaveLength(2);
    expect(Number(await getModel(page, "inspect_cx"))).toBe(cx);
  });

  test("drag pans the cube; Esc closes it", async ({ page }) => {
    const box = await openCubeAtCentre(page);
    const view = cubeWindow(page).locator(".volume-cube__view");
    await expect(view).toHaveAttribute("data-pan", "0,0");
    await view.evaluate((el) => {
      const seen: string[] = [];
      (window as any).__pans = seen;
      new MutationObserver(() => seen.push(el.getAttribute("data-pan") ?? "")).observe(el, {
        attributes: true,
        attributeFilter: ["data-pan"],
      });
    });
    const cx0 = Number(await getModel(page, "inspect_cx"));
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.56, box.y + box.height * 0.5, { steps: 4 });
    await page.mouse.up();
    await expect.poll(async () => Number(await getModel(page, "inspect_cx"))).toBeGreaterThan(cx0);
    // The loaded volume slides under the frame, then the refetch lands at the new window.
    await expect(view).toHaveAttribute("data-pan", "0,0");
    expect((await page.evaluate(() => (window as any).__pans)).some((p: string) => p !== "0,0")).toBe(true);

    await page.keyboard.press("Escape");
    await expect(cubeWindow(page)).toHaveCount(0);
    expect((await page.evaluate(() => (window as any).__landmarksEngine.getInspectOverlay())).hover).toBeNull();
  });

  test("a quick drag saves the final window position on release", async ({ page }) => {
    const box = await openCubeAtCentre(page);
    const cx0 = Number(await getModel(page, "inspect_cx"));
    // Record inspect_cx as saved (change events fire on save_changes only).
    await page.evaluate(() => {
      const model = (window as any).__landmarksModel;
      model.on("change:inspect_cx", () => ((window as any).__savedCx = model.get("inspect_cx")));
    });
    // Press, move, release in one task: the move lands inside the 40 ms save throttle.
    await page.evaluate((b) => {
      const canvas = document.querySelector("canvas.landmarks__webgl")!;
      const at = (type: string, fx: number, buttons: number) =>
        canvas.dispatchEvent(
          new MouseEvent(type, {
            bubbles: true,
            button: 0,
            buttons,
            clientX: b.x + b.width * fx,
            clientY: b.y + b.height * 0.5,
          }),
        );
      at("mousedown", 0.5, 1);
      at("mousemove", 0.6, 1);
      at("mouseup", 0.6, 0);
    }, box);
    const cx = Number(await getModel(page, "inspect_cx"));
    expect(cx).toBeGreaterThan(cx0);
    expect(await page.evaluate(() => (window as any).__savedCx)).toBe(cx);
  });

  test("inspect toolbar: presets, MIP, palette, alpha/gamma, committed Z cut", async ({ page }) => {
    await openCubeAtCentre(page);
    const bar = page.getByTestId("context-inspect-toolbar");
    const view = cubeWindow(page).locator(".volume-cube__view");
    await expect(view).toHaveAttribute("data-channels", "1");

    await bar.getByRole("radio", { name: "Top view" }).click();
    await expect(bar.getByRole("radio", { name: "Top view" })).toHaveAttribute("aria-checked", "true");
    await bar.getByRole("radio", { name: "Oblique view" }).click();
    await expect(bar.getByRole("radio", { name: "Oblique view" })).toHaveAttribute("aria-checked", "true");

    await bar.getByRole("radio", { name: "Maximum intensity" }).click();
    await expect(view).toHaveAttribute("data-render", "mip");

    await bar.getByRole("button", { name: "Palette" }).click();
    await page.getByRole("menuitemradio", { name: "viridis" }).click();
    await expect(view).toHaveAttribute("data-palette", "viridis");

    await bar.getByRole("button", { name: "Image", exact: true }).click();
    await expect(view).toHaveAttribute("data-image-gamma", "1");
    const gamma = page.getByRole("slider", { name: "Image gamma" });
    await gamma.focus();
    await page.keyboard.press("ArrowRight");
    await expect(view).not.toHaveAttribute("data-image-gamma", "1");
    const alpha = page.getByRole("slider", { name: "Image alpha" });
    await alpha.focus();
    await page.keyboard.press("ArrowLeft");
    await expect(alpha).toHaveAttribute("aria-valuenow", "0.95");
    // Uniforms only: no labels fetched, same single image channel.
    await expect(view).toHaveAttribute("data-channels", "1");

    await bar.getByRole("button", { name: "Cuts" }).click();
    await expect(page.getByRole("slider", { name: "Image gamma" })).toHaveCount(0);
    const zHi = page.getByRole("slider", { name: "Z cut" }).nth(1);
    await expect(zHi).toHaveAttribute("aria-valuenow", "64");
    await zHi.focus();
    for (let i = 0; i < 10; i++) await page.keyboard.press("ArrowLeft");
    await expect.poll(async () => ((await getModel(page, "volume_cut")) as number[])[5]).toBe(54);
  });

  test("partial X and Y cuts keep their place in a moved window; open edges stay open", async ({ page }) => {
    const box = await openCubeAtCentre(page);
    await page.getByTestId("context-inspect-toolbar").getByRole("button", { name: "Cuts" }).click();

    // X: trim the high edge, then move the window right.
    const xHi = page.getByRole("slider", { name: "X cut" }).nth(1);
    await xHi.focus();
    for (let i = 0; i < 10; i++) await page.keyboard.press("ArrowLeft");
    const cx0 = Number(await getModel(page, "inspect_cx"));
    const size = Number(await getModel(page, "inspect_size_um"));
    const trim = await cutTrim(page, 1, cx0 + size / 2);
    // The untouched low edge is open: written as the volume's edge, not the window's.
    expect(await cutOf(page)).toEqual([0, cx0 + size / 2 - trim, 0, 256, 0, 64].map((v) => expect.closeTo(v, 3)));

    await dragOnMap(page, box, [0.5, 0.5], [0.55, 0.5]);
    await expect.poll(async () => Number(await getModel(page, "inspect_cx"))).toBeGreaterThan(cx0);
    const cx1 = Number(await getModel(page, "inspect_cx"));
    await expect.poll(async () => (await cutOf(page))[1]).toBeCloseTo(cx1 + size / 2 - trim, 3);
    expect((await cutOf(page))[0]).toBe(0);
    // The slider still shows the cut from the new window's low edge.
    const xLo = page.getByRole("slider", { name: "X cut" }).nth(0);
    expect(Number(await xLo.getAttribute("aria-valuenow"))).toBeCloseTo(cx1 - size / 2, 3);
    expect(Number(await xLo.getAttribute("aria-valuemin"))).toBeCloseTo(cx1 - size / 2, 3);

    // Y: trim the low edge, then move the window vertically.
    const yLo = page.getByRole("slider", { name: "Y cut" }).nth(0);
    await yLo.focus();
    for (let i = 0; i < 10; i++) await page.keyboard.press("ArrowRight");
    const cy0 = Number(await getModel(page, "inspect_cy"));
    const yTrim = await cutTrim(page, 2, cy0 - size / 2);
    expect((await cutOf(page))[3]).toBe(256);

    await dragOnMap(page, box, [0.5, 0.5], [0.5, 0.44]);
    await expect.poll(async () => Number(await getModel(page, "inspect_cy"))).not.toBeCloseTo(cy0, 1);
    const cy1 = Number(await getModel(page, "inspect_cy"));
    await expect.poll(async () => (await cutOf(page))[2]).toBeCloseTo(cy1 - size / 2 + yTrim, 3);
    expect((await cutOf(page))[3]).toBe(256);
  });

  test("Python's inspect and volume_cut writes are followed, never written back", async ({ page }) => {
    await openCubeAtCentre(page);
    await page.getByTestId("context-inspect-toolbar").getByRole("button", { name: "Cuts" }).click();
    const x = page.getByRole("slider", { name: "X cut" });
    await x.nth(1).focus();
    for (let i = 0; i < 10; i++) await page.keyboard.press("ArrowLeft");
    const cx0 = Number(await getModel(page, "inspect_cx"));
    const size = Number(await getModel(page, "inspect_size_um"));
    await cutTrim(page, 1, cx0 + size / 2);
    const committed = await cutOf(page);

    // Python moves the window: the cut stays in place in it, no volume_cut write.
    await setModel(page, { inspect_cx: cx0 + 20 });
    await expect.poll(async () => Number(await x.nth(1).getAttribute("aria-valuenow"))).toBeCloseTo(committed[1]! + 20, 3);
    await page.waitForTimeout(600); // past the settle commit: nothing may be written back
    expect(await cutOf(page)).toEqual(committed);

    // Python sets a cut: adopted (X open again), and not echoed.
    await setModel(page, { volume_cut: [0, 256, 0, 256, 10, 40] });
    const z = page.getByRole("slider", { name: "Z cut" });
    await expect(z.nth(0)).toHaveAttribute("aria-valuenow", "10");
    await expect(z.nth(1)).toHaveAttribute("aria-valuenow", "40");
    expect(await x.nth(1).getAttribute("aria-valuenow")).toBe(await x.nth(1).getAttribute("aria-valuemax"));
    await page.waitForTimeout(600); // past the settle commit: nothing may be written back
    expect(await cutOf(page)).toEqual([0, 256, 0, 256, 10, 40]);

    // Python clears the cut: Z is open, shown as the stack's edges (not ±Infinity).
    await setModel(page, { volume_cut: [] });
    await expect(z.nth(0)).toHaveAttribute("aria-valuenow", "0");
    await expect(z.nth(1)).toHaveAttribute("aria-valuenow", "64");
    const cuts = page.getByTestId("context-cube-cuts");
    await expect(cuts).toContainText("0–64 µm");
    await expect(cuts).not.toContainText("Infinity");
  });

  test("a Z-only cut leaves X and Y whole for any window, edge windows too", async ({ page }) => {
    const box = await openCubeAtCentre(page);
    await page.getByTestId("context-inspect-toolbar").getByRole("button", { name: "Cuts" }).click();
    const zHi = page.getByRole("slider", { name: "Z cut" }).nth(1);
    await zHi.focus();
    for (let i = 0; i < 10; i++) await page.keyboard.press("ArrowLeft");
    await expect.poll(async () => cutOf(page)).toEqual([0, 256, 0, 256, 0, 54]);

    // Zoom out so a click lands a window that the volume's left edge clamps.
    const zoom = () => page.evaluate(() => (window as any).__landmarksEngine.getViewState().zoom as number);
    const zoom0 = await zoom();
    await page.evaluate(() => (window as any).__landmarksEngine.zoomBy(-2, { animate: false }));
    await expect.poll(zoom).toBeLessThan(zoom0);
    await page.mouse.click(box.x + box.width * 0.25, box.y + box.height * 0.5);
    await expect.poll(async () => Number(await getModel(page, "inspect_cx"))).toBeLessThan(50);
    await page.waitForTimeout(600); // past the settle commit
    expect(await cutOf(page)).toEqual([0, 256, 0, 256, 0, 54]);

    const cx = Number(await getModel(page, "inspect_cx"));
    const size = Number(await getModel(page, "inspect_size_um"));
    const x = page.getByRole("slider", { name: "X cut" });
    await expect(x.nth(0)).toHaveAttribute("aria-valuemin", "0");
    await expect(x.nth(0)).toHaveAttribute("aria-valuenow", "0");
    expect(Number(await x.nth(1).getAttribute("aria-valuenow"))).toBeCloseTo(cx + size / 2, 3);
    for (const i of [0, 1]) {
      const y = page.getByRole("slider", { name: "Y cut" }).nth(i);
      expect(await y.getAttribute("aria-valuenow")).toBe(await y.getAttribute(i ? "aria-valuemax" : "aria-valuemin"));
    }
    await expect(page.getByRole("slider", { name: "Z cut" }).nth(1)).toHaveAttribute("aria-valuenow", "54");
  });

  test("the cube stays open after switching tool; Esc from its chrome closes it", async ({ page }) => {
    const box = await openCubeAtCentre(page);
    await page.getByRole("radio", { name: "Select", exact: true }).click();
    await expect(cubeWindow(page)).toBeVisible();
    await expect(page.getByTestId("context-inspect-toolbar")).toHaveCount(0);
    expect((await page.evaluate(() => (window as any).__landmarksEngine.getInspectOverlay())).placed).not.toBeNull();

    // Esc with focus in the Inspect toolbar.
    await page.getByRole("radio", { name: "Inspect", exact: true }).click();
    await page.getByTestId("context-inspect-toolbar").getByRole("radio", { name: "Top view" }).click();
    await page.keyboard.press("Escape");
    await expect(cubeWindow(page)).toHaveCount(0);

    // Esc after clicking into the cube window.
    await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.5);
    await expect(cubeWindow(page)).toBeVisible();
    await cubeWindow(page).getByText(/Cube · [\d.]+ µm/).click();
    await page.keyboard.press("Escape");
    await expect(cubeWindow(page)).toHaveCount(0);
  });

  test("Inspect hides both side panels; leaving restores them as they were", async ({ page }) => {
    const left = page.locator(".landmarks__chrome-dock--left");
    const right = page.locator(".landmarks__chrome-dock--right");
    await expect(left).toHaveAttribute("data-collapsed", "false");
    await expect(right).toHaveAttribute("data-collapsed", "false");

    await page.getByRole("radio", { name: "Inspect", exact: true }).click();
    await expect(left).toHaveAttribute("data-collapsed", "true");
    await expect(right).toHaveAttribute("data-collapsed", "true");
    // Peek tabs stay, so either panel can come back mid-Inspect.
    await expect(page.getByRole("button", { name: "Show left panel" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Show right panel" })).toBeVisible();

    await page.getByRole("radio", { name: "Select", exact: true }).click();
    await expect(left).toHaveAttribute("data-collapsed", "false");
    await expect(right).toHaveAttribute("data-collapsed", "false");

    // A panel reopened during Inspect stays open until Inspect ends; leaving
    // restores the pre-Inspect state (right was collapsed before).
    await page.getByRole("button", { name: "Collapse right panel" }).click();
    await expect(right).toHaveAttribute("data-collapsed", "true");
    await page.getByRole("radio", { name: "Inspect", exact: true }).click();
    await expect(left).toHaveAttribute("data-collapsed", "true");
    await page.getByRole("button", { name: "Show left panel" }).click();
    await expect(left).toHaveAttribute("data-collapsed", "false");
    await page.getByRole("radio", { name: "Move", exact: true }).click();
    await expect.poll(() => getModel(page, "mode")).toBe("move");
    await expect(left).toHaveAttribute("data-collapsed", "false");
    await expect(right).toHaveAttribute("data-collapsed", "true");
  });

  test("highlight follows focus: everything, a category, a Selection", async ({ page }) => {
    // One step out, a square between cells 2 and 3 reaches both: type0 and type1.
    await openCubeAtCentre(page, { zoomOut: 1, at: [130, 170] });
    const bar = page.getByTestId("context-inspect-toolbar");
    await bar.getByRole("switch", { name: "Labels" }).click();
    const view = cubeWindow(page).locator(".volume-cube__view");
    await expect(view).toHaveAttribute("data-labels", "on");
    await expect(view).toHaveAttribute("data-channels", "2");
    // The click focused its new inspect Selection; clear focus first.
    await setModel(page, { selected_kind: "", selected_index: -1 });
    // Nothing focused: every cell in the window, by category (type1 and type0).
    await expect(view).toHaveAttribute("data-highlight", "2");

    // A category: only its cells (category 0 is type1, cells 1 and 3).
    await setModel(page, { selected_kind: "type", selected_index: 0 });
    await expect(view).toHaveAttribute("data-highlight", "1");

    // A Selection: its cells by category (cell 2 only, type0). The inspect
    // Selection stays (removing the last one closes the dock).
    const inspect = (await getModel(page, "selections")) as any[];
    await setModel(page, {
      selections: [...inspect, { id: "sel-1", type: "polygon", point_indices: [1] }],
      selected_kind: "selection",
      selected_index: inspect.length,
    });
    await expect(view).toHaveAttribute("data-highlight", "1");

    await setModel(page, { selected_kind: "", selected_index: -1 });
    await expect(view).toHaveAttribute("data-highlight", "2");
  });

  test("the dock shows the coarse level first, then refines", async ({ page }) => {
    // Small budgets make the toy pyramid pick different levels (see main.tsx ?budgets).
    await page.goto("/?budgets=20000,300000", { waitUntil: "networkidle" });
    await page.waitForFunction(() => Boolean((window as any).__landmarksEngine));
    await openCubeAtCentre(page);
    const view = cubeWindow(page).locator(".volume-cube__view");
    const levels: string[] = [];
    await view.evaluate((el) => {
      const seen: string[] = [];
      (window as any).__levels = seen;
      new MutationObserver(() => seen.push(el.getAttribute("data-level") ?? "")).observe(el, {
        attributes: true,
        attributeFilter: ["data-level"],
      });
    });
    await expect(view).toHaveAttribute("data-refining", "false");
    levels.push(...(await page.evaluate(() => (window as any).__levels as string[])));
    const shown = levels.filter((l) => l !== "-1").map(Number);
    expect(shown.length).toBeGreaterThanOrEqual(2);
    expect(shown[0]).toBeGreaterThan(shown[shown.length - 1]!);
  });

  test("the hosted cube has no category legend", async ({ page }) => {
    // On cell 2: the new inspect Selection (focused) holds it.
    await openCubeAtCentre(page, { at: [160, 150] });
    await page.getByTestId("context-inspect-toolbar").getByRole("switch", { name: "Labels" }).click();
    const view = cubeWindow(page).locator(".volume-cube__view");
    await expect(view).toHaveAttribute("data-labels", "on");
    await expect(view).not.toHaveAttribute("data-highlight", "0");
    await expect(cubeWindow(page).getByLabel("Highlighted cells")).toHaveCount(0);
  });

  test("reopening the same window reads every chunk from the cache", async ({ page }) => {
    const box = await openCubeAtCentre(page);
    const view = cubeWindow(page).locator(".volume-cube__view");
    await expect(view).toHaveAttribute("data-refining", "false");
    await cubeWindow(page).getByRole("button", { name: "Close cube" }).click();
    const chunkRequests: string[] = [];
    page.on("request", (r) => {
      if (/\/s\d+\/c\//.test(r.url())) chunkRequests.push(r.url());
    });
    await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.5);
    await expect(view).toHaveAttribute("data-refining", "false");
    expect(chunkRequests).toEqual([]);
  });

  test("history chips restore each committed window and cut", async ({ page }) => {
    const box = await openCubeAtCentre(page);
    await page.getByTestId("context-inspect-toolbar").getByRole("button", { name: "Cuts" }).click();
    const zHi = page.getByRole("slider", { name: "Z cut" }).nth(1);
    await zHi.focus();
    for (let i = 0; i < 10; i++) await page.keyboard.press("ArrowLeft");
    await expect.poll(async () => ((await getModel(page, "selections")) as any[])[0].window.cut[5]).toBe(54);
    const first = ((await getModel(page, "selections")) as any[])[0];

    await page.mouse.click(box.x + box.width * 0.2, box.y + box.height * 0.25);
    const strip = cubeWindow(page).getByLabel("Inspect history");
    await expect(strip.getByRole("button")).toHaveCount(2);
    await expect(strip.getByRole("button", { name: "Inspect 2" })).toHaveAttribute("aria-pressed", "true");

    await strip.getByRole("button", { name: "Inspect 1" }).click();
    await expect.poll(async () => Number(await getModel(page, "inspect_cx"))).toBeCloseTo(first.window.cx, 3);
    await expect.poll(async () => ((await getModel(page, "volume_cut")) as number[])[5]).toBe(54);
    // The cut never changed membership.
    expect(((await getModel(page, "selections")) as any[])[0].point_indices).toEqual(first.point_indices);
  });

  test("deleting an inspect selection removes its chip; the last one closes the dock", async ({ page }) => {
    await openCubeAtCentre(page);
    const strip = cubeWindow(page).getByLabel("Inspect history");
    await expect(strip.getByRole("button")).toHaveCount(1);
    // Once refined, the chip carries a snapshot of the cube.
    await expect(strip.getByRole("button", { name: "Inspect 1" }).locator("img")).toHaveCount(1);
    await setModel(page, { selections: [], selected_kind: "", selected_index: -1 });
    await expect(cubeWindow(page)).toHaveCount(0);
  });

  test("a chip's snapshot follows its entry's window: moved, or a reused id", async ({ page }) => {
    const box = await openCubeAtCentre(page);
    const chip = cubeWindow(page).getByLabel("Inspect history").getByRole("button", { name: "Inspect 1" });
    const src = () => chip.locator("img").getAttribute("src");
    await expect(chip.locator("img")).toHaveCount(1);
    await page.waitForTimeout(1200); // past the snapshot's settle replacement (SNAPSHOT_SETTLE_MS)
    const before = await src();
    const id = ((await getModel(page, "selections")) as any[])[0].id;

    // A move gesture on the focused square: the chip re-snapshots at the new window.
    await dragOnMap(page, box, [0.5, 0.5], [0.62, 0.58]);
    await expect.poll(src).not.toBe(before);
    const moved = await src();

    // Delete it, then commit a new entry elsewhere under the same (reused) id.
    await setModel(page, { selections: [], selected_kind: "", selected_index: -1 });
    await expect(cubeWindow(page)).toHaveCount(0);
    await page.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.3);
    expect(((await getModel(page, "selections")) as any[])[0].id).toBe(id);
    await expect(chip.locator("img")).toHaveCount(1);
    await expect.poll(src).not.toBe(moved);
  });

  test("hover shows a live coarse preview that slides without refetching", async ({ page }) => {
    await page.goto("/?budgets=20000,300000", { waitUntil: "networkidle" });
    await page.waitForFunction(() => Boolean((window as any).__landmarksEngine));
    await page.getByRole("radio", { name: "Inspect", exact: true }).click();
    const box = await canvasBox(page);
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
    const view = preview(page).locator(".volume-cube__view");
    await expect(preview(page)).toBeVisible();
    await expect(view).not.toHaveAttribute("data-level", "-1");
    const region = await preview(page).getAttribute("data-region");
    // The square sits inside a larger loaded region, so it is panned from the start.
    const pan = await view.getAttribute("data-pan");

    const chunkRequests: string[] = [];
    page.on("request", (r) => {
      if (/\/s\d+\/c\//.test(r.url())) chunkRequests.push(r.url());
    });
    await page.mouse.move(box.x + box.width * 0.51, box.y + box.height * 0.5, { steps: 4 });
    // The shown region slides under the moved square: a new pan, same region, no fetch.
    await expect(view).not.toHaveAttribute("data-pan", pan!);
    expect(await preview(page).getAttribute("data-region")).toBe(region);
    expect(chunkRequests).toEqual([]);
    await expect(page.getByRole("dialog", { name: "Cube" })).toHaveCount(0);
  });

  test("moving far recentres the preview region; leaving the map hides it", async ({ page }) => {
    await page.goto("/?budgets=20000,300000", { waitUntil: "networkidle" });
    await page.waitForFunction(() => Boolean((window as any).__landmarksEngine));
    await page.getByRole("radio", { name: "Inspect", exact: true }).click();
    const box = await canvasBox(page);
    await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.5);
    await expect(preview(page)).toBeVisible();
    const region = await preview(page).getAttribute("data-region");
    await page.mouse.move(box.x + box.width * 0.75, box.y + box.height * 0.5, { steps: 8 });
    await expect.poll(() => preview(page).getAttribute("data-region")).not.toBe(region);
    await page.mouse.move(box.x - 20, box.y - 20);
    await expect(preview(page)).toBeHidden();
  });

  test("the preview float sits beside the hover square, inside the widget, above the dock", async ({ page }) => {
    await page.getByRole("radio", { name: "Inspect", exact: true }).click();
    await page.evaluate(() => {
      const seen: any[] = [];
      (window as any).__inspectEvents = seen;
      (window as any).__landmarksEngine.subscribeInspect((e: any) => seen.push(e));
    });
    // One step in, the canvas's right edge is still over the volume.
    await page.evaluate(() => (window as any).__landmarksEngine.zoomBy(1, { animate: false }));
    const box = await canvasBox(page);
    const root = (await page.locator(".landmarks").first().boundingBox())!;
    const float = preview(page);
    const right = Math.min(box.x + box.width - 100, (await screenAt(page, box, [240, 128])).x);
    let half = 0;
    for (const x of [box.x + box.width * 0.4, right]) {
      const p = { x, y: box.y + box.height * 0.5 };
      await page.mouse.move(p.x, p.y, { steps: 3 });
      await expect(float).toBeVisible();
      const hover = await page.evaluate(
        () => ((window as any).__inspectEvents as any[]).filter((e) => e.type === "hover").at(-1),
      );
      half = hover.sizePx / 2;
      const clear = async () => {
        const r = (await float.boundingBox())!;
        const apart =
          r.x >= p.x + half || r.x + r.width <= p.x - half || r.y >= p.y + half || r.y + r.height <= p.y - half;
        const inside =
          r.x >= root.x - 0.5 &&
          r.y >= root.y - 0.5 &&
          r.x + r.width <= root.x + root.width + 0.5 &&
          r.y + r.height <= root.y + root.height + 0.5;
        return apart && inside;
      };
      await expect.poll(clear).toBe(true);
    }
    // At the right edge the float flips to the square's left.
    const flipped = (await float.boundingBox())!;
    expect(flipped.x + flipped.width).toBeLessThanOrEqual(right - half);

    // With the dock open the float stacks above it (same layer, later in the DOM) and under the tools.
    await page.mouse.click(box.x + box.width * 0.4, box.y + box.height * 0.5);
    await expect(cubeWindow(page)).toBeVisible();
    const stack = await page.evaluate(() => {
      const z = (el: Element) => Number(getComputedStyle(el).zIndex);
      const dock = document.querySelector(".landmarks__cube-window")!;
      const f = document.querySelector('[data-testid="inspect-preview"]')!;
      const tools = document.querySelector(".landmarks__chrome-tools")!;
      const after = Boolean(dock.compareDocumentPosition(f) & Node.DOCUMENT_POSITION_FOLLOWING);
      return { dock: z(dock), float: z(f), tools: z(tools), after };
    });
    expect(stack.float > stack.dock || (stack.float === stack.dock && stack.after)).toBe(true);
    expect(stack.float).toBeLessThan(stack.tools);
  });

  test("leaving Inspect hides the preview but keeps its cube for the next hover", async ({ page }) => {
    await page.getByRole("radio", { name: "Inspect", exact: true }).click();
    const box = await canvasBox(page);
    await page.mouse.move(box.x + box.width * 0.4, box.y + box.height * 0.5);
    const view = preview(page).locator(".volume-cube__view");
    await expect(preview(page)).toBeVisible();
    await expect(view).not.toHaveAttribute("data-level", "-1");
    await view.evaluate((el) => ((el as any).__kept = true));

    await page.getByRole("radio", { name: "Select", exact: true }).click();
    await expect(preview(page)).toBeHidden();
    await expect(view).toHaveCount(1);

    await page.getByRole("radio", { name: "Inspect", exact: true }).click();
    await page.mouse.move(box.x + box.width * 0.45, box.y + box.height * 0.5, { steps: 3 });
    await expect(preview(page)).toBeVisible();
    expect(await view.evaluate((el) => Boolean((el as any).__kept))).toBe(true);
  });
});
