import { expect, test, type Locator, type Page } from "@playwright/test";

import { bootLandmarksVolumeHarness, canvasBox, getModel, setModel } from "../helpers";

/**
 * Landmarks over a toy SpatialData (`E2E_HARNESS=landmarks-volume`): Inspect
 * hovers a window square, a click places it and opens the floating cube, a
 * drag moves it, Esc closes it; the Inspect context bar drives the cube. The
 * dock's Save keeps the window as an inspect Selection. The cube's `data-*`
 * mirrors are read from its `.volume-cube__view` inside the Cube dialog.
 *
 * The toy table has three cells (labels 1-3) at about (70, 80), (160, 150) and
 * (100, 190) µm, typed type1 / type0 / type1, in a 256 µm volume. The Inspect
 * window is a fixed 300 µm, so it holds the whole toy volume; tests that need
 * a window moving inside the volume boot with `?window=100` (harness only).
 */
const cubeWindow = (page: Page) => page.getByRole("dialog", { name: "Cube" });
const preview = (page: Page) => page.getByTestId("inspect-preview");
const cutOf = async (page: Page) => (await getModel(page, "volume_cut")) as number[];
const selectionsOf = async (page: Page) => (await getModel(page, "selections")) as any[];
const saveButton = (page: Page) => cubeWindow(page).getByRole("button", { name: "Save window" });
/** Save the live window from the dock's title bar; the new entry's index (it is focused). */
async function save(page: Page) {
  const before = (await selectionsOf(page)).length;
  await saveButton(page).click();
  await expect.poll(async () => (await selectionsOf(page)).length).toBe(before + 1);
  return Number(await getModel(page, "selected_index"));
}
/** Open the Inspect toolbar's one adjustments panel (Image, Cells, Cuts). */
const openAdjust = (page: Page) =>
  page.getByTestId("context-inspect-toolbar").getByRole("button", { name: "Adjust" }).click();

/** Reload the harness with harness-only URL options (`window=<µm>`, `budgets=<preview>,<dock>`). */
async function reloadWith(page: Page, query: string) {
  await page.goto(`/?${query}`, { waitUntil: "networkidle" });
  await page.waitForFunction(() => Boolean((window as any).__landmarksEngine?.getViewState?.()));
}

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

/** Toy category colours (fixture palette): type1 #1f77b4, type0 #ff7f0e. */
const CATEGORY_HUES = { type1: 205, type0: 28 };

/**
 * Pixels that take on a category colour between two screenshots of the same
 * view (`before`, `after`): hue within 15° of the category's, saturated and not
 * dark, and not already that colour before. Counts and mean x, y (px) per
 * category. Comparing the two leaves out the frame's axes and the axis legend.
 */
