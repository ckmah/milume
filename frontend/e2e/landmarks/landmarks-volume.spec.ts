import { expect, test, type Page } from "@playwright/test";

import { bootLandmarksVolumeHarness, canvasBox, getModel, setModel } from "../helpers";

/**
 * Landmarks over a toy SpatialData (`E2E_HARNESS=landmarks-volume`): Inspect
 * hovers a window square, a click opens the floating cube, a drag pans it, Esc
 * closes it; the Inspect context bar drives the cube. The cube's `data-*`
 * mirrors are read from its `.volume-cube__view` inside the Cube dialog.
 *
 * The toy table has three cells (labels 1-3) at about (70, 80), (160, 150) and
 * (100, 190) µm, typed type1 / type0 / type1. The map fits them, so a 100 µm
 * window at the canvas centre (~(115, 135)) covers all three: both types.
 */
const cubeWindow = (page: Page) => page.getByRole("dialog", { name: "Cube" });
const cutOf = async (page: Page) => (await getModel(page, "volume_cut")) as number[];

type Box = { x: number; y: number; width: number; height: number };
async function dragOnMap(page: Page, box: Box, from: [number, number], to: [number, number]) {
  await page.mouse.move(box.x + box.width * from[0], box.y + box.height * from[1]);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * to[0], box.y + box.height * to[1], { steps: 3 });
  await page.mouse.up();
}

async function openCubeAtCentre(page: Page) {
  await page.getByRole("radio", { name: "Inspect", exact: true }).click();
  const box = await canvasBox(page);
  await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.5);
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
    await expect(cubeWindow(page).getByText("Cube · 100 µm")).toBeVisible();
    await expect(cubeWindow(page).locator(".volume-cube__view")).toHaveAttribute("data-channels", /1|2/);
    expect(Number(await getModel(page, "inspect_cx"))).toBeGreaterThan(0);
    expect((await page.evaluate(() => (window as any).__landmarksEngine.getInspectOverlay())).placed).not.toBeNull();

    await cubeWindow(page).getByRole("button", { name: "Close cube" }).click();
    await expect(cubeWindow(page)).toHaveCount(0);
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
    await expect.poll(async () => (await cutOf(page))[1]).toBeCloseTo(cx0 + 40, 3);
    // The untouched low edge is open: written as the volume's edge, not the window's.
    expect(await cutOf(page)).toEqual([0, cx0 + 40, 0, 256, 0, 64].map((v) => expect.closeTo(v, 3)));

    await dragOnMap(page, box, [0.5, 0.5], [0.55, 0.5]);
    await expect.poll(async () => Number(await getModel(page, "inspect_cx"))).toBeGreaterThan(cx0);
    const cx1 = Number(await getModel(page, "inspect_cx"));
    await expect.poll(async () => (await cutOf(page))[1]).toBeCloseTo(cx1 + 40, 3);
    expect((await cutOf(page))[0]).toBe(0);
    // The slider still shows the cut 0-90 µm from the new window's edge.
    const xLo = page.getByRole("slider", { name: "X cut" }).nth(0);
    expect(Number(await xLo.getAttribute("aria-valuenow"))).toBeCloseTo(cx1 - 50, 3);
    expect(Number(await xLo.getAttribute("aria-valuemin"))).toBeCloseTo(cx1 - 50, 3);

    // Y: trim the low edge, then move the window vertically.
    const yLo = page.getByRole("slider", { name: "Y cut" }).nth(0);
    await yLo.focus();
    for (let i = 0; i < 10; i++) await page.keyboard.press("ArrowRight");
    const cy0 = Number(await getModel(page, "inspect_cy"));
    await expect.poll(async () => (await cutOf(page))[2]).toBeCloseTo(cy0 - 40, 3);
    expect((await cutOf(page))[3]).toBe(256);

    await dragOnMap(page, box, [0.5, 0.5], [0.5, 0.44]);
    await expect.poll(async () => Number(await getModel(page, "inspect_cy"))).not.toBeCloseTo(cy0, 1);
    const cy1 = Number(await getModel(page, "inspect_cy"));
    await expect.poll(async () => (await cutOf(page))[2]).toBeCloseTo(cy1 - 40, 3);
    expect((await cutOf(page))[3]).toBe(256);
  });

  test("Python's inspect and volume_cut writes are followed, never written back", async ({ page }) => {
    await openCubeAtCentre(page);
    await page.getByTestId("context-inspect-toolbar").getByRole("button", { name: "Cuts" }).click();
    const x = page.getByRole("slider", { name: "X cut" });
    await x.nth(1).focus();
    for (let i = 0; i < 10; i++) await page.keyboard.press("ArrowLeft");
    const cx0 = Number(await getModel(page, "inspect_cx"));
    await expect.poll(async () => (await cutOf(page))[1]).toBeCloseTo(cx0 + 40, 3);
    const committed = await cutOf(page);

    // Python moves the window: the cut stays in place in it, no volume_cut write.
    await setModel(page, { inspect_cx: cx0 + 20 });
    await expect.poll(async () => Number(await x.nth(1).getAttribute("aria-valuenow"))).toBeCloseTo(cx0 + 60, 3);
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
    const x = page.getByRole("slider", { name: "X cut" });
    await expect(x.nth(0)).toHaveAttribute("aria-valuemin", "0");
    await expect(x.nth(0)).toHaveAttribute("aria-valuenow", "0");
    expect(Number(await x.nth(1).getAttribute("aria-valuenow"))).toBeCloseTo(cx + 50, 3);
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
    await cubeWindow(page).getByText("Cube · 100 µm").click();
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
    await openCubeAtCentre(page);
    const bar = page.getByTestId("context-inspect-toolbar");
    await bar.getByRole("switch", { name: "Labels" }).click();
    const view = cubeWindow(page).locator(".volume-cube__view");
    await expect(view).toHaveAttribute("data-labels", "on");
    await expect(view).toHaveAttribute("data-channels", "2");
    // Nothing focused: every cell in the window, by category (type1 and type0).
    await expect(view).toHaveAttribute("data-highlight", "2");
    await expect(cubeWindow(page).getByLabel("Highlighted cells").getByText("type0")).toBeVisible();

    // A category: only its cells (category 0 is type1, cells 1 and 3).
    await setModel(page, { selected_kind: "type", selected_index: 0 });
    await expect(view).toHaveAttribute("data-highlight", "1");
    await expect(cubeWindow(page).getByLabel("Highlighted cells").getByText("type0")).toHaveCount(0);

    // A Selection: its cells by category (cell 2 only, type0).
    await setModel(page, {
      selections: [{ id: "sel-1", type: "polygon", point_indices: [1] }],
      selected_kind: "selection",
      selected_index: 0,
    });
    await expect(view).toHaveAttribute("data-highlight", "1");
    await expect(cubeWindow(page).getByLabel("Highlighted cells").getByText("type0")).toBeVisible();

    await setModel(page, { selected_kind: "", selected_index: -1 });
    await expect(view).toHaveAttribute("data-highlight", "2");
  });
});