async function newCategoryPixels(page: Page, before: Buffer, after: Buffer) {
  return page.evaluate(
    async ({ before, after, hues }) => {
      const pixels = async (png: string) => {
        const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${png}`)).blob());
        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(bitmap, 0, 0);
        return ctx.getImageData(0, 0, bitmap.width, bitmap.height);
      };
      const category = (data: Uint8ClampedArray, i: number) => {
        const [r, g, b] = [data[i]!, data[i + 1]!, data[i + 2]!];
        const max = Math.max(r, g, b);
        const d = max - Math.min(r, g, b);
        if (max < 40 || d / max < 0.4) return "";
        let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
        h = (h * 60 + 360) % 360;
        for (const [k, hue] of Object.entries(hues)) if (Math.abs(((h - hue + 540) % 360) - 180) <= 15) return k;
        return "";
      };
      const [was, now] = [await pixels(before), await pixels(after)];
      const out = Object.fromEntries(Object.keys(hues).map((k) => [k, { count: 0, x: 0, y: 0 }])) as Record<
        keyof typeof hues,
        { count: number; x: number; y: number }
      >;
      for (let i = 0; i < now.data.length; i += 4) {
        const k = category(now.data, i) as keyof typeof hues | "";
        if (!k || category(was.data, i) === k) continue;
        out[k].count++;
        out[k].x += (i / 4) % now.width;
        out[k].y += Math.floor(i / 4 / now.width);
      }
      for (const v of Object.values(out)) {
        v.x = v.count ? v.x / v.count : 0;
        v.y = v.count ? v.y / v.count : 0;
      }
      return out;
    },
    { before: before.toString("base64"), after: after.toString("base64"), hues: CATEGORY_HUES },
  );
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
    // A click only places the window: no selection, no history.
    expect(await selectionsOf(page)).toEqual([]);
    await expect(cubeWindow(page).getByLabel("Inspect history")).toHaveCount(0);

    await cubeWindow(page).getByRole("button", { name: "Close cube" }).click();
    await expect(cubeWindow(page)).toHaveCount(0);
  });

  test("the Inspect toolbar shows before a window is placed; cut sliders wait for ranges without a crash", async ({
    page,
  }) => {
    await page.getByRole("radio", { name: "Inspect", exact: true }).click();
    const bar = page.getByTestId("context-inspect-toolbar");
    await expect(bar).toBeVisible();
    await expect(cubeWindow(page)).toHaveCount(0);

    // Cuts need the dock's bounds: a placeholder, not a slider with no range.
    await openAdjust(page);
    const cuts = page.getByTestId("context-cube-cuts");
    await expect(cuts).toContainText("Loading volume");
    await expect(cuts.getByRole("slider")).toHaveCount(0);
    await page.keyboard.press("Escape");

    // Camera, projection, palette and Labels do not need the cube open.
    await bar.getByRole("radio", { name: "Top view" }).click();
    await expect(bar.getByRole("radio", { name: "Top view" })).toHaveAttribute("aria-checked", "true");
  });

  test("a palette change before placing reaches the hover preview, then the dock", async ({ page }) => {
    await page.getByRole("radio", { name: "Inspect", exact: true }).click();
    const bar = page.getByTestId("context-inspect-toolbar");
    await bar.getByRole("button", { name: "Palette" }).click();
    await page.getByRole("menuitemradio", { name: "viridis" }).click();

    const box = await canvasBox(page);
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5, { steps: 3 });
    await expect(preview(page)).toBeVisible();
    await expect(preview(page).locator(".volume-cube__view")).toHaveAttribute("data-palette", "viridis");

    await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.5);
    await expect(cubeWindow(page)).toBeVisible();
    await expect(cubeWindow(page).locator(".volume-cube__view")).toHaveAttribute("data-palette", "viridis");
  });

  test("the square is a fixed 300 µm at any zoom", async ({ page }) => {
    await page.getByRole("radio", { name: "Inspect", exact: true }).click();
    await page.evaluate(() => {
      const seen: any[] = [];
      (window as any).__inspectEvents = seen;
      (window as any).__landmarksEngine.subscribeInspect((e: any) => seen.push(e));
    });
    const events = () => page.evaluate(() => (window as any).__inspectEvents as any[]);
    const zoom = () => page.evaluate(() => (window as any).__landmarksEngine.getViewState().zoom as number);
    const overlay = () => page.evaluate(() => (window as any).__landmarksEngine.getInspectOverlay());
    const box = await canvasBox(page);
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
    expect((await overlay()).sizeUm).toBe(300);
    const z0 = await zoom();
    await page.evaluate(() => (window as any).__landmarksEngine.zoomBy(-1, { animate: false }));
    await expect.poll(zoom).toBeLessThan(z0);
    expect((await overlay()).sizeUm).toBe(300);
    // The preview hears the hover, and the square's new screen size on zoom.
    const hovers = (await events()).filter((e) => e.type === "hover");
    expect(hovers[0].sizeUm).toBe(300);
    expect(hovers[0].sizePx).toBeCloseTo(300 * 2 ** z0, 3);
    expect(hovers.at(-1).sizeUm).toBe(300);
    expect(hovers.at(-1).sizePx).toBeCloseTo(300 * 2 ** (await zoom()), 3);
    // A click places a 300 µm window.
    await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.5);
    await expect(cubeWindow(page)).toBeVisible();
    expect(await getModel(page, "inspect_size_um")).toBe(300);
    await expect(cubeWindow(page).getByText("Cube · 300 µm")).toBeVisible();
    await page.keyboard.press("Escape");
    expect((await events()).at(-2)).toEqual({ type: "hover-end" });
  });

  test("Save creates an inspect selection of the points in the 300 µm square", async ({ page }) => {
    // Nothing placed: the engine has nothing to save.
    expect(await page.evaluate(() => (window as any).__landmarksEngine.saveInspect())).toBeNull();
    await page.evaluate(() => {
      const seen: any[] = [];
      (window as any).__inspectEvents = seen;
      (window as any).__landmarksEngine.subscribeInspect((e: any) => seen.push(e));
    });
    // A square centred at (230, 150) holds cells 2 and 3, not cell 1 (x 70).
    await page.getByRole("radio", { name: "Inspect", exact: true }).click();
    // One step out, so the point is on screen.
    await page.evaluate(() => (window as any).__landmarksEngine.zoomBy(-1, { animate: false }));
    const box = await canvasBox(page);
    const at = await screenAt(page, box, [230, 150]);
    await page.mouse.click(at.x, at.y);
    await expect(cubeWindow(page)).toBeVisible();
    expect(await selectionsOf(page)).toEqual([]);
    await openAdjust(page);
    const zHi = page.getByRole("slider", { name: "Z cut" }).nth(1);
    await zHi.focus();
    for (let i = 0; i < 10; i++) await page.keyboard.press("ArrowLeft");
    await expect.poll(async () => (await cutOf(page))[5]).toBe(54);

    expect(await save(page)).toBe(0);
    const [sel] = await selectionsOf(page);
    expect(sel.type).toBe("inspect");
    const cx = Number(await getModel(page, "inspect_cx"));
    const cy = Number(await getModel(page, "inspect_cy"));
    expect(sel.window).toEqual({ cx, cy, size_um: 300, cut: await cutOf(page) });
    const inside = await page.evaluate((w) => {
      const pts = (window as any).__landmarksEngine.getPoints() as [number, number][];
      return pts.flatMap((p, i) =>
        Math.abs(p[0] - w.cx) <= w.size_um / 2 && Math.abs(p[1] - w.cy) <= w.size_um / 2 ? [i] : [],
      );
    }, sel.window);
    expect(inside).toHaveLength(2);
    expect([...sel.point_indices].sort()).toEqual(inside.sort());
    expect(await getModel(page, "selected_kind")).toBe("selection");
    expect(await getModel(page, "selected_index")).toBe(0);
    expect((await page.evaluate(() => (window as any).__inspectEvents as any[])).at(-1)).toEqual({
      type: "commit",
      index: 0,
    });
    const strip = cubeWindow(page).getByLabel("Inspect history");
    await expect(strip.getByRole("button", { name: "Inspect 1" })).toHaveAttribute("aria-pressed", "true");
  });

  test("the dock's Save adds one selection and chip, then reads Saved until the window moves", async ({ page }) => {
    await reloadWith(page, "window=100");
    const box = await openCubeAtCentre(page);
    const strip = cubeWindow(page).getByLabel("Inspect history");
    // A click only opens the dock.
    expect(await selectionsOf(page)).toEqual([]);
    await expect(saveButton(page)).toBeEnabled();
    await expect(saveButton(page)).toHaveText("Save");
    await expect(saveButton(page)).toHaveAttribute("data-saved", "false");

    await saveButton(page).click();
    await expect.poll(async () => (await selectionsOf(page)).length).toBe(1);
    await expect(strip.getByRole("button")).toHaveCount(1);
    await expect(saveButton(page)).toHaveText("Saved");
    await expect(saveButton(page)).toBeDisabled();
    await expect(saveButton(page)).toHaveAttribute("data-saved", "true");

    // Moving the live window re-enables Save; a second Save adds a second entry.
    await page.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.4);
    await expect(saveButton(page)).toHaveText("Save");
    await expect(saveButton(page)).toBeEnabled();
    expect(await save(page)).toBe(1);
    await expect(strip.getByRole("button")).toHaveCount(2);

    // A chip restores its window, which is saved.
    await page.mouse.click(box.x + box.width * 0.6, box.y + box.height * 0.6);
    await expect(saveButton(page)).toBeEnabled();
    await strip.getByRole("button", { name: "Inspect 1" }).click();
    await expect(saveButton(page)).toHaveText("Saved");
    expect(await selectionsOf(page)).toHaveLength(2);
  });

  test("Save right after a move stores the new window's cut", async ({ page }) => {
    await reloadWith(page, "window=100");
    const box = await openCubeAtCentre(page);
    await openAdjust(page);
    const xHi = page.getByRole("slider", { name: "X cut" }).nth(1);
    await xHi.focus();
    for (let i = 0; i < 10; i++) await page.keyboard.press("ArrowLeft");
    const cx0 = Number(await getModel(page, "inspect_cx"));
    const size = Number(await getModel(page, "inspect_size_um"));
    const trim = await cutTrim(page, 1, cx0 + size / 2);

    // Move the window and Save in one task: well inside the cut's settle delay.
    await page.evaluate((b) => {
      const canvas = document.querySelector("canvas.landmarks__webgl")!;
      const at = (type: string, fx: number, buttons: number) =>
        canvas.dispatchEvent(
          new MouseEvent(type, { bubbles: true, button: 0, buttons, clientX: b.x + b.width * fx, clientY: b.y + b.height * 0.5 }),
        );
      at("mousedown", 0.5, 1);
      at("mousemove", 0.56, 1);
      at("mouseup", 0.56, 0);
      (document.querySelector('[aria-label="Save window"]') as HTMLButtonElement).click();
    }, box);
    const [sel] = await selectionsOf(page);
    expect(sel.window.cx).toBeGreaterThan(cx0);
    expect(sel.window.cut[0]).toBe(0); // open: the volume's edge
    expect(sel.window.cut[1]).toBeCloseTo(sel.window.cx + size / 2 - trim, 3);
    expect(await cutOf(page)).toEqual(sel.window.cut);
  });

  test("Save after Python moves the window saves the new window, not a stale one", async ({ page }) => {
    await openCubeAtCentre(page);
    const cx0 = Number(await getModel(page, "inspect_cx"));
    const cy0 = Number(await getModel(page, "inspect_cy"));
    // Python moves the window directly (no press, no engine.setInspectWindow
    // call): the engine's own placed-window state is now stale next to the
    // model, which is what the dock (and Save) must go by.
    const nextCx = cx0 + 20;
    await setModel(page, { inspect_cx: nextCx });
    await expect(saveButton(page)).toBeEnabled();
    const index = await save(page);
    const sel = (await selectionsOf(page))[index];
    expect(sel.window.cx).toBe(nextCx);
    expect(sel.window.cy).toBe(cy0);
  });

  test("presses move the live window, never a saved entry", async ({ page }) => {
    const box = await openCubeAtCentre(page);
    expect(await save(page)).toBe(0);
    const saved = (await selectionsOf(page))[0];
    // A drag starting inside the saved (focused) square moves only the live window.
    await dragOnMap(page, box, [0.5, 0.5], [0.56, 0.52]);
    await expect.poll(async () => Number(await getModel(page, "inspect_cx"))).toBeGreaterThan(saved.window.cx);
    await page.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.4);
    await page.waitForTimeout(600); // past the cut's settle commit: nothing may reach the entry
    expect(await selectionsOf(page)).toEqual([saved]);
  });

  test("a release over the dock ends the press; Esc, a lost release or blur end it too", async ({ page }) => {
    const box = await openCubeAtCentre(page);
    const cx = () => getModel(page, "inspect_cx").then(Number);
    const dock = (await cubeWindow(page).boundingBox())!;
    const overDock = { x: dock.x + dock.width / 2, y: dock.y + 12 }; // its title bar
    // Released over the dock: the window stays where the drag left it, saved.
    await page.evaluate(() => {
      const model = (window as any).__landmarksModel;
      model.on("change:inspect_cx", () => ((window as any).__savedCx = model.get("inspect_cx")));
    });
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
    await page.mouse.down();
    await page.mouse.move(overDock.x, overDock.y, { steps: 6 });
    await page.mouse.up();
    const released = await cx();
    expect(await page.evaluate(() => (window as any).__savedCx)).toBe(released);
    await page.mouse.move(overDock.x - 40, overDock.y + 30, { steps: 3 });
    expect(await cx()).toBe(released);
    expect(await selectionsOf(page)).toEqual([]);

    // Esc between press and release: later moves drag nothing.
    await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.7);
    await page.mouse.down();
    await page.keyboard.press("Escape");
    const escaped = await cx();
    await page.mouse.move(box.x + box.width * 0.25, box.y + box.height * 0.7, { steps: 3 });
    await page.mouse.up();
    expect(await cx()).toBe(escaped);

    // A lost release (a move with no button held), or the page losing focus, ends the press.
    const synthetic = (steps: [string, number, number][]) =>
      page.evaluate(
        ({ b, steps }) => {
          const canvas = document.querySelector("canvas.landmarks__webgl")!;
          for (const [type, fx, buttons] of steps) {
            if (type === "blur") {
              window.dispatchEvent(new Event("blur"));
              continue;
            }
            const init = { bubbles: true, button: 0, buttons, clientX: b.x + b.width * fx, clientY: b.y + b.height * 0.5 };
            (type === "mousedown" ? canvas : window).dispatchEvent(new MouseEvent(type, init));
          }
        },
        { b: box, steps },
      );
    await synthetic([
      ["mousedown", 0.4, 1],
      ["mousemove", 0.42, 0],
    ]);
    const lost = await cx();
    await synthetic([["mousemove", 0.6, 1]]);
    expect(await cx()).toBe(lost);
    await synthetic([
      ["mousedown", 0.4, 1],
      ["blur", 0, 0],
    ]);
    const blurred = await cx();
    await synthetic([["mousemove", 0.6, 1]]);
    expect(await cx()).toBe(blurred);
  });

  test("drag pans the cube; Esc closes it", async ({ page }) => {
    await reloadWith(page, "window=100");
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
    const topZoom = await view.getAttribute("data-zoom");
    await bar.getByRole("radio", { name: "Oblique view" }).click();
    await expect(bar.getByRole("radio", { name: "Oblique view" })).toHaveAttribute("aria-checked", "true");
    // In the dock a preset also frames the window as that preset's home view.
    await expect(view).not.toHaveAttribute("data-zoom", topZoom!);

    await bar.getByRole("radio", { name: "Maximum intensity" }).click();
    await expect(view).toHaveAttribute("data-render", "mip");

    await bar.getByRole("button", { name: "Palette" }).click();
    await page.getByRole("menuitemradio", { name: "viridis" }).click();
    await expect(view).toHaveAttribute("data-palette", "viridis");

    await openAdjust(page);
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

    const zHi = page.getByRole("slider", { name: "Z cut" }).nth(1);
    await expect(zHi).toHaveAttribute("aria-valuenow", "64");
    await zHi.focus();
    for (let i = 0; i < 10; i++) await page.keyboard.press("ArrowLeft");
    await expect.poll(async () => ((await getModel(page, "volume_cut")) as number[])[5]).toBe(54);
  });

  test("one Adjust panel: Image, Cells and Cuts sections, each with a Reset, and Reset all", async ({ page }) => {
    await openCubeAtCentre(page);
    await openAdjust(page);
    const panel = page.getByTestId("context-cube-adjust");
    await expect(panel.getByRole("heading")).toHaveText(["Image", "Cells", "Cuts"]);
    const slider = (name: string, n = 0) => panel.getByRole("slider", { name }).nth(n);
    const nudge = async (name: string, key: string, n = 0, times = 4) => {
      await slider(name, n).focus();
      for (let i = 0; i < times; i++) await page.keyboard.press(key);
    };
    const values = async () => {
      const now = async (name: string, n = 0) => Number(await slider(name, n).getAttribute("aria-valuenow"));
      return {
        image: [await now("Contrast", 0), await now("Contrast", 1), await now("Image alpha"), await now("Image gamma")],
        cells: [await now("Cell alpha")],
        cuts: [await now("X cut", 1), await now("Y cut", 0), await now("Z cut", 1)],
      };
    };
    // Defaults: the volume's contrast_limits, alpha 1, gamma 1 (0 on its log2 scale), open cuts.
    const initial = await values();
    expect(initial.image).toEqual([0, 48, 1, 0]);
    expect(initial.cells).toEqual([1]);
    expect(initial.cuts[2]).toBe(64);
    // All sliders are one width.
    const widths = await panel.locator(".landmarks-slider-control").evaluateAll((els) =>
      els.map((el) => Math.round(el.getBoundingClientRect().width)),
    );
    expect(new Set(widths).size).toBe(1);
    expect(widths[0]).toBeGreaterThanOrEqual(150);
    expect(widths[0]).toBeLessThanOrEqual(170);

    const changeAll = async () => {
      await nudge("Contrast", "ArrowLeft", 1);
      await nudge("Image alpha", "ArrowLeft");
      await nudge("Image gamma", "ArrowRight");
      await nudge("Cell alpha", "ArrowLeft");
      await nudge("X cut", "ArrowLeft", 1);
      await nudge("Y cut", "ArrowRight", 0);
      await nudge("Z cut", "ArrowLeft", 1);
      const v = await values();
      expect(v.image).not.toEqual(initial.image);
      expect(v.cells).not.toEqual(initial.cells);
      expect(v.cuts).not.toEqual(initial.cuts);
      await expect.poll(async () => (await cutOf(page))[5]).toBe(60);
    };

    await changeAll();
    await panel.getByRole("button", { name: "Reset image" }).click();
    let v = await values();
    expect(v.image).toEqual(initial.image);
    expect(v.cells).not.toEqual(initial.cells);
    await panel.getByRole("button", { name: "Reset cells" }).click();
    v = await values();
    expect(v.cells).toEqual(initial.cells);
    expect(v.cuts).not.toEqual(initial.cuts);
    // Reset cuts opens every cut and commits it, like a slider release.
    await panel.getByRole("button", { name: "Reset cuts" }).click();
    expect((await values()).cuts).toEqual(initial.cuts);
    await expect.poll(async () => cutOf(page)).toEqual([0, 256, 0, 256, 0, 64]);

    await changeAll();
    await panel.getByRole("button", { name: "Reset all" }).click();
    expect(await values()).toEqual(initial);
    await expect.poll(async () => cutOf(page)).toEqual([0, 256, 0, 256, 0, 64]);
  });

  test("Adjust trigger a11y; Esc closes only the Adjust panel, not the cube", async ({ page }) => {
    await openCubeAtCentre(page);
    const trigger = page.getByTestId("context-inspect-toolbar").getByRole("button", { name: "Adjust" });
    await expect(trigger).toHaveAttribute("aria-haspopup", "dialog");
    await expect(trigger).toHaveAttribute("aria-expanded", "false");

    await trigger.click();
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    const panel = page.getByRole("region", { name: "Adjust" });
    await expect(panel).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(panel).toHaveCount(0);
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await expect(cubeWindow(page)).toBeVisible();
  });

  test("partial X and Y cuts keep their place in a moved window; open edges stay open", async ({ page }) => {
    await reloadWith(page, "window=100");
    const box = await openCubeAtCentre(page);
    await openAdjust(page);

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
    await reloadWith(page, "window=100");
    await openCubeAtCentre(page);
    await openAdjust(page);
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
    await openAdjust(page);
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
    // The 300 µm square holds all three cells: type1 and type0.
    await openCubeAtCentre(page, { at: [130, 170] });
    const bar = page.getByTestId("context-inspect-toolbar");
    await bar.getByRole("switch", { name: "Labels" }).click();
    const view = cubeWindow(page).locator(".volume-cube__view");
    await expect(view).toHaveAttribute("data-labels", "on");
    await expect(view).toHaveAttribute("data-channels", "2");
    await expect(view).toHaveAttribute("data-label-format", "rg8");
    await expect(view).toHaveAttribute("data-label-cells", "3");
    // Nothing focused: every cell in the window, by category (type1 and type0).
    await expect(view).toHaveAttribute("data-highlight", "2");

    // A category: only its cells (category 0 is type1, cells 1 and 3).
    await setModel(page, { selected_kind: "type", selected_index: 0 });
    await expect(view).toHaveAttribute("data-highlight", "1");

    // A Selection: its cells by category (cell 2 only, type0).
    await setModel(page, {
      selections: [{ id: "sel-1", type: "polygon", point_indices: [1] }],
      selected_kind: "selection",
      selected_index: 0,
    });
    await expect(view).toHaveAttribute("data-highlight", "1");

    await setModel(page, { selected_kind: "", selected_index: -1 });
    await expect(view).toHaveAttribute("data-highlight", "2");
  });

  test("with Labels on each toy cell renders in its category colour in the dock", async ({ page }) => {
    // Record the width of every RG8 3D texture allocated (the label textures).
    await page.addInitScript(() => {
      const widths: number[] = [];
      (window as any).__rg8Widths = widths;
      const proto = WebGL2RenderingContext.prototype;
      const texStorage3D = proto.texStorage3D;
      proto.texStorage3D = function (this: WebGL2RenderingContext, ...args: Parameters<typeof texStorage3D>) {
        if (args[2] === this.RG8) widths.push(args[3]);
        return texStorage3D.apply(this, args);
      };
    });
    // A 100 µm window over cells 2 (type0, at 160, 150) and 3 (type1, at 100, 190)
    // and not cell 1: the first cell encoded is global 2, so local index 1 is
    // global 2 and a local/global mix-up changes the colours.
    await reloadWith(page, "window=100");
    await openCubeAtCentre(page, { at: [130, 170] });
    const view = cubeWindow(page).locator(".volume-cube__view");
    // Half-µm centre: the level-0 box is X 80-181, Y 120-221, an odd 101 voxels
    // wide (RG8 rows of 202 bytes, not 4-byte aligned, like A2's 667).
    await setModel(page, { inspect_cx: 130.5, inspect_cy: 170.5 });
    // Maximum intensity puts cells in front of the image, so deep cells show too.
    const bar = page.getByTestId("context-inspect-toolbar");
    await bar.getByRole("radio", { name: "Maximum intensity" }).click();
    await expect(view).toHaveAttribute("data-render", "mip");
    await expect(view).toHaveAttribute("data-refining", "false");
    await expect(view).toHaveAttribute("data-pan", "0,0");
    const off = await view.screenshot();

    await bar.getByRole("switch", { name: "Labels" }).click();
    await expect(view).toHaveAttribute("data-channels", "2");
    await expect(view).toHaveAttribute("data-label-cells", "2");
    await expect(view).toHaveAttribute("data-highlight", "2");
    expect(await page.evaluate(() => (window as any).__rg8Widths)).toContain(101);
    const on = await newCategoryPixels(page, off, await view.screenshot());
    // Cell 3 (type1, blue) and cell 2 (type0, orange) both show...
    expect(on.type1.count).toBeGreaterThan(200);
    expect(on.type0.count).toBeGreaterThan(200);
    // ...each where it is (top-down: x right, y down): cell 2 right of and above cell 3.
    expect(on.type0.x).toBeGreaterThan(on.type1.x + 20);
    expect(on.type0.y).toBeLessThan(on.type1.y - 20);
  });

  test("the dock shows the coarse level first, then refines", async ({ page }) => {
    // Small budgets make the toy pyramid pick different levels (see main.tsx ?budgets).
    await reloadWith(page, "budgets=20000,300000&window=100");
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
    // Nothing focused: every cell in the window is highlighted.
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

  test("history chips restore each saved window and cut; a saved entry keeps its cut", async ({ page }) => {
    const box = await openCubeAtCentre(page);
    const cx = () => getModel(page, "inspect_cx").then(Number);
    await openAdjust(page);
    const zHi = page.getByRole("slider", { name: "Z cut" }).nth(1);
    const nudge = async (key: string) => {
      await zHi.focus();
      for (let i = 0; i < 10; i++) await page.keyboard.press(key);
    };
    await nudge("ArrowLeft");
    await expect.poll(async () => (await cutOf(page))[5]).toBe(54);
    expect(await save(page)).toBe(0);
    const first = (await selectionsOf(page))[0];
    expect(first.window.cut[5]).toBe(54);

    // Elsewhere, with entry 1 still focused: a new cut stays out of entry 1.
    await page.mouse.click(box.x + box.width * 0.2, box.y + box.height * 0.25);
    await expect.poll(cx).not.toBeCloseTo(first.window.cx, 1);
    await nudge("ArrowRight");
    await expect.poll(async () => (await cutOf(page))[5]).toBe(64);
    await page.waitForTimeout(600); // past the cut's settle commit
    expect((await selectionsOf(page))[0]).toEqual(first);
    expect(await save(page)).toBe(1);
    const second = (await selectionsOf(page))[1];

    const strip = cubeWindow(page).getByLabel("Inspect history");
    await expect(strip.getByRole("button")).toHaveCount(2);
    await expect(strip.getByRole("button", { name: "Inspect 2" })).toHaveAttribute("aria-pressed", "true");
    await strip.getByRole("button", { name: "Inspect 1" }).click();
    await expect.poll(cx).toBeCloseTo(first.window.cx, 3);
    await expect.poll(async () => (await cutOf(page))[5]).toBe(54);
    await strip.getByRole("button", { name: "Inspect 2" }).click();
    await expect.poll(cx).toBeCloseTo(second.window.cx, 3);
    await expect.poll(async () => (await cutOf(page))[5]).toBe(64);

    // A press moves the live window off the focused entry; its chip brings it back.
    await page.mouse.click(box.x + box.width * 0.7, box.y + box.height * 0.6);
    await expect.poll(cx).not.toBeCloseTo(second.window.cx, 1);
    await strip.getByRole("button", { name: "Inspect 2" }).click();
    await expect.poll(cx).toBeCloseTo(second.window.cx, 3);
    // Saved entries are snapshots: nothing above changed them.
    expect(await selectionsOf(page)).toEqual([first, second]);
  });

  test("deleting an inspect selection removes its chip; the last one closes the dock", async ({ page }) => {
    await openCubeAtCentre(page);
    expect(await save(page)).toBe(0);
    const strip = cubeWindow(page).getByLabel("Inspect history");
    await expect(strip.getByRole("button")).toHaveCount(1);
    // Once refined, the chip carries a snapshot of the cube.
    await expect(strip.getByRole("button", { name: "Inspect 1" }).locator("img")).toHaveCount(1);
    await setModel(page, { selections: [], selected_kind: "", selected_index: -1 });
    await expect(cubeWindow(page)).toHaveCount(0);
  });

  test("a chip's snapshot follows its entry: a reused id re-snapshots", async ({ page }) => {
    // A 100 µm window, so two places show different parts of the toy volume.
    await reloadWith(page, "window=100");
    const box = await openCubeAtCentre(page);
    expect(await save(page)).toBe(0);
    const chip = cubeWindow(page).getByLabel("Inspect history").getByRole("button", { name: "Inspect 1" });
    const src = () => chip.locator("img").getAttribute("src");
    await expect(chip.locator("img")).toHaveCount(1);
    await page.waitForTimeout(1200); // past the snapshot's settle replacement (SNAPSHOT_SETTLE_MS)
    const before = await src();
    const id = (await selectionsOf(page))[0].id;

    // Delete it, then save a new entry elsewhere under the same (reused) id.
    await setModel(page, { selections: [], selected_kind: "", selected_index: -1 });
    await expect(cubeWindow(page)).toHaveCount(0);
    await page.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.3);
    await expect(cubeWindow(page)).toBeVisible();
    expect(await save(page)).toBe(0);
    expect((await selectionsOf(page))[0].id).toBe(id);
    await expect(chip.locator("img")).toHaveCount(1);
    await expect.poll(src).not.toBe(before);
  });

  test("hover shows a live coarse preview that slides without refetching", async ({ page }) => {
    await reloadWith(page, "budgets=20000,300000&window=100");
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
    await page.mouse.move(box.x + box.width * 0.53, box.y + box.height * 0.5, { steps: 4 });
    // The shown region slides under the moved square: a new pan (whole voxels), same region, no fetch.
    await expect(view).not.toHaveAttribute("data-pan", pan!);
    expect(await preview(page).getAttribute("data-region")).toBe(region);
    expect(chunkRequests).toEqual([]);
    await expect(page.getByRole("dialog", { name: "Cube" })).toHaveCount(0);
  });

  test("moving far recentres the preview region; leaving the map hides it", async ({ page }) => {
    await reloadWith(page, "budgets=20000,300000&window=100");
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
    await reloadWith(page, "window=100");
    await page.getByRole("radio", { name: "Inspect", exact: true }).click();
    await page.evaluate(() => {
      const seen: any[] = [];
      (window as any).__inspectEvents = seen;
      (window as any).__landmarksEngine.subscribeInspect((e: any) => seen.push(e));
    });
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

  /** Hover at each canvas fraction: the preview float stays inside the widget and off the cursor. */
  async function expectFloatClearOfCursor(page: Page, points: [number, number][]) {
    await page.getByRole("radio", { name: "Inspect", exact: true }).click();
    const box = await canvasBox(page);
    const root = (await page.locator(".landmarks").first().boundingBox())!;
    const float = preview(page);
    for (const [fx, fy] of points) {
      const p = { x: box.x + box.width * fx, y: box.y + box.height * fy };
      await page.mouse.move(p.x, p.y, { steps: 3 });
      await expect(float).toBeVisible();
      const placed = async () => {
        const r = (await float.boundingBox())!;
        const inside =
          r.x >= root.x - 0.5 &&
          r.y >= root.y - 0.5 &&
          r.x + r.width <= root.x + root.width + 0.5 &&
          r.y + r.height <= root.y + root.height + 0.5;
        const overCursor = p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height;
        return inside && !overCursor;
      };
      await expect.poll(placed).toBe(true);
    }
  }

  test("at the product window the preview float stays inside the widget, clear of the cursor", async ({ page }) => {
    // The default 300 µm square is wider than the canvas: no side has room, so
    // the float pins to the widget corner farthest from the cursor.
    await expectFloatClearOfCursor(page, [
      [0.5, 0.5],
      [0.15, 0.2],
      [0.85, 0.8],
      [0.9, 0.15],
    ]);
  });

  test("in a small widget the pinned preview float still clears the cursor", async ({ page }) => {
    // 560 px wide and the minimum 400 px tall: every inset corner covers the centre.
    await page.setViewportSize({ width: 560, height: 900 });
    await bootLandmarksVolumeHarness(page);
    const handle = (await page.getByRole("button", { name: "Resize height" }).boundingBox())!;
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
    await page.mouse.down();
    await page.mouse.move(handle.x + handle.width / 2, 0, { steps: 4 });
    await page.mouse.up();
    await expect.poll(async () => (await page.locator(".landmarks").first().boundingBox())!.height).toBeLessThan(420);
    await expectFloatClearOfCursor(page, [
      [0.5, 0.5],
      [0.45, 0.45],
      [0.55, 0.55],
      [0.5, 0.3],
    ]);
  });

  test("the preview is frameless: no panel chrome, a transparent cube", async ({ page }) => {
    await page.getByRole("radio", { name: "Inspect", exact: true }).click();
    const box = await canvasBox(page);
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
    await expect(preview(page)).toBeVisible();
    const styles = await preview(page).evaluate((el) => {
      const view = el.querySelector(".volume-cube__view")!;
      const s = getComputedStyle(el);
      return {
        float: { bg: s.backgroundColor, shadow: s.boxShadow, border: s.borderTopWidth },
        view: getComputedStyle(view).backgroundColor,
      };
    });
    expect(styles.float).toEqual({ bg: "rgba(0, 0, 0, 0)", shadow: "none", border: "0px" });
    expect(styles.view).toBe("rgba(0, 0, 0, 0)");
  });

  test("the dock and the preview open top-down; an axis legend turns with the camera", async ({ page }) => {
    await openCubeAtCentre(page);
    const bar = page.getByTestId("context-inspect-toolbar");
    await expect(bar.getByRole("radio", { name: "Top view" })).toHaveAttribute("aria-checked", "true");
    const view = cubeWindow(page).locator(".volume-cube__view");
    const legend = view.getByLabel("Axes");
    await expect(legend).toBeVisible();
    // From above: x right, y down the screen (as on the map), z at the viewer.
    const lengths = async (l: typeof legend) => (await l.getAttribute("data-lengths"))!.split(",").map(Number);
    await expect.poll(async () => (await lengths(legend))[2]).toBeLessThan(0.05);
    expect(await legend.getAttribute("data-axes")).toBe("0,-90,0");
    const top = await legend.getAttribute("data-axes");

    // Orbit the camera by dragging inside the dock: the legend turns.
    const r = (await view.boundingBox())!;
    await page.mouse.move(r.x + r.width * 0.5, r.y + r.height * 0.5);
    await page.mouse.down();
    await page.mouse.move(r.x + r.width * 0.65, r.y + r.height * 0.35, { steps: 6 });
    await page.mouse.up();
    await expect(legend).not.toHaveAttribute("data-axes", top!);
    await expect.poll(async () => (await lengths(legend))[2]).toBeGreaterThan(0.1);
    await expect(bar.getByRole("radio", { name: "Top view" })).toHaveAttribute("aria-checked", "false");

    // Reset is the top-down home view.
    await bar.getByRole("button", { name: "Reset view" }).click();
    await expect(bar.getByRole("radio", { name: "Top view" })).toHaveAttribute("aria-checked", "true");
    await expect(legend).toHaveAttribute("data-axes", top!);

    // The hover preview is top-down too, with its own legend.
    const box = await canvasBox(page);
    await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.5, { steps: 3 });
    const previewLegend = preview(page).locator(".volume-cube__view").getByLabel("Axes");
    await expect(previewLegend).toBeVisible();
    await expect(previewLegend).toHaveAttribute("data-axes", top!);
    expect((await lengths(previewLegend))[2]).toBeLessThan(0.05);
  });

  test("the camera dips 45° below level, not further", async ({ page }) => {
    await openCubeAtCentre(page);
    const bar = page.getByTestId("context-inspect-toolbar");
    const view = cubeWindow(page).locator(".volume-cube__view");
    // Let the initial load settle before the first toolbar click.
    await expect(view).toHaveAttribute("data-refining", "false");
    await bar.getByRole("radio", { name: "Side view" }).click();
    await expect(view).toHaveAttribute("data-pitch", "0");

    // Drag far past level: the pitch clamps at -45 rather than continuing to orbit.
    const r = (await view.boundingBox())!;
    await page.mouse.move(r.x + r.width * 0.5, r.y + r.height * 0.5);
    await page.mouse.down();
    await page.mouse.move(r.x + r.width * 0.5, r.y + r.height * 0.1, { steps: 20 });
    await page.mouse.up();
    await expect(view).toHaveAttribute("data-pitch", "-45");
  });

  test("landmarks crossing the window are drawn in the cube; ones outside are not", async ({ page }) => {
    const line = (id: string, vertices: [number, number][], extra: Record<string, unknown> = {}) => ({
      id,
      type: "line",
      vertices,
      line_style: "solid",
      color: "#00e5ff",
      ...extra,
    });
    // Across the toy volume (the window clamps to it), and wholly outside it.
    await setModel(page, { landmarks: [line("across", [[20, 128], [240, 140]])] });
    const geometry = await page.evaluate(() => (window as any).__landmarksEngine.getLandmarkGeometry());
    expect(geometry).toEqual([
      { kind: "path", coords: [[20, 128], [240, 140]], closed: false, color: [0, 229, 255, 255] },
    ]);
    await openCubeAtCentre(page);
    const view = cubeWindow(page).locator(".volume-cube__view");
    await expect(view).toHaveAttribute("data-overlays", "1");

    await setModel(page, { landmarks: [line("outside", [[300, 300], [420, 380]])] });
    await expect(view).toHaveAttribute("data-overlays", "0");
    // A hidden landmark is not drawn either.
    await setModel(page, { landmarks: [line("hidden", [[20, 128], [240, 140]], { hidden: true })] });
    await expect(view).toHaveAttribute("data-overlays", "0");

    // The hover preview draws them too.
    await setModel(page, {
      landmarks: [line("across", [[20, 128], [240, 140]]), { id: "p", type: "point", vertices: [[128, 100]] }],
    });
    await expect(view).toHaveAttribute("data-overlays", "2");
    const box = await canvasBox(page);
    await page.mouse.move(box.x + box.width * 0.4, box.y + box.height * 0.5, { steps: 3 });
    await expect(preview(page)).toBeVisible();
    await expect(preview(page).locator(".volume-cube__view")).toHaveAttribute("data-overlays", "2");
  });

  test("a window inside the volume draws only the landmarks crossing it, top edge included", async ({ page }) => {
    await reloadWith(page, "window=100");
    const line = (id: string, vertices: [number, number][]) => ({
      id,
      type: "line",
      vertices,
      line_style: "solid",
      color: "#00e5ff",
    });
    // Near the volume's top: the window spans y 10–110 (map y runs down).
    await openCubeAtCentre(page);
    await setModel(page, { inspect_cx: 128, inspect_cy: 60 });
    const view = cubeWindow(page).locator(".volume-cube__view");
    // Across the window's top edge, mostly above it: drawn.
    const top = line("top", [[128, 2], [140, 30]]);
    await setModel(page, { landmarks: [top] });
    await expect(view).toHaveAttribute("data-overlays", "1");
    // Inside the volume, below the window: not drawn (a flipped Y would draw it).
    await setModel(page, { landmarks: [line("below", [[20, 200], [240, 220]])] });
    await expect(view).toHaveAttribute("data-overlays", "0");
    // Beside the window, inside the volume: not drawn either.
    await setModel(page, { landmarks: [top, line("left", [[5, 40], [40, 80]])] });
    await expect(view).toHaveAttribute("data-overlays", "1");
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
