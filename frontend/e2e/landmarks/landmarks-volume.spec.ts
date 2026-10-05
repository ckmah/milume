import { expect, type Locator, type Page } from "@playwright/test";

import { test } from "../fixtures";

import { bootLandmarksVolumeHarness, canvasBox, getModel, setModel } from "../helpers";

/**
 * Landmarks over a toy SpatialData (`E2E_HARNESS=landmarks-volume`): Inspect
 * hovers a window square, a press places it (a drag moves it) and the release
 * opens the immersive cube, which covers the map; Esc closes it. The Inspect
 * context bar drives the cube. The Inspect pill (top, in place of the tool
 * pill) holds Save, which keeps the window as an inspect Selection, and Exit. Because the map is covered while the cube is open, tests that move
 * the window close the cube first (`moveWindow`). The cube's `data-*` mirrors are
 * read from its `.volume-cube__view` inside the Cube dialog.
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
/** The top pill while in Inspect (in place of the tool pill): Exit, the window's status, Save. */
const inspectPill = (page: Page) => page.getByTestId("inspect-pill");
const saveButton = (page: Page) => inspectPill(page).getByRole("button", { name: "Save window" });
/** Inspect collapses the docks: reopen the left one (Selections) from its peek tab. It floats over the cube. */
async function openSelectionsDock(page: Page) {
  const left = page.locator(".landmarks__chrome-dock--left");
  if ((await left.getAttribute("data-collapsed")) === "true") {
    await page.getByRole("button", { name: "Show left panel" }).click();
  }
  await expect(left).toHaveAttribute("data-collapsed", "false");
}
/** The Selections panel's row for selection `index`. */
const selectionRow = (page: Page, index: number) => page.getByTestId("selection-row").nth(index);
/** The focused element, through shadow roots: its aria-label and whether it sits in `[data-testid=testId]`. */
async function focused(page: Page, testId: string) {
  return page.evaluate((testId) => {
    let el: Element | null = document.activeElement;
    while (el?.shadowRoot?.activeElement) el = el.shadowRoot.activeElement;
    return {
      label: el?.getAttribute("aria-label") ?? el?.tagName ?? null,
      inside: Boolean(el?.closest(`[data-testid="${testId}"], [aria-label="${testId}"]`)),
    };
  }, testId);
}
/** Save the live window from the Inspect pill; the new entry's index (it is focused). */
async function save(page: Page) {
  const before = (await selectionsOf(page)).length;
  await saveButton(page).click();
  await expect.poll(async () => (await selectionsOf(page)).length).toBe(before + 1);
  return Number(await getModel(page, "selected_index"));
}
/** Open the Inspect toolbar's Adjust panel (Image and Labels columns). */
const openAdjust = (page: Page) =>
  page.getByTestId("context-inspect-toolbar").getByRole("button", { name: "Adjust" }).click();
const adjustPanel = (page: Page) => page.getByTestId("context-cube-adjust");
/** Open the Inspect toolbar's Cross-section panel (the X, Y and Z cuts). */
const openCross = (page: Page) =>
  page.getByTestId("context-inspect-toolbar").getByRole("button", { name: "Cross-section", exact: true }).click();
const crossPanel = (page: Page) => page.getByTestId("context-cube-cross");
/** Whichever of the bar's panels is open (one at a time). */
const openPanel = (page: Page) => page.locator('[data-testid="context-cube-adjust"], [data-testid="context-cube-cross"]');
/**
 * Put one of the Adjust panel's Show switches ("Show image", "Show labels")
 * in state `on`, then close the panel. Idempotent, so a test asks for the state
 * it needs instead of flipping whatever the default happens to be.
 */
async function setShow(page: Page, name: "Show image" | "Show labels", on: boolean) {
  await openAdjust(page);
  const sw = adjustPanel(page).getByRole("switch", { name });
  if ((await sw.isChecked()) !== on) await sw.click();
  await expect(sw).toBeChecked({ checked: on });
  await page.keyboard.press("Escape");
  await expect(adjustPanel(page)).toHaveCount(0);
}

/** Pixels of a screenshot brighter than `min` (max of r, g, b). */
async function brightPixels(page: Page, png: Buffer, min = 60) {
  return page.evaluate(
    async ({ png, min }) => {
      const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${png}`)).blob());
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(bitmap, 0, 0);
      const { data } = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
      let n = 0;
      for (let i = 0; i < data.length; i += 4) if (Math.max(data[i]!, data[i + 1]!, data[i + 2]!) > min) n++;
      return n;
    },
    { png: png.toString("base64"), min },
  );
}

/** Remount the harness with harness-only options (`window=<µm>`, `budgets=<preview>,<dock>`). */
const reloadWith = bootLandmarksVolumeHarness;

/** A real page load with the options, for a test that installed an init script (`@isolated`). */
async function loadFresh(page: Page, query: string) {
  await page.goto(`/?${query}`, { waitUntil: "networkidle" });
  await page.waitForFunction(() => Boolean((window as any).__landmarksEngine?.getViewState?.()));
}

/**
 * After one Shift+arrow press (ten steps) on a cut slider: how far `volume_cut[i]` sits inside
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
 * view (`before`, `after`): hue within 15° of the category's, saturated (at
 * least `minSaturation`, (max - min) / max) and not dark, and not already that
 * colour before. Counts and mean x, y (px) per
 * category. Comparing the two leaves out the frame's axes and the axis legend.
 */
async function newCategoryPixels(page: Page, before: Buffer, after: Buffer, minSaturation = 0.4) {
  return page.evaluate(
    async ({ before, after, hues, minSaturation }) => {
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
        if (max < 40 || d / max < minSaturation) return "";
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
    { before: before.toString("base64"), after: after.toString("base64"), hues: CATEGORY_HUES, minSaturation },
  );
}

/**
 * Category-coloured pixels of one screenshot, by the same hue test as
 * `newCategoryPixels` but with no before image: for a count that has to fall
 * (a cell leaving its category colour), there is nothing for a diff to catch.
 */
async function categoryPixels(page: Page, png: Buffer) {
  return page.evaluate(
    async ({ png, hues }) => {
      const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${png}`)).blob());
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(bitmap, 0, 0);
      const { data } = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
      const out = Object.fromEntries(Object.keys(hues).map((k) => [k, 0])) as Record<keyof typeof hues, number>;
      let flat = 0;
      for (let i = 0; i < data.length; i += 4) {
        const [r, g, b] = [data[i]!, data[i + 1]!, data[i + 2]!];
        const max = Math.max(r, g, b);
        const d = max - Math.min(r, g, b);
        if (max < 40) continue;
        if (d / max < 0.4) {
          flat++;
          continue;
        }
        let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
        h = (h * 60 + 360) % 360;
        for (const [k, hue] of Object.entries(hues))
          if (Math.abs(((h - hue + 540) % 360) - 180) <= 15) out[k as keyof typeof hues]++;
      }
      return { ...out, flat };
    },
    { png: png.toString("base64"), hues: CATEGORY_HUES },
  );
}

/**
 * Hue clusters the view gained between two screenshots: saturated pixels
 * bucketed by 10°, keeping buckets of over 1000 pixels that `before` did not
 * already have. The diff drops the chrome, whose axis legend is a cluster of
 * its own. Instance colours are hues nothing else picks, so the clusters count
 * the cells that colour tells apart.
 */
async function newHueClusters(page: Page, before: Buffer, after: Buffer) {
  return page.evaluate(
    async ({ before, after }) => {
      const clusters = async (png: string) => {
        const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${png}`)).blob());
        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(bitmap, 0, 0);
        const { data } = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
        const buckets = new Map<number, number>();
        for (let i = 0; i < data.length; i += 4) {
          const [r, g, b] = [data[i]!, data[i + 1]!, data[i + 2]!];
          const max = Math.max(r, g, b);
          const d = max - Math.min(r, g, b);
          if (max < 40 || d / max < 0.4) continue;
          let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
          h = (h * 60 + 360) % 360;
          const k = Math.floor(h / 10) * 10;
          buckets.set(k, (buckets.get(k) ?? 0) + 1);
        }
        return new Set([...buckets.entries()].filter(([, n]) => n > 1000).map(([k]) => k));
      };
      const [was, now] = [await clusters(before), await clusters(after)];
      return [...now].filter((k) => !was.has(k)).sort((a, b) => a - b);
    },
    { before: before.toString("base64"), after: after.toString("base64") },
  );
}

/**
 * Category-coloured pixels of a screenshot, grouped into connected blobs: for
 * each blob of at least 30 pixels (bounding-box radius R = half the larger
 * side), `core` counts its pixels within 0.4R of the box centre and `rim` those
 * between 0.7R and 1.15R, summed over blobs. The core is a smaller area than the
 * rim band, so even a filled cell has core/rim well below 1 (see the shells test
 * for the measured ratios).
 */
async function ringVsCore(page: Page, png: Buffer) {
  return page.evaluate(
    async ({ png, hues }) => {
      const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${png}`)).blob());
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(bitmap, 0, 0);
      const { data, width, height } = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
      const category = (i: number) => {
        const [r, g, b] = [data[i]!, data[i + 1]!, data[i + 2]!];
        const max = Math.max(r, g, b);
        const d = max - Math.min(r, g, b);
        if (max < 40 || d / max < 0.4) return "";
        let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
        h = (h * 60 + 360) % 360;
        for (const [k, hue] of Object.entries(hues)) if (Math.abs(((h - hue + 540) % 360) - 180) <= 15) return k;
        return "";
      };
      const kind = new Array<string>(width * height);
      for (let p = 0; p < kind.length; p++) kind[p] = category(p * 4);
      const seen = new Uint8Array(width * height);
      let rim = 0;
      let core = 0;
      for (let start = 0; start < kind.length; start++) {
        if (!kind[start] || seen[start]) continue;
        const members: number[] = [start];
        seen[start] = 1;
        let [x0, x1, y0, y1] = [width, 0, height, 0];
        for (let q = 0; q < members.length; q++) {
          const p = members[q]!;
          const [x, y] = [p % width, Math.floor(p / width)];
          x0 = Math.min(x0, x);
          x1 = Math.max(x1, x);
          y0 = Math.min(y0, y);
          y1 = Math.max(y1, y);
          for (let dy = -1; dy <= 1; dy++)
            for (let dx = -1; dx <= 1; dx++) {
              const [nx, ny] = [x + dx, y + dy];
              if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
              const n = ny * width + nx;
              if (kind[n] === kind[start] && !seen[n]) {
                seen[n] = 1;
                members.push(n);
              }
            }
        }
        if (members.length < 30) continue;
        const R = Math.max(x1 - x0, y1 - y0) / 2;
        const [cx, cy] = [(x0 + x1) / 2, (y0 + y1) / 2];
        for (const p of members) {
          const d = Math.hypot((p % width) - cx, Math.floor(p / width) - cy);
          if (d <= 0.4 * R) core++;
          else if (d >= 0.7 * R && d <= 1.15 * R) rim++;
        }
      }
      return { rim, core };
    },
    { png: png.toString("base64"), hues: CATEGORY_HUES },
  );
}

type Box = { x: number; y: number; width: number; height: number };
async function dragOnMap(page: Page, box: Box, from: [number, number], to: [number, number]) {
  await page.mouse.move(box.x + box.width * from[0], box.y + box.height * from[1]);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * to[0], box.y + box.height * to[1], { steps: 3 });
  await page.mouse.up();
}

/**
 * Move the live window while the immersive cube is open: close it (the map is
 * covered while it is open), then press-drag on the map; the cube opens again
 * on release.
 */
async function moveWindow(page: Page, box: Box, from: [number, number], to: [number, number]) {
  if (await cubeWindow(page).count()) {
    // An open panel (Adjust, Cross-section) owns the first Esc (it closes only itself).
    if (await openPanel(page).count()) {
      await page.keyboard.press("Escape");
      await expect(openPanel(page)).toHaveCount(0);
    }
    await page.keyboard.press("Escape");
    await expect(cubeWindow(page)).toHaveCount(0);
  }
  await dragOnMap(page, box, from, to);
  await expect(cubeWindow(page)).toBeVisible();
}

/** The canvas point over a map point (µm), from the engine's orthographic view state. */
async function screenAt(page: Page, box: Box, [x, y]: [number, number]) {
  const vs = await page.evaluate(() => (window as any).__landmarksEngine.getViewState());
  const k = 2 ** vs.zoom;
  return { x: box.x + box.width / 2 + (x - vs.target[0]) * k, y: box.y + box.height / 2 + (y - vs.target[1]) * k };
}

/** Click in Inspect at the canvas centre, or at map point `at` (µm). */
async function openCubeAtCentre(page: Page, { at }: { at?: [number, number] } = {}) {
  await page.getByRole("radio", { name: "Inspect", exact: true }).click();
  const box = await canvasBox(page);
  const p = at ? await screenAt(page, box, at) : { x: box.x + box.width * 0.5, y: box.y + box.height * 0.5 };
  await page.mouse.click(p.x, p.y);
  await expect(cubeWindow(page)).toBeVisible();
  return box;
}

/** Record every `data-state` the element at `selector` takes from now on (read with `recordedStates`). */
async function recordStates(page: Page, selector: string) {
  await page.evaluate((selector) => {
    const el = document.querySelector(selector)!;
    const states: string[] = [];
    (window as any).__states = states;
    (window as any).__statesObserver?.disconnect();
    const observer = new MutationObserver(() => states.push(el.getAttribute("data-state") ?? ""));
    observer.observe(el, { attributes: true, attributeFilter: ["data-state"] });
    (window as any).__statesObserver = observer;
  }, selector);
}
const recordedStates = (page: Page) => page.evaluate(() => (window as any).__states as string[]);

/** A synthetic pointer event on the open cube: type, x offset (px) from the view's centre, buttons, pointer id (default 1). */
type PointerStep = [type: string, dx: number, buttons: number, pointerId?: number];
/**
 * Dispatch `steps` with Shift held, in one task (so moves can land inside the
 * 40 ms pan save throttle): the press on the cube view, the rest on window.
 * Returns `inspect_cx` as last saved (`__savedCx`, if recorded) and as live now.
 */
async function shiftPointer(page: Page, steps: PointerStep[]) {
  return page.evaluate((steps) => {
    const view = document.querySelector('[role="dialog"][aria-label="Cube"] .volume-cube__view')!;
    const r = view.getBoundingClientRect();
    for (const [type, dx, buttons, pointerId = 1] of steps) {
      const init = {
        bubbles: true,
        cancelable: true,
        composed: true,
        pointerId,
        pointerType: "mouse",
        isPrimary: pointerId === 1,
        button: 0,
        buttons,
        shiftKey: true,
        clientX: r.x + r.width / 2 + dx,
        clientY: r.y + r.height / 2,
      };
      (type === "pointerdown" ? view : window).dispatchEvent(new PointerEvent(type, init));
    }
    const model = (window as any).__landmarksModel;
    return { saved: (window as any).__savedCx as number | undefined, live: model.get("inspect_cx") as number };
  }, steps);
}

/** Press at the cube view's centre, drag (dx, dy) px in 4 steps and release; `shift` holds Shift throughout. */
async function dragCube(page: Page, view: Locator, dx: number, dy: number, { shift = false }: { shift?: boolean }) {
  const b = (await view.boundingBox())!;
  const x = b.x + b.width / 2;
  const y = b.y + b.height / 2;
  if (shift) await page.keyboard.down("Shift");
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 4 });
  await page.mouse.up();
  if (shift) await page.keyboard.up("Shift");
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
    await expect(inspectPill(page)).toHaveAttribute("data-state", "open");
    await expect(inspectPill(page).getByText(/^[\d.]+ µm$/)).toBeVisible();
    await expect(cubeWindow(page).locator(".volume-cube__view")).toHaveAttribute("data-channels", /1|2/);
    expect(Number(await getModel(page, "inspect_cx"))).toBeGreaterThan(0);
    expect((await page.evaluate(() => (window as any).__landmarksEngine.getInspectOverlay())).placed).not.toBeNull();
    // A click only places the window: no selection, no Selections row.
    expect(await selectionsOf(page)).toEqual([]);
    await expect(page.getByTestId("selection-row")).toHaveCount(0);

    await page.keyboard.press("Escape");
    await expect(cubeWindow(page)).toHaveCount(0);
  });

  test("a drag moves the window with the cube closed; the cube opens on release", async ({ page }) => {
    await page.getByRole("radio", { name: "Inspect", exact: true }).click();
    const box = await canvasBox(page);
    await page.mouse.move(box.x + box.width * 0.4, box.y + box.height * 0.5);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5, { steps: 4 });
    // Mid-drag: the window has moved, the cube has not opened.
    await expect.poll(async () => Number(await getModel(page, "inspect_cx"))).toBeGreaterThan(0);
    await expect(cubeWindow(page)).toHaveCount(0);
    await page.mouse.up();
    await expect(cubeWindow(page)).toBeVisible();
  });

  test("the cube fills the plot area and Esc returns to the map", async ({ page }) => {
    await openCubeAtCentre(page);
    const body = page.locator(".landmarks__body").first();
    const [cube, plot] = await Promise.all([cubeWindow(page).boundingBox(), body.boundingBox()]);
    expect(cube!.width).toBeGreaterThanOrEqual(plot!.width - 2);
    expect(cube!.height).toBeGreaterThanOrEqual(plot!.height - 2);
    await expect(cubeWindow(page).locator(".volume-cube__view")).toBeVisible();
    // The hover preview does not float over the immersive cube.
    await expect(preview(page)).toBeHidden();
    await page.keyboard.press("Escape");
    await expect(cubeWindow(page)).toHaveCount(0);
  });

  test("entering Inspect swaps the top pill for the dotted Inspect pill; Exit restores it", async ({ page }) => {
    const tools = page.getByRole("toolbar", { name: "Drawing tools" });
    await expect(tools).toBeVisible();
    await page.getByRole("radio", { name: "Inspect", exact: true }).click();
    const pill = page.getByTestId("inspect-pill");
    await expect(pill).toBeVisible();
    await expect(pill).toHaveAttribute("data-state", "armed");
    await expect(tools).toHaveCount(0);
    await expect(pill.getByText("Click to place a 300 µm window")).toBeVisible();
    expect(await pill.evaluate((el) => getComputedStyle(el).borderStyle)).toContain("dashed");
    await pill.getByRole("button", { name: "Exit Inspect" }).click();
    await expect(pill).toHaveCount(0);
    await expect(tools).toBeVisible();
    expect(await getModel(page, "mode")).not.toBe("inspect");
  });

  test("the Inspect pill shows Refining then Ready, with Save and Exit", async ({ page }) => {
    await openCubeAtCentre(page);
    const pill = page.getByTestId("inspect-pill");
    await expect(pill).toHaveAttribute("data-state", "open");
    await expect(pill.getByText(/Inspect/)).toBeVisible();
    await expect(page.getByTestId("inspect-status")).toHaveAttribute("data-state", "ready");
    await expect(pill.getByRole("button", { name: "Save window" })).toBeEnabled();
    await pill.getByRole("button", { name: "Exit Inspect" }).click();
    await expect(cubeWindow(page)).toHaveCount(0);
    await expect(page.getByRole("toolbar", { name: "Drawing tools" })).toBeVisible();
  });

  test("a saved inspect window is named by its top category and cell count", async ({ page }) => {
    await openCubeAtCentre(page);
    await page.getByTestId("inspect-pill").getByRole("button", { name: "Save window" }).click();
    await expect.poll(async () => (await selectionsOf(page)).length).toBe(1);
    // The default window holds all three toy cells; two are type1. The count is the
    // selection's total members, the label the category with the most.
    const [sel] = await selectionsOf(page);
    expect(sel.id).toBe("type1 · 3");
    // From the members themselves: the count is `point_indices.length`, the label
    // the active categorical's most frequent code among them.
    const majority = await page.evaluate(
      ({ indices }) => {
        const engine = (window as any).__landmarksEngine;
        const model = (window as any).__landmarksModel;
        const n = engine.getPoints().length;
        const cols = model.get("category_columns") as { name: string; labels: string[] }[];
        const ci = cols.findIndex((c) => c.name === model.get("active_category"));
        const bytes = Uint8Array.from(atob(model.get("category_codes")), (ch) => ch.charCodeAt(0));
        const codes = new Int32Array(bytes.buffer);
        const counts = new Map<number, number>();
        for (const i of indices) counts.set(codes[ci * n + i]!, (counts.get(codes[ci * n + i]!) ?? 0) + 1);
        const [best] = [...counts].sort((a, b) => b[1] - a[1])[0]!;
        return cols[ci]!.labels[best];
      },
      { indices: sel.point_indices as number[] },
    );
    expect(sel.id).toBe(`${majority} · ${sel.point_indices.length}`);
  });

  test("a name already taken gets a numeric suffix", async ({ page }) => {
    await setModel(page, { selections: [{ id: "type1 · 3", type: "points", point_indices: [0, 1, 2] }] });
    await openCubeAtCentre(page);
    expect(await save(page)).toBe(1);
    expect((await selectionsOf(page)).map((s) => s.id)).toEqual(["type1 · 3", "type1 · 3 (2)"]);
  });

  test("there is no history strip; the saved window is a Selections row with a thumbnail", async ({ page }) => {
    await openCubeAtCentre(page);
    await page.getByTestId("inspect-pill").getByRole("button", { name: "Save window" }).click();
    await expect.poll(async () => (await selectionsOf(page)).length).toBe(1);
    await expect(cubeWindow(page).getByLabel("Inspect history")).toHaveCount(0);
    await openSelectionsDock(page);
    const row = page.getByTestId("selection-row").first();
    await expect(row).toBeVisible();
    await expect(row.getByTestId("selection-thumb")).toBeVisible();
  });

  test("hovering a selection row shows its count, window and category bars", async ({ page }) => {
    await openCubeAtCentre(page);
    await page.getByTestId("inspect-pill").getByRole("button", { name: "Save window" }).click();
    await expect.poll(async () => (await selectionsOf(page)).length).toBe(1);
    await openSelectionsDock(page);
    await page.getByTestId("selection-row").first().hover();
    const card = page.getByTestId("selection-card");
    await expect(card).toBeVisible();
    await expect(card).toContainText("3 cells");
    await expect(card).toContainText("µm");
    await expect(card.getByTestId("selection-card-bar").first()).toBeVisible();
    // A cut through the whole stack is no depth cut; a Z cut shows its range.
    await expect(card).not.toContainText("Depth");
    const [sel] = await selectionsOf(page);
    expect(sel.window.cut).toHaveLength(6);
    const cut = [...sel.window.cut];
    cut[4] = 10;
    cut[5] = 40;
    await setModel(page, { selections: [{ ...sel, window: { ...sel.window, cut } }] });
    await expect(card).toContainText("Depth 10–40 µm");
  });

  test("a lasso row's hover card gives its cells' extent in µm", async ({ page }) => {
    await setModel(page, { selections: [{ id: "picked", type: "points", point_indices: [0, 2] }] });
    await openSelectionsDock(page);
    await selectionRow(page, 0).hover();
    const card = page.getByTestId("selection-card");
    await expect(card).toContainText("2 cells");
    const text = (await card.textContent()) ?? "";
    const m = text.match(/x (-?\d+)–(-?\d+) · y (-?\d+)–(-?\d+) µm/);
    expect(m).not.toBeNull();
    const pts = await page.evaluate(() => (window as any).__landmarksEngine.getPoints() as [number, number][]);
    const [a, b] = [pts[0]!, pts[2]!];
    const want = [Math.min(a[0], b[0]), Math.max(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[1], b[1])];
    m!.slice(1).forEach((v, i) => expect(Math.abs(Number(v) - want[i]!)).toBeLessThanOrEqual(1));
  });

  test("clicking an inspect row restores its window and opens the cube", async ({ page }) => {
    await reloadWith(page, "window=100");
    const box = await openCubeAtCentre(page);
    await page.getByTestId("inspect-pill").getByRole("button", { name: "Save window" }).click();
    await expect.poll(async () => (await selectionsOf(page)).length).toBe(1);
    const saved = (await selectionsOf(page))[0].window;
    await page.keyboard.press("Escape");
    await dragOnMap(page, box, [0.3, 0.3], [0.35, 0.3]);
    await expect(cubeWindow(page)).toBeVisible();
    await page.keyboard.press("Escape");
    await openSelectionsDock(page);
    await page.getByTestId("selection-row").first().click();
    await expect(cubeWindow(page)).toBeVisible();
    await expect.poll(async () => Number(await getModel(page, "inspect_cx"))).toBe(saved.cx);
  });

  test("Esc closes the cube, a second Esc exits Inspect", async ({ page }) => {
    await openCubeAtCentre(page);
    await page.keyboard.press("Escape");
    await expect(cubeWindow(page)).toHaveCount(0);
    await expect(page.getByTestId("inspect-pill")).toHaveAttribute("data-state", "armed");
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("inspect-pill")).toHaveCount(0);
    await expect(page.getByRole("toolbar", { name: "Drawing tools" })).toBeVisible();
  });

  test("with no cube open, Esc in a menu or a panel closes only that, not Inspect", async ({ page }) => {
    await page.getByRole("radio", { name: "Inspect", exact: true }).click();
    // The palette menu sits in Adjust: Esc closes the menu, not the panel.
    await openAdjust(page);
    await adjustPanel(page).getByRole("button", { name: "Palette" }).click();
    await expect(page.getByRole("menu")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("menu")).toHaveCount(0);
    await expect(adjustPanel(page)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(adjustPanel(page)).toHaveCount(0);
    await openCross(page);
    await expect(crossPanel(page)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(crossPanel(page)).toHaveCount(0);
    expect(await getModel(page, "mode")).toBe("inspect");
    await expect(inspectPill(page)).toHaveAttribute("data-state", "armed");
  });

  test("Exit and Esc go back to the tool used before Inspect", async ({ page }) => {
    const tools = page.getByRole("toolbar", { name: "Drawing tools" });
    await tools.getByRole("radio", { name: "Move", exact: true }).click();
    await expect.poll(() => getModel(page, "mode")).toBe("move");
    await openCubeAtCentre(page);
    await inspectPill(page).getByRole("button", { name: "Exit Inspect" }).click();
    await expect.poll(() => getModel(page, "mode")).toBe("move");

    await tools.getByRole("radio", { name: "Probe", exact: true }).click();
    await expect.poll(() => getModel(page, "mode")).toBe("probe");
    await openCubeAtCentre(page);
    await page.keyboard.press("Escape");
    await expect(cubeWindow(page)).toHaveCount(0);
    expect(await getModel(page, "mode")).toBe("inspect");
    await page.keyboard.press("Escape");
    await expect.poll(() => getModel(page, "mode")).toBe("probe");
    await expect(tools.getByRole("radio", { name: "Probe", exact: true })).toHaveAttribute("aria-checked", "true");
  });

  test("the status chip reads Refining while a level loads", async ({ page }) => {
    // Force a coarse-then-fine load with the harness budgets so the chip is observable.
    await reloadWith(page, "budgets=2000,20000");
    await openCubeAtCentre(page);
    const chip = page.getByTestId("inspect-status");
    await expect(chip).toHaveAttribute("data-state", /refining|ready/);
    await expect(chip).toHaveAttribute("data-state", "ready");
    // Exit, re-enter and reopen: the chip starts over and settles again.
    await inspectPill(page).getByRole("button", { name: "Exit Inspect" }).click();
    await expect(chip).toHaveCount(0);
    await openCubeAtCentre(page);
    await expect(chip).toHaveAttribute("data-state", /refining|ready/);
    await expect(chip).toHaveAttribute("data-state", "ready");
  });

  test("a window outside the volume reads as an error on the chip, not Ready", async ({ page }) => {
    await openCubeAtCentre(page);
    const chip = page.getByTestId("inspect-status");
    await expect(chip).toHaveAttribute("data-state", "ready");
    // Python moves the window off the toy volume (0..256 µm).
    await setModel(page, { inspect_cx: 10000, inspect_cy: 10000 });
    await expect(cubeWindow(page).getByText("Inspect window is outside the volume")).toBeVisible();
    await expect(chip).toHaveAttribute("data-state", "error");
    await expect(chip).toHaveText("Outside the volume");
    // Back inside: the window loads and the chip settles again.
    await setModel(page, { inspect_cx: 128, inspect_cy: 128 });
    await expect(chip).toHaveAttribute("data-state", "ready");
  });

  test("keyboard: the swap keeps focus in the widget, and Esc from focus alone leaves Inspect", async ({ page }) => {
    // No pointer over the widget anywhere in this test: only focus puts keys "in" it.
    await page.mouse.move(0, 0);
    const tools = page.getByRole("toolbar", { name: "Drawing tools" });
    await tools.getByRole("radio", { name: "Inspect", exact: true }).focus();
    await page.keyboard.press("Space");
    await expect(inspectPill(page)).toHaveAttribute("data-state", "armed");
    // Focus moved from the leaving tool pill to the Inspect pill's Exit.
    await expect.poll(() => focused(page, "inspect-pill")).toEqual({ label: "Exit Inspect", inside: true });
    // Enter on Exit: back to the tool used before, focused on its radio.
    await page.keyboard.press("Enter");
    await expect(inspectPill(page)).toHaveCount(0);
    await expect.poll(() => getModel(page, "mode")).toBe("select");
    await expect.poll(() => focused(page, "Drawing tools")).toEqual({ label: "Select", inside: true });

    // Again, leaving with Esc (no cube open: one Esc leaves Inspect).
    await tools.getByRole("radio", { name: "Inspect", exact: true }).focus();
    await page.keyboard.press("Space");
    await expect.poll(() => focused(page, "inspect-pill")).toEqual({ label: "Exit Inspect", inside: true });
    await page.keyboard.press("Escape");
    await expect(inspectPill(page)).toHaveCount(0);
    await expect.poll(() => getModel(page, "mode")).toBe("select");
    await expect.poll(() => focused(page, "Drawing tools")).toEqual({ label: "Select", inside: true });
    // A second Esc stays harmless in the restored tool.
    await page.keyboard.press("Escape");
    expect(await getModel(page, "mode")).toBe("select");
  });

  test("the Inspect toolbar shows before a window is placed; cut sliders wait for ranges without a crash", async ({
    page,
  }) => {
    await page.getByRole("radio", { name: "Inspect", exact: true }).click();
    const bar = page.getByTestId("context-inspect-toolbar");
    await expect(bar).toBeVisible();
    await expect(cubeWindow(page)).toHaveCount(0);

    // Cuts need the dock's bounds: a placeholder, not a slider with no range.
    await openCross(page);
    const cuts = page.getByTestId("context-cube-cuts");
    await expect(cuts).toContainText("Loading volume");
    await expect(cuts.getByRole("slider")).toHaveCount(0);
    await page.keyboard.press("Escape");

    // The Show switches live in the Adjust panel, not on the bar.
    await expect(bar.getByRole("switch")).toHaveCount(0);

    // The camera does not need the cube open (nor do Adjust's projections and palette).
    await bar.getByRole("radio", { name: "Top view" }).click();
    await expect(bar.getByRole("radio", { name: "Top view" })).toHaveAttribute("aria-checked", "true");
  });

  test("a palette change before placing reaches the hover preview, then the dock", async ({ page }) => {
    await page.getByRole("radio", { name: "Inspect", exact: true }).click();
    // The palette lives in Adjust, which opens before any window is placed.
    await openAdjust(page);
    await adjustPanel(page).getByRole("button", { name: "Palette" }).click();
    await page.getByRole("menuitemradio", { name: "viridis" }).click();
    await page.keyboard.press("Escape");
    await expect(adjustPanel(page)).toHaveCount(0);

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
    await expect(inspectPill(page).getByText("300 µm", { exact: true })).toBeVisible();
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
    await openCross(page);
    const zHi = page.getByRole("slider", { name: "Z cut" }).nth(1);
    await zHi.focus();
    await page.keyboard.press("Shift+ArrowLeft");
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
    // The new entry's Selections row is the current one.
    await expect(selectionRow(page, 0)).toHaveAttribute("aria-current", "true");
  });

  test("the dock's Save adds one selection and row, then reads Saved until the window moves", async ({ page }) => {
    await reloadWith(page, "window=100");
    const box = await openCubeAtCentre(page);
    const rows = page.getByTestId("selection-row");
    // A click only opens the dock.
    expect(await selectionsOf(page)).toEqual([]);
    await expect(saveButton(page)).toBeEnabled();
    await expect(saveButton(page)).toHaveText("Save");
    await expect(saveButton(page)).toHaveAttribute("data-saved", "false");

    await saveButton(page).click();
    await expect.poll(async () => (await selectionsOf(page)).length).toBe(1);
    await expect(rows).toHaveCount(1);
    await expect(saveButton(page)).toHaveText("Saved");
    await expect(saveButton(page)).toBeDisabled();
    await expect(saveButton(page)).toHaveAttribute("data-saved", "true");

    // Moving the live window re-enables Save; a second Save adds a second entry.
    await moveWindow(page, box, [0.3, 0.4], [0.3, 0.4]);
    await expect(saveButton(page)).toHaveText("Save");
    await expect(saveButton(page)).toBeEnabled();
    expect(await save(page)).toBe(1);
    await expect(rows).toHaveCount(2);

    // A row restores its window, which is saved.
    await moveWindow(page, box, [0.6, 0.6], [0.6, 0.6]);
    await expect(saveButton(page)).toBeEnabled();
    await openSelectionsDock(page);
    await selectionRow(page, 0).click();
    await expect(saveButton(page)).toHaveText("Saved");
    expect(await selectionsOf(page)).toHaveLength(2);
  });

  test("Save right after a move stores the new window's cut", async ({ page }) => {
    await reloadWith(page, "window=100");
    const box = await openCubeAtCentre(page);
    await openCross(page);
    const xHi = page.getByRole("slider", { name: "X cut" }).nth(1);
    await xHi.focus();
    await page.keyboard.press("Shift+ArrowLeft");
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
    await moveWindow(page, box, [0.5, 0.5], [0.56, 0.52]);
    await expect.poll(async () => Number(await getModel(page, "inspect_cx"))).toBeGreaterThan(saved.window.cx);
    await moveWindow(page, box, [0.3, 0.4], [0.3, 0.4]);
    await page.waitForTimeout(600); // past the cut's settle commit: nothing may reach the entry
    expect(await selectionsOf(page)).toEqual([saved]);
  });

  test("a release over the chrome ends the press; Esc, a lost release or blur end it too", async ({ page }) => {
    const box = await openCubeAtCentre(page);
    const cx = () => getModel(page, "inspect_cx").then(Number);
    // The map is covered while the cube is open: close it, then press on the map.
    await page.keyboard.press("Escape");
    await expect(cubeWindow(page)).toHaveCount(0);
    // The top pill (the Inspect pill in Inspect) sits over the map and is always on screen.
    const pill = (await inspectPill(page).getByText("Inspect", { exact: true }).boundingBox())!;
    const overChrome = { x: pill.x + pill.width / 2, y: pill.y + pill.height / 2 };
    // Released over the chrome: the window stays where the drag left it, saved.
    await page.evaluate(() => {
      const model = (window as any).__landmarksModel;
      model.on("change:inspect_cx", () => ((window as any).__savedCx = model.get("inspect_cx")));
    });
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
    await page.mouse.down();
    await page.mouse.move(overChrome.x, overChrome.y, { steps: 6 });
    await page.mouse.up();
    const released = await cx();
    expect(await page.evaluate(() => (window as any).__savedCx)).toBe(released);
    // The release opens the cube wherever it lands; nothing is saved as a selection.
    await expect(cubeWindow(page)).toBeVisible();
    await page.mouse.move(overChrome.x - 40, overChrome.y + 30, { steps: 3 });
    expect(await cx()).toBe(released);
    expect(await selectionsOf(page)).toEqual([]);

    // Esc between press and release: later moves drag nothing, and the cube does not open.
    await page.keyboard.press("Escape");
    await expect(cubeWindow(page)).toHaveCount(0);
    await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.7);
    await page.mouse.down();
    await page.keyboard.press("Escape");
    const escaped = await cx();
    await page.mouse.move(box.x + box.width * 0.25, box.y + box.height * 0.7, { steps: 3 });
    await page.mouse.up();
    expect(await cx()).toBe(escaped);
    // That Esc only ended the press: still in Inspect.
    expect(await getModel(page, "mode")).toBe("inspect");
    await expect(inspectPill(page)).toHaveAttribute("data-state", "armed");
    // An open on release would be async, so this passes at once; the 300 ms-guarded
    // check at the end of this test covers "no cube" for the lost-release and blur cases.
    await page.waitForTimeout(300); // a negative check: outlast the render an open would cause
    await expect(cubeWindow(page)).toHaveCount(0);

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
    // Neither a lost release nor a blur is a release: the cube stays closed.
    await page.waitForTimeout(300); // a negative check: outlast the render an open would cause
    await expect(cubeWindow(page)).toHaveCount(0);
  });

  test("a drag on the map slides the window; the cube reopens on release at the new window", async ({ page }) => {
    await reloadWith(page, "window=100");
    const box = await openCubeAtCentre(page);
    const view = cubeWindow(page).locator(".volume-cube__view");
    await expect(view).toHaveAttribute("data-pan", "0,0");
    const cx0 = Number(await getModel(page, "inspect_cx"));
    // The map is covered while the cube is open: close it, then drag on the map.
    await page.keyboard.press("Escape");
    await expect(cubeWindow(page)).toHaveCount(0);
    await dragOnMap(page, box, [0.5, 0.5], [0.56, 0.5]);
    await expect.poll(async () => Number(await getModel(page, "inspect_cx"))).toBeGreaterThan(cx0);
    // Released: the cube reopens, loads the new window, and settles with no residual pan.
    await expect(cubeWindow(page)).toBeVisible();
    await expect(view).toHaveAttribute("data-refining", "false");
    await expect(view).not.toHaveAttribute("data-level", "-1");
    await expect(view).toHaveAttribute("data-pan", "0,0");
    const placed = await page.evaluate(() => (window as any).__landmarksEngine.getInspectOverlay().placed);
    expect(placed[0]).toBeCloseTo(Number(await getModel(page, "inspect_cx")), 3);
    expect(placed[0]).toBeGreaterThan(cx0);

    await page.keyboard.press("Escape");
    await expect(cubeWindow(page)).toHaveCount(0);
    expect((await page.evaluate(() => (window as any).__landmarksEngine.getInspectOverlay())).hover).toBeNull();
  });

  test("a quick drag saves the final window position on release", async ({ page }) => {
    const box = await openCubeAtCentre(page);
    const cx0 = Number(await getModel(page, "inspect_cx"));
    // The map is covered while the cube is open: close it so the press lands on the map.
    await page.keyboard.press("Escape");
    await expect(cubeWindow(page)).toHaveCount(0);
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
    await expect(cubeWindow(page)).toBeVisible();
  });

  test("shift-drag in the cube pans the live window; plain drag only orbits", async ({ page }) => {
    await reloadWith(page, "window=100");
    await openCubeAtCentre(page);
    const view = cubeWindow(page).locator(".volume-cube__view");
    const axes = view.getByLabel("Axes");
    await expect(view).toHaveAttribute("data-refining", "false");
    const cx0 = Number(await getModel(page, "inspect_cx"));
    const axes0 = await axes.getAttribute("data-axes");
    // Plain drag: orbit, the window stays.
    await dragCube(page, view, 60, 0, {});
    await expect(axes).not.toHaveAttribute("data-axes", axes0!);
    expect(Number(await getModel(page, "inspect_cx"))).toBe(cx0);
    // Shift-drag right: the tissue follows the pointer, so the window centre moves left (top-down).
    await page.getByRole("radio", { name: "Top view" }).click();
    await expect(axes).toHaveAttribute("data-axes", "0,-90,0");
    const zoom = await view.getAttribute("data-zoom");
    const chip = page.getByTestId("inspect-status");
    await expect(chip).toHaveAttribute("data-state", "ready");
    await recordStates(page, '[data-testid="inspect-status"]');
    await dragCube(page, view, 80, 0, { shift: true });
    await expect.poll(async () => Number(await getModel(page, "inspect_cx"))).toBeLessThan(cx0);
    // A pan never orbits.
    await expect(axes).toHaveAttribute("data-axes", "0,-90,0");
    // The map's square follows.
    const placed = await page.evaluate(() => (window as any).__landmarksEngine.getInspectOverlay().placed);
    expect(placed[0]).toBeCloseTo(Number(await getModel(page, "inspect_cx")), 1);
    // The cube settles at the new window. The chip read Refining while the moved window was stale.
    await expect(view).toHaveAttribute("data-pan", "0,0");
    await expect(view).toHaveAttribute("data-refining", "false");
    await expect(chip).toHaveAttribute("data-state", "ready");
    expect(await recordedStates(page)).toContain("refining");
    expect(await view.getAttribute("data-pitch")).toBe("90");
    expect(await view.getAttribute("data-zoom")).toBe(zoom);
  });

  test("a pan saves its last move on release, and when Esc closes the cube mid-drag", async ({ page }) => {
    await reloadWith(page, "window=100");
    await openCubeAtCentre(page);
    const view = cubeWindow(page).locator(".volume-cube__view");
    await page.getByRole("radio", { name: "Top view" }).click();
    await expect(view).toHaveAttribute("data-refining", "false");
    const cx0 = Number(await getModel(page, "inspect_cx"));
    // Record inspect_cx as saved (change events fire on save_changes only).
    await page.evaluate(() => {
      const model = (window as any).__landmarksModel;
      model.on("change:inspect_cx", () => ((window as any).__savedCx = model.get("inspect_cx")));
    });
    // Shift-press, two moves (and a release) in one task: the second move lands inside the 40 ms save throttle.
    const shiftDrag = (release: boolean) =>
      shiftPointer(page, [
        ["pointerdown", 0, 1],
        ["pointermove", 20, 1],
        ["pointermove", 40, 1],
        ...(release ? [["pointerup", 40, 0] as PointerStep] : []),
      ]);

    const released = await shiftDrag(true);
    expect(released.live).toBeLessThan(cx0);
    expect(released.saved).toBe(released.live);

    // Esc between the moves and the release closes the cube: the pan still saves where it got to.
    const escaped = await shiftDrag(false);
    expect(escaped.live).toBeLessThan(released.live);
    expect(escaped.saved).not.toBe(escaped.live);
    await page.keyboard.press("Escape");
    await expect(cubeWindow(page)).toHaveCount(0);
    expect(await page.evaluate(() => (window as any).__savedCx)).toBe(escaped.live);
    expect(Number(await getModel(page, "inspect_cx"))).toBe(escaped.live);
  });

  test("a pan follows only its own pointer and ends on a move with no button held", async ({ page }) => {
    await reloadWith(page, "window=100");
    await openCubeAtCentre(page);
    const view = cubeWindow(page).locator(".volume-cube__view");
    await page.getByRole("radio", { name: "Top view" }).click();
    await expect(view).toHaveAttribute("data-refining", "false");
    const pressed = await shiftPointer(page, [
      ["pointerdown", 0, 1],
      ["pointermove", 30, 1],
    ]);
    // Another pointer's move and release leave the pan alone.
    const other = await shiftPointer(page, [
      ["pointermove", 90, 1, 2],
      ["pointerup", 90, 0, 2],
    ]);
    expect(other.live).toBe(pressed.live);
    await expect(view).toHaveAttribute("data-panning", "true");
    // A move with no button held is a release lost outside the page: the pan ends, hovering pans nothing.
    const lost = await shiftPointer(page, [["pointermove", 40, 0]]);
    await expect(view).toHaveAttribute("data-panning", "false");
    const hover = await shiftPointer(page, [["pointermove", 120, 1]]);
    expect(hover.live).toBe(lost.live);
  });

  test("the Move tool makes a plain drag pan; the distance scales with the drag", async ({ page }) => {
    test.slow(Boolean(process.env.CI), "many renders on the CI software GL runner");
    await reloadWith(page, "window=100");
    await openCubeAtCentre(page);
    const view = cubeWindow(page).locator(".volume-cube__view");
    await page.getByRole("radio", { name: "Top view" }).click();
    await page.getByRole("button", { name: "Move" }).click();
    await expect(page.getByRole("button", { name: "Move" })).toHaveAttribute("aria-pressed", "true");
    await expect(view).toHaveAttribute("data-pan-mode", "true");
    const cx0 = Number(await getModel(page, "inspect_cx"));
    const cy0 = Number(await getModel(page, "inspect_cy"));
    await dragCube(page, view, 40, 0, {});
    await expect.poll(async () => Number(await getModel(page, "inspect_cx"))).toBeLessThan(cx0);
    const d1 = cx0 - Number(await getModel(page, "inspect_cx"));
    await dragCube(page, view, 80, 0, {});
    const d2 = cx0 - d1 - Number(await getModel(page, "inspect_cx"));
    expect(d2 / d1).toBeGreaterThan(1.7);
    expect(d2 / d1).toBeLessThan(2.3);
    // A horizontal drag leaves y; dragging down moves the window up the map (y decreases).
    expect(Number(await getModel(page, "inspect_cy"))).toBe(cy0);
    await dragCube(page, view, 0, 40, {});
    await expect.poll(async () => Number(await getModel(page, "inspect_cy"))).toBeLessThan(cy0);
    // Never an orbit while Move is on.
    await expect(view.getByLabel("Axes")).toHaveAttribute("data-axes", "0,-90,0");
    // Closing the cube turns Move off.
    await page.keyboard.press("Escape");
    await expect(cubeWindow(page)).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Move" })).toHaveAttribute("aria-pressed", "false");
  });

  test("panning clamps the window centre to the volume", async ({ page }) => {
    test.slow(Boolean(process.env.CI), "many renders on the CI software GL runner");
    await reloadWith(page, "window=100");
    await openCubeAtCentre(page);
    const view = cubeWindow(page).locator(".volume-cube__view");
    await page.getByRole("radio", { name: "Top view" }).click();
    await page.getByRole("button", { name: "Move" }).click();
    // Drag right until the window would leave the toy volume (0..256 µm, origin 0): it stops at x = 0.
    for (let i = 0; i < 12; i++) await dragCube(page, view, 250, 0, {});
    await expect.poll(async () => Number(await getModel(page, "inspect_cx"))).toBe(0);
    const cy = Number(await getModel(page, "inspect_cy"));
    expect(cy).toBeGreaterThanOrEqual(0);
    expect(cy).toBeLessThanOrEqual(256);
  });

  test("the bottom bar holds the view options; Adjust and Cross-section are separate panels", async ({ page }) => {
    await openCubeAtCentre(page);
    const bar = page.getByTestId("context-inspect-toolbar");
    await expect(bar.getByRole("button", { name: "Move" })).toBeVisible();
    await expect(bar.getByRole("button", { name: "Reset view" })).toBeVisible();
    await expect(bar.getByRole("button", { name: "Adjust" })).toBeVisible();
    await expect(bar.getByRole("button", { name: "Cross-section" })).toBeVisible();
    // The projection and palette moved into Adjust.
    await expect(bar.getByLabel("Projection")).toHaveCount(0);
    await expect(bar.getByRole("button", { name: "Palette" })).toHaveCount(0);
    await bar.getByRole("button", { name: "Cross-section" }).click();
    await expect(page.getByTestId("context-cube-cross").getByTestId("context-cube-cuts")).toBeVisible();
    await expect(page.getByTestId("context-cube-adjust")).toHaveCount(0); // one panel at a time
  });

  test("Adjust has an Image and a Labels column with independent projections", async ({ page }) => {
    await openCubeAtCentre(page);
    const view = cubeWindow(page).locator(".volume-cube__view");
    await openAdjust(page);
    const panel = page.getByTestId("context-cube-adjust");
    await panel.getByTestId("adjust-image").getByRole("radio", { name: "MIP" }).click();
    await expect(view).toHaveAttribute("data-image-mode", "mip");
    await expect(view).toHaveAttribute("data-label-mode", "additive");
    await panel.getByTestId("adjust-labels").getByRole("radio", { name: "MIP" }).click();
    await expect(view).toHaveAttribute("data-label-mode", "mip");
    await panel.getByTestId("adjust-image").getByRole("radio", { name: "Additive" }).click();
    await expect(view).toHaveAttribute("data-image-mode", "additive");
    await expect(view).toHaveAttribute("data-label-mode", "mip");
    await expect(panel.getByTestId("adjust-image").getByRole("button", { name: "Palette" })).toBeVisible();
  });

  test("panels stay short enough not to cover the cube", async ({ page }) => {
    await page.setViewportSize({ width: 900, height: 520 });
    // The harness widget keeps its 820 px height in a short window: drag its
    // height handle up so the widget fits the window (the handle caps it at 90%).
    const handle = page.getByRole("button", { name: "Resize height" });
    await handle.scrollIntoViewIfNeeded();
    const h = (await handle.boundingBox())!;
    await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
    await page.mouse.down();
    await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2 - 400, { steps: 5 });
    await page.mouse.up();
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect.poll(async () => (await page.locator(".landmarks__body").first().boundingBox())!.height).toBeLessThan(
      520,
    );
    await openCubeAtCentre(page);
    const widget = (await page.locator(".landmarks__body").first().boundingBox())!;
    await openAdjust(page);
    const adjust = (await page.getByTestId("context-cube-adjust").boundingBox())!;
    expect(adjust.height).toBeLessThanOrEqual(widget.height * 0.5);
    await page.keyboard.press("Escape");
    await page.getByTestId("context-inspect-toolbar").getByRole("button", { name: "Cross-section" }).click();
    const cross = (await page.getByTestId("context-cube-cross").boundingBox())!;
    expect(cross.height).toBeLessThanOrEqual(widget.height * 0.5);
  });

  test("the projection toggles set the image and label modes", async ({ page }) => {
    await openCubeAtCentre(page);
    const view = cubeWindow(page).locator(".volume-cube__view");
    await expect(view).toHaveAttribute("data-image-mode", "additive");
    await expect(view).toHaveAttribute("data-label-mode", "additive");
    await openAdjust(page);
    const image = page.getByLabel("Image projection", { exact: true });
    const labels = page.getByLabel("Labels projection", { exact: true });
    await expect(image.getByRole("radio", { name: "Additive" })).toHaveAttribute("aria-checked", "true");
    await expect(labels.getByRole("radio", { name: "Additive" })).toHaveAttribute("aria-checked", "true");
    await image.getByRole("radio", { name: "MIP" }).click();
    await labels.getByRole("radio", { name: "MIP" }).click();
    await expect(view).toHaveAttribute("data-image-mode", "mip");
    await expect(view).toHaveAttribute("data-label-mode", "mip");
    await expect(image.getByRole("radio", { name: "MIP" })).toHaveAttribute("aria-checked", "true");
    await expect(labels.getByRole("radio", { name: "MIP" })).toHaveAttribute("aria-checked", "true");
  });

  test("inspect toolbar: presets, MIP, palette, alpha/gamma, committed Z cut", async ({ page }) => {
    test.slow(Boolean(process.env.CI), "many renders on the CI software GL runner");
    await openCubeAtCentre(page);
    const bar = page.getByTestId("context-inspect-toolbar");
    const view = cubeWindow(page).locator(".volume-cube__view");
    // The image alone, so the uniform-only check below has one channel to count.
    await setShow(page, "Show labels", false);
    await expect(view).toHaveAttribute("data-channels", "1");

    await bar.getByRole("radio", { name: "Top view" }).click();
    await expect(bar.getByRole("radio", { name: "Top view" })).toHaveAttribute("aria-checked", "true");
    const topZoom = await view.getAttribute("data-zoom");
    await bar.getByRole("radio", { name: "Oblique view" }).click();
    await expect(bar.getByRole("radio", { name: "Oblique view" })).toHaveAttribute("aria-checked", "true");
    // In the dock a preset also frames the window as that preset's home view.
    await expect(view).not.toHaveAttribute("data-zoom", topZoom!);

    await openAdjust(page);
    const image = page.getByTestId("adjust-image");
    await image.getByRole("radio", { name: "MIP" }).click();
    await expect(view).toHaveAttribute("data-image-mode", "mip");

    await image.getByRole("button", { name: "Palette" }).click();
    await page.getByRole("menuitemradio", { name: "viridis" }).click();
    await expect(view).toHaveAttribute("data-palette", "viridis");

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

    await openCross(page);
    const zHi = page.getByRole("slider", { name: "Z cut" }).nth(1);
    await expect(zHi).toHaveAttribute("aria-valuenow", "64");
    await zHi.focus();
    await page.keyboard.press("Shift+ArrowLeft");
    await expect.poll(async () => ((await getModel(page, "volume_cut")) as number[])[5]).toBe(54);
  });

  test("Adjust: Image and Labels sections, each with a Reset, and Reset all; Cross-section has its own Reset", async ({
    page,
  }) => {
    test.slow(Boolean(process.env.CI), "many renders on the CI software GL runner");
    await openCubeAtCentre(page);
    const view = cubeWindow(page).locator(".volume-cube__view");
    await openAdjust(page);
    const panel = adjustPanel(page);
    await expect(panel.getByRole("heading")).toHaveText(["Image", "Labels"]);
    // Each of Image and Labels opens with its Show switch, and both open on.
    const showImage = panel.getByRole("switch", { name: "Show image" });
    const showLabelsSwitch = panel.getByRole("switch", { name: "Show labels" });
    await expect(panel.getByRole("switch")).toHaveCount(2);
    await expect(showImage).toBeChecked();
    await expect(showLabelsSwitch).toBeChecked();
    const slider = (name: string, n = 0) => page.getByRole("slider", { name }).nth(n);
    const nudge = async (name: string, key: string, n = 0) => {
      await slider(name, n).focus();
      await page.keyboard.press(`Shift+${key}`);
    };
    const now = async (name: string, n = 0) => Number(await slider(name, n).getAttribute("aria-valuenow"));
    const adjustValues = async () => ({
      image: [await now("Contrast", 0), await now("Contrast", 1), await now("Image alpha"), await now("Image gamma")],
      labels: [await now("Label alpha")],
      // Each layer's projection is reset with its section.
      modes: [await view.getAttribute("data-image-mode"), await view.getAttribute("data-label-mode")],
    });
    const cutValues = async () => [await now("X cut", 1), await now("Y cut", 0), await now("Z cut", 1)];
    // Defaults: the volume's contrast_limits, image alpha 1, gamma 1 (0 on its log2 scale), label alpha 0.6 (the shells' default), both Additive.
    const initial = await adjustValues();
    expect(initial.image).toEqual([0, 48, 1, 0]);
    expect(initial.labels).toEqual([0.6]);
    expect(initial.modes).toEqual(["additive", "additive"]);
    // All sliders are one width, in both panels.
    const widthsOf = (region: Locator) =>
      region.locator(".landmarks-slider-control").evaluateAll((els) =>
        els.map((el) => Math.round(el.getBoundingClientRect().width)),
      );
    const widths = await widthsOf(panel);

    const changeAdjust = async () => {
      await nudge("Contrast", "ArrowLeft", 1);
      await nudge("Image alpha", "ArrowLeft");
      await nudge("Image gamma", "ArrowRight");
      await nudge("Label alpha", "ArrowLeft");
      await panel.getByTestId("adjust-image").getByRole("radio", { name: "MIP" }).click();
      await panel.getByTestId("adjust-labels").getByRole("radio", { name: "MIP" }).click();
      const v = await adjustValues();
      expect(v.image).not.toEqual(initial.image);
      expect(v.labels).not.toEqual(initial.labels);
      await expect(view).toHaveAttribute("data-image-mode", "mip");
      await expect(view).toHaveAttribute("data-label-mode", "mip");
    };

    await changeAdjust();
    // Resets restore sliders and projection only: the Show switches stay as the user set them.
    await showImage.click();
    await showLabelsSwitch.click();
    await panel.getByRole("button", { name: "Reset image" }).click();
    await expect(view).toHaveAttribute("data-image-mode", "additive");
    let v = await adjustValues();
    expect(v.image).toEqual(initial.image);
    expect(v.labels).not.toEqual(initial.labels);
    expect(v.modes).toEqual(["additive", "mip"]);
    await expect(showImage).not.toBeChecked();
    await panel.getByRole("button", { name: "Reset labels" }).click();
    await expect(view).toHaveAttribute("data-label-mode", "additive");
    v = await adjustValues();
    expect(v.labels).toEqual(initial.labels);
    await expect(showLabelsSwitch).not.toBeChecked();

    await changeAdjust();
    await panel.getByRole("button", { name: "Reset all" }).click();
    await expect(view).toHaveAttribute("data-label-mode", "additive");
    expect(await adjustValues()).toEqual(initial);
    await expect(showImage).not.toBeChecked();
    await expect(showLabelsSwitch).not.toBeChecked();
    await expect(view).toHaveAttribute("data-image", "off");

    // Cross-section: its sliders and its own Reset, which opens every cut and
    // commits it, like a slider release.
    await openCross(page);
    const cross = crossPanel(page);
    await expect(panel).toHaveCount(0);
    await expect(cross.getByRole("heading")).toHaveText(["Cross-section"]);
    const initialCuts = await cutValues();
    expect(initialCuts[2]).toBe(64);
    const crossWidths = await widthsOf(cross);
    expect(new Set([...widths, ...crossWidths]).size).toBe(1);
    expect(widths[0]).toBeGreaterThanOrEqual(150);
    expect(widths[0]).toBeLessThanOrEqual(170);
    await nudge("X cut", "ArrowLeft", 1);
    await nudge("Y cut", "ArrowRight", 0);
    await nudge("Z cut", "ArrowLeft", 1);
    expect(await cutValues()).not.toEqual(initialCuts);
    await expect.poll(async () => (await cutOf(page))[5]).toBe(54);
    await cross.getByRole("button", { name: "Reset cross-section" }).click();
    expect(await cutValues()).toEqual(initialCuts);
    await expect.poll(async () => cutOf(page)).toEqual([0, 256, 0, 256, 0, 64]);
    // Adjust's Reset all leaves the cuts alone: it resets what its panel shows.
    await nudge("Z cut", "ArrowLeft", 1);
    await expect.poll(async () => (await cutOf(page))[5]).toBe(54);
    await openAdjust(page);
    await panel.getByRole("button", { name: "Reset all" }).click();
    await page.waitForTimeout(300); // a negative check: no cut write follows
    expect((await cutOf(page))[5]).toBe(54);
  });

  test("panel triggers' a11y; Esc closes only the open panel, not the cube", async ({ page }) => {
    await openCubeAtCentre(page);
    const bar = page.getByTestId("context-inspect-toolbar");
    for (const [name, region] of [
      ["Adjust", adjustPanel(page)],
      ["Cross-section", crossPanel(page)],
    ] as const) {
      const trigger = bar.getByRole("button", { name, exact: true });
      await expect(trigger).toHaveAttribute("aria-haspopup", "dialog");
      await expect(trigger).toHaveAttribute("aria-expanded", "false");

      await trigger.click();
      await expect(trigger).toHaveAttribute("aria-expanded", "true");
      // The panel is the one region named after its trigger.
      const named = page.getByRole("region", { name, exact: true });
      await expect(named).toHaveCount(1);
      const panel = region.and(named);
      await expect(panel).toBeVisible();

      await page.keyboard.press("Escape");
      await expect(panel).toHaveCount(0);
      await expect(trigger).toHaveAttribute("aria-expanded", "false");
      await expect(cubeWindow(page)).toBeVisible();
    }
    // One at a time: opening the other panel closes the first.
    await openAdjust(page);
    await openCross(page);
    await expect(adjustPanel(page)).toHaveCount(0);
    await expect(bar.getByRole("button", { name: "Adjust", exact: true })).toHaveAttribute("aria-expanded", "false");
    await expect(crossPanel(page)).toBeVisible();
  });

  test("partial X and Y cuts keep their place in a moved window; open edges stay open", async ({ page }) => {
    test.slow(Boolean(process.env.CI), "many renders on the CI software GL runner");
    await reloadWith(page, "window=100");
    const box = await openCubeAtCentre(page);
    await openCross(page);

    // X: trim the high edge, then move the window right.
    const xHi = page.getByRole("slider", { name: "X cut" }).nth(1);
    await xHi.focus();
    await page.keyboard.press("Shift+ArrowLeft");
    const cx0 = Number(await getModel(page, "inspect_cx"));
    const size = Number(await getModel(page, "inspect_size_um"));
    const trim = await cutTrim(page, 1, cx0 + size / 2);
    // The untouched low edge is open: written as the volume's edge, not the window's.
    expect(await cutOf(page)).toEqual([0, cx0 + size / 2 - trim, 0, 256, 0, 64].map((v) => expect.closeTo(v, 3)));

    await moveWindow(page, box, [0.5, 0.5], [0.55, 0.5]);
    await openCross(page); // closed by the Esc that cleared the way to the map
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
    await page.keyboard.press("Shift+ArrowRight");
    const cy0 = Number(await getModel(page, "inspect_cy"));
    const yTrim = await cutTrim(page, 2, cy0 - size / 2);
    expect((await cutOf(page))[3]).toBe(256);

    await moveWindow(page, box, [0.5, 0.5], [0.5, 0.44]);
    await openCross(page);
    await expect.poll(async () => Number(await getModel(page, "inspect_cy"))).not.toBeCloseTo(cy0, 1);
    const cy1 = Number(await getModel(page, "inspect_cy"));
    await expect.poll(async () => (await cutOf(page))[2]).toBeCloseTo(cy1 - size / 2 + yTrim, 3);
    expect((await cutOf(page))[3]).toBe(256);
  });

  test("Python's inspect and volume_cut writes are followed, never written back", async ({ page }) => {
    await reloadWith(page, "window=100");
    await openCubeAtCentre(page);
    await openCross(page);
    const x = page.getByRole("slider", { name: "X cut" });
    await x.nth(1).focus();
    await page.keyboard.press("Shift+ArrowLeft");
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
    await openCross(page);
    const zHi = page.getByRole("slider", { name: "Z cut" }).nth(1);
    await zHi.focus();
    await page.keyboard.press("Shift+ArrowLeft");
    await expect.poll(async () => cutOf(page)).toEqual([0, 256, 0, 256, 0, 54]);

    // Zoom out so a click lands a window that the volume's left edge clamps.
    const zoom = () => page.evaluate(() => (window as any).__landmarksEngine.getViewState().zoom as number);
    const zoom0 = await zoom();
    await page.evaluate(() => (window as any).__landmarksEngine.zoomBy(-2, { animate: false }));
    await expect.poll(zoom).toBeLessThan(zoom0);
    await moveWindow(page, box, [0.25, 0.5], [0.25, 0.5]);
    await openCross(page);
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

  test("leaving Inspect closes the cube and frees the map; Esc from its chrome closes it", async ({ page }) => {
    const box = await openCubeAtCentre(page);
    // The tool pill is swapped out in Inspect: Exit leaves it.
    await inspectPill(page).getByRole("button", { name: "Exit Inspect" }).click();
    await expect(cubeWindow(page)).toHaveCount(0);
    await expect.poll(() => getModel(page, "mode")).toBe("select");
    await expect(page.getByTestId("context-inspect-toolbar")).toHaveCount(0);
    // The map is the top hit again: a click in the new tool reaches the map, not a cube.
    const centre: [number, number] = [box.x + box.width * 0.5, box.y + box.height * 0.5];
    const hitsMap = () =>
      page.evaluate(([x, y]) => Boolean(document.elementFromPoint(x, y)?.closest(".landmarks__plot-host")), centre);
    expect(await hitsMap()).toBe(true);
    // Back in Inspect the cube stays closed until the next click.
    await page.getByRole("radio", { name: "Inspect", exact: true }).click();
    await expect(cubeWindow(page)).toHaveCount(0);
    expect(await hitsMap()).toBe(true);

    // Esc with focus in the Inspect toolbar: closes the cube; a second one there exits Inspect.
    await page.mouse.click(...centre);
    await expect(cubeWindow(page)).toBeVisible();
    await page.getByTestId("context-inspect-toolbar").getByRole("radio", { name: "Top view" }).click();
    await page.keyboard.press("Escape");
    await expect(cubeWindow(page)).toHaveCount(0);
    await expect(inspectPill(page)).toHaveAttribute("data-state", "armed");
    await page.keyboard.press("Escape");
    await expect(inspectPill(page)).toHaveCount(0);
    await expect.poll(() => getModel(page, "mode")).toBe("select");
    await page.getByRole("radio", { name: "Inspect", exact: true }).click();

    // Esc after clicking into the cube window.
    await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.5);
    await expect(cubeWindow(page)).toBeVisible();
    await cubeWindow(page).locator(".volume-cube__view").click({ position: { x: 12, y: 12 } });
    await page.keyboard.press("Escape");
    await expect(cubeWindow(page)).toHaveCount(0);
    await expect(inspectPill(page)).toHaveAttribute("data-state", "armed");

    // Leaving Inspect any other way (here Python sets the tool) closes the cube too.
    await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.5);
    await expect(cubeWindow(page)).toBeVisible();
    await setModel(page, { mode: "select" });
    await expect(cubeWindow(page)).toHaveCount(0);
    await expect(inspectPill(page)).toHaveCount(0);
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

    await inspectPill(page).getByRole("button", { name: "Exit Inspect" }).click();
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
    // With no cube open, Esc leaves Inspect (here with focus on the peek tab).
    await page.keyboard.press("Escape");
    await expect(inspectPill(page)).toHaveCount(0);
    await page.getByRole("radio", { name: "Move", exact: true }).click();
    await expect.poll(() => getModel(page, "mode")).toBe("move");
    await expect(left).toHaveAttribute("data-collapsed", "false");
    await expect(right).toHaveAttribute("data-collapsed", "true");
  });

  test("peek tabs and docks float over the open cube; focusing a category there recolours it", async ({ page }) => {
    await openCubeAtCentre(page, { at: [130, 170] });
    const view = cubeWindow(page).locator(".volume-cube__view");
    await expect(view).toHaveAttribute("data-highlight", "2");
    const right = page.locator(".landmarks__chrome-dock--right");
    await expect(right).toHaveAttribute("data-collapsed", "true");
    // Both peek tabs sit over the cube, clear of the Inspect pill's Save and Exit
    // (a click is refused when another element would receive it).
    const actions = [
      inspectPill(page).getByRole("button", { name: "Save window" }),
      inspectPill(page).getByRole("button", { name: "Exit Inspect" }),
    ];
    for (const a of actions) await a.click({ trial: true, timeout: 5_000 });
    await page.getByRole("button", { name: "Show left panel" }).click({ trial: true, timeout: 5_000 });
    await page.getByRole("button", { name: "Show right panel" }).click();
    await expect(right).toHaveAttribute("data-collapsed", "false");
    await expect(cubeWindow(page)).toBeVisible();
    // The expanded dock is the top hit over the cube, and the pill's actions stay reachable.
    const b = (await right.boundingBox())!;
    const onTop = await page.evaluate(
      ([x, y]) => Boolean(document.elementFromPoint(x, y)?.closest(".landmarks__chrome-dock--right")),
      [b.x + b.width / 2, b.y + Math.min(b.height / 2, 40)],
    );
    expect(onTop).toBe(true);
    for (const a of actions) await a.click({ trial: true, timeout: 5_000 });

    // Focus a category in the dock: the cube highlights only its cells (type1: cells 1 and 3).
    await right.getByRole("button", { name: "Expand cell_type" }).click();
    await right.getByRole("listitem").filter({ hasText: "type1" }).click();
    await expect.poll(() => getModel(page, "selected_kind")).toBe("type");
    await expect(view).toHaveAttribute("data-highlight", "1");
  });

  test("highlight follows focus: everything, a category, a Selection", async ({ page }) => {
    // The 300 µm square holds all three cells: type1 and type0.
    await openCubeAtCentre(page, { at: [130, 170] });
    const view = cubeWindow(page).locator(".volume-cube__view");
    await expect(view).toHaveAttribute("data-labels", "on");
    await expect(view).toHaveAttribute("data-coloring", "groups");
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

  test("with Labels on each toy cell renders in its category colour in the dock", { tag: "@isolated" }, async ({ page }) => {
    // Record the width of every R8 (image) and RG8 (labels) 3D texture allocated.
    await page.addInitScript(() => {
      const widths = { r8: [] as number[], rg8: [] as number[] };
      (window as any).__tex3dWidths = widths;
      const proto = WebGL2RenderingContext.prototype;
      const texStorage3D = proto.texStorage3D;
      proto.texStorage3D = function (this: WebGL2RenderingContext, ...args: Parameters<typeof texStorage3D>) {
        if (args[2] === this.R8) widths.r8.push(args[3]);
        if (args[2] === this.RG8) widths.rg8.push(args[3]);
        return texStorage3D.apply(this, args);
      };
    });
    // A 100 µm window over cells 2 (type0, at 160, 150) and 3 (type1, at 100, 190)
    // and not cell 1: the first cell encoded is global 2, so local index 1 is
    // global 2 and a local/global mix-up changes the colours.
    await loadFresh(page, "window=100");
    await openCubeAtCentre(page, { at: [130, 170] });
    const view = cubeWindow(page).locator(".volume-cube__view");
    // Half-µm centre: the level-0 box is X 80-181, Y 120-221, an odd 101 voxels
    // wide (R8 image rows of 101 bytes and RG8 label rows of 202, not 4-byte
    // aligned, like A2's 667).
    await setModel(page, { inspect_cx: 130.5, inspect_cy: 170.5 });
    // Labels composite over the image in every projection, so the default
    // (Additive) shows deep cells too.
    await expect(view).toHaveAttribute("data-image-mode", "additive");
    await expect(view).toHaveAttribute("data-label-mode", "additive");
    await expect(view).toHaveAttribute("data-refining", "false");
    await expect(view).toHaveAttribute("data-pan", "0,0");
    // The image at one byte per voxel.
    await expect(view).toHaveAttribute("data-image-format", "r8unorm");
    expect((await page.evaluate(() => (window as any).__tex3dWidths)).r8).toContain(101);
    await setShow(page, "Show labels", false);
    const off = await view.screenshot();

    await setShow(page, "Show labels", true);
    await expect(view).toHaveAttribute("data-channels", "2");
    await expect(view).toHaveAttribute("data-label-cells", "2");
    await expect(view).toHaveAttribute("data-highlight", "2");
    expect((await page.evaluate(() => (window as any).__tex3dWidths)).rg8).toContain(101);
    const on = await newCategoryPixels(page, off, await view.screenshot());
    // Cell 3 (type1, blue) and cell 2 (type0, orange) both show...
    expect(on.type1.count).toBeGreaterThan(200);
    expect(on.type0.count).toBeGreaterThan(200);
    // ...each where it is (top-down: x right, y down): cell 2 right of and above cell 3.
    expect(on.type0.x).toBeGreaterThan(on.type1.x + 20);
    expect(on.type0.y).toBeLessThan(on.type1.y - 20);
  });

  test("each toy cell keeps its category colour with Image MIP, under Labels Additive and Labels MIP", async ({ page }) => {
    // The window and cells of the test above: cell 2 (type0) right of and above cell 3 (type1).
    await reloadWith(page, "window=100");
    await openCubeAtCentre(page, { at: [130, 170] });
    const view = cubeWindow(page).locator(".volume-cube__view");
    await setModel(page, { inspect_cx: 130.5, inspect_cy: 170.5 });
    await openAdjust(page);
    await adjustPanel(page).getByTestId("adjust-image").getByRole("radio", { name: "MIP" }).click();
    await page.keyboard.press("Escape");
    await expect(adjustPanel(page)).toHaveCount(0);
    await expect(view).toHaveAttribute("data-image-mode", "mip");
    await expect(view).toHaveAttribute("data-refining", "false");
    await expect(view).toHaveAttribute("data-pan", "0,0");
    await setShow(page, "Show labels", false);
    const off = await view.screenshot();

    // Image MIP + Labels Additive (the hover preview's look): as saturated as Additive/Additive.
    await setShow(page, "Show labels", true);
    await expect(view).toHaveAttribute("data-label-mode", "additive");
    await expect(view).toHaveAttribute("data-label-cells", "2");
    await expect(view).toHaveAttribute("data-refining", "false");
    const additive = await view.screenshot();
    const add = await newCategoryPixels(page, off, additive);
    // Measured (macOS Metal): type1 12923 px, type0 52450 px at the 0.4 cutoff.
    expect(add.type1.count).toBeGreaterThan(200);
    expect(add.type0.count).toBeGreaterThan(200);
    expect(add.type0.x).toBeGreaterThan(add.type1.x + 20);
    expect(add.type0.y).toBeLessThan(add.type1.y - 20);

    // Image MIP + Labels MIP: the strongest cell sample per pixel, one at 0.9 x 0.6
    // = 0.54 alpha over the white image MIP, is pale. Measured category pixels
    // (type1 / type0) by saturation cutoff: 0.4: 0 / 0; 0.3: 0 / 62786;
    // 0.2: 98 / 62786; 0.15: 31584 / 62786 (as at 0.1). So the blue cells sit at
    // saturation 0.15-0.2 and the orange at 0.3-0.4; 0.12 keeps a margin below
    // both (the grey image is near 0).
    await openAdjust(page);
    await adjustPanel(page).getByTestId("adjust-labels").getByRole("radio", { name: "MIP" }).click();
    await page.keyboard.press("Escape");
    await expect(adjustPanel(page)).toHaveCount(0);
    await expect(view).toHaveAttribute("data-label-mode", "mip");
    await expect(view).toHaveAttribute("data-refining", "false");
    const mip = await newCategoryPixels(page, off, await view.screenshot(), 0.12);
    expect(mip.type1.count).toBeGreaterThan(200);
    expect(mip.type0.count).toBeGreaterThan(200);
    expect(mip.type0.x).toBeGreaterThan(mip.type1.x + 20);
    expect(mip.type0.y).toBeLessThan(mip.type1.y - 20);
  });

  test("the cube opens showing the cells, with no trip to Adjust", async ({ page }) => {
    await openCubeAtCentre(page, { at: [130, 170] });
    const view = cubeWindow(page).locator(".volume-cube__view");
    await expect(view).toHaveAttribute("data-refining", "false");
    // Nothing touched since the click that opened it.
    await expect(view).toHaveAttribute("data-labels", "on");
    await expect(view).toHaveAttribute("data-image", "on");
    await expect(view).toHaveAttribute("data-coloring", "groups");
    await expect(view).toHaveAttribute("data-channels", "2");
    const shown = await categoryPixels(page, await view.screenshot());
    expect(shown.type1).toBeGreaterThan(200);
    expect(shown.type0).toBeGreaterThan(200);
    // The switch agrees with what the cube draws.
    await openAdjust(page);
    await expect(adjustPanel(page).getByRole("switch", { name: "Show labels" })).toBeChecked();
  });

  test("with no category to colour by, every cell takes its own hue", async ({ page }) => {
    await openCubeAtCentre(page, { at: [130, 170] });
    const view = cubeWindow(page).locator(".volume-cube__view");
    await expect(view).toHaveAttribute("data-coloring", "groups");
    await expect(view).toHaveAttribute("data-refining", "false");
    const byCategory = await view.screenshot();
    const before = await categoryPixels(page, byCategory);

    // The store's only categorical column goes: there is nothing left to group by.
    await setModel(page, { active_category: "" });
    await expect(view).toHaveAttribute("data-coloring", "instances");
    await expect(view).toHaveAttribute("data-refining", "false");
    const shot = await view.screenshot();
    // Labels 1, 2 and 3 land on hues 222°, 85° and 307° (HUE_STEP per id), so
    // the three toy cells show as three clusters and neither category hue (205°
    // type1, 28° type0) is among them.
    expect(await newHueClusters(page, byCategory, shot)).toEqual([80, 220, 300]);
    // Both category counts collapse to the chrome's own few hundred pixels: the
    // axis legend holds hues inside the 15° the category test allows.
    const after = await categoryPixels(page, shot);
    expect(before.type1).toBeGreaterThan(5000);
    expect(before.type0).toBeGreaterThan(5000);
    expect(after.type1).toBeLessThan(before.type1 / 10);
    expect(after.type0).toBeLessThan(before.type0 / 10);
  });

  test("a cell outside the focused category is neutral, never another category's colour", async ({ page }) => {
    await openCubeAtCentre(page, { at: [130, 170] });
    const view = cubeWindow(page).locator(".volume-cube__view");
    await setShow(page, "Show image", false);
    await expect(view).toHaveAttribute("data-refining", "false");
    const both = await categoryPixels(page, await view.screenshot());
    expect(both.type0).toBeGreaterThan(200);

    // Focus type1 (cells 1 and 3). Cell 2 is type0 and drops out of every group.
    await setModel(page, { selected_kind: "type", selected_index: 0 });
    await expect(view).toHaveAttribute("data-highlight", "1");
    await expect(view).toHaveAttribute("data-refining", "false");
    const focused = await categoryPixels(page, await view.screenshot());
    // The unassigned shell was #f97316, 3.6° from tab10's #ff7f0e: close enough
    // that this very hue test could not tell cell 2 from a type0 cell. Grey can
    // never land in a category's bucket, so type0 drops to the chrome's own few
    // hundred pixels and the unsaturated pixels take cell 2's place.
    expect(focused.type0).toBeLessThan(both.type0 / 10);
    expect(focused.type1).toBeGreaterThan(200);
    expect(focused.flat).toBeGreaterThan(both.flat + 2000);
  });

  test("labels draw as filled bodies: a cell's core is coloured, its rim brighter", async ({ page }) => {
    await openCubeAtCentre(page);
    const view = cubeWindow(page).locator(".volume-cube__view");
    await expect(view).toHaveAttribute("data-refining", "false");
    // The image off, so only the cells draw; a 2 µm slab through the cells' middle
    // (viewed from the top) shows each cell's cross-section: its rim, and its
    // interior when it is filled.
    await setShow(page, "Show image", false);
    await expect(view).toHaveAttribute("data-labels", "on");
    await expect(view).toHaveAttribute("data-refining", "false");
    await setModel(page, { volume_cut: [0, 256, 0, 256, 31, 33] });
    await expect(view).toHaveAttribute("data-refining", "false");
    const { rim, core } = await ringVsCore(page, await view.screenshot());
    expect(rim).toBeGreaterThan(0);
    // Measured core/rim on this slab: shells (CELL_FILL 0) 0.07, filled (0.35) 0.29.
    // 0.25 sits between the two, as it did when the cells were shells.
    expect(core).toBeGreaterThan(rim * 0.25);
  });

  test("the dock shows the coarse level first, then refines", { tag: "@isolated" }, async ({ page }) => {
    // Record every `data-level` a cube view is given, on the element itself, from
    // its first render: an observer attached after the cube opens can miss the
    // coarse level when the refine is fast (as under parallel load).
    await page.addInitScript(() => {
      const setAttribute = Element.prototype.setAttribute;
      Element.prototype.setAttribute = function (this: Element, name: string, value: string) {
        if (name === "data-level" && this.classList.contains("volume-cube__view")) {
          ((this as any).__levels ??= []).push(String(value));
        }
        return setAttribute.call(this, name, value);
      };
    });
    // Small budgets make the toy pyramid pick different levels (see main.tsx ?budgets).
    await loadFresh(page, "budgets=20000,300000&window=100");
    await openCubeAtCentre(page);
    const view = cubeWindow(page).locator(".volume-cube__view");
    await expect(view).toHaveAttribute("data-refining", "false");
    const levels = await view.evaluate((el) => ((el as any).__levels ?? []) as string[]);
    const shown = levels.filter((l) => l !== "-1").map(Number);
    expect(shown.length).toBeGreaterThanOrEqual(2);
    expect(shown[0]).toBeGreaterThan(shown[shown.length - 1]!);
  });

  test("the hosted cube has no category legend", async ({ page }) => {
    // Nothing focused: every cell in the window is highlighted.
    await openCubeAtCentre(page, { at: [160, 150] });
    const view = cubeWindow(page).locator(".volume-cube__view");
    await expect(view).toHaveAttribute("data-labels", "on");
    await expect(view).not.toHaveAttribute("data-highlight", "0");
    await expect(cubeWindow(page).getByLabel("Highlighted cells")).toHaveCount(0);
  });

  test("reopening the same window reads every chunk from the cache", async ({ page }) => {
    const box = await openCubeAtCentre(page);
    const view = cubeWindow(page).locator(".volume-cube__view");
    await expect(view).toHaveAttribute("data-refining", "false");
    await page.keyboard.press("Escape");
    await expect(cubeWindow(page)).toHaveCount(0);
    const chunkRequests: string[] = [];
    page.on("request", (r) => {
      if (/\/s\d+\/c\//.test(r.url())) chunkRequests.push(r.url());
    });
    await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.5);
    await expect(view).toHaveAttribute("data-refining", "false");
    expect(chunkRequests).toEqual([]);
  });

  test("Selections rows restore each saved window and cut; a saved entry keeps its cut", async ({ page }) => {
    const box = await openCubeAtCentre(page);
    const cx = () => getModel(page, "inspect_cx").then(Number);
    await openCross(page);
    const zHi = page.getByRole("slider", { name: "Z cut" }).nth(1);
    const nudge = async (key: string) => {
      await zHi.focus();
      await page.keyboard.press(`Shift+${key}`);
    };
    await nudge("ArrowLeft");
    await expect.poll(async () => (await cutOf(page))[5]).toBe(54);
    expect(await save(page)).toBe(0);
    const first = (await selectionsOf(page))[0];
    expect(first.window.cut[5]).toBe(54);

    // Elsewhere, with entry 1 still focused: a new cut stays out of entry 1.
    await moveWindow(page, box, [0.2, 0.25], [0.2, 0.25]);
    await openCross(page);
    await expect.poll(cx).not.toBeCloseTo(first.window.cx, 1);
    await nudge("ArrowRight");
    await expect.poll(async () => (await cutOf(page))[5]).toBe(64);
    await page.waitForTimeout(600); // past the cut's settle commit
    expect((await selectionsOf(page))[0]).toEqual(first);
    expect(await save(page)).toBe(1);
    const second = (await selectionsOf(page))[1];

    await expect(page.getByTestId("selection-row")).toHaveCount(2);
    await expect(selectionRow(page, 1)).toHaveAttribute("aria-current", "true");
    await openSelectionsDock(page);
    await selectionRow(page, 0).click();
    await expect.poll(cx).toBeCloseTo(first.window.cx, 3);
    await expect.poll(async () => (await cutOf(page))[5]).toBe(54);
    await selectionRow(page, 1).click();
    await expect.poll(cx).toBeCloseTo(second.window.cx, 3);
    await expect.poll(async () => (await cutOf(page))[5]).toBe(64);

    // A press moves the live window off the focused entry; its row brings it back.
    await moveWindow(page, box, [0.7, 0.6], [0.7, 0.6]);
    await expect.poll(cx).not.toBeCloseTo(second.window.cx, 1);
    await selectionRow(page, 1).click();
    await expect.poll(cx).toBeCloseTo(second.window.cx, 3);
    // Saved entries are snapshots: nothing above changed them.
    expect(await selectionsOf(page)).toEqual([first, second]);
  });

  test("deleting an inspect selection removes its row; the last one closes the dock", async ({ page }) => {
    await openCubeAtCentre(page);
    expect(await save(page)).toBe(0);
    await openSelectionsDock(page);
    const rows = page.getByTestId("selection-row");
    await expect(rows).toHaveCount(1);
    // Once refined, the row carries a snapshot of the cube.
    await expect(selectionRow(page, 0).getByTestId("selection-thumb")).toBeVisible();
    await setModel(page, { selections: [], selected_kind: "", selected_index: -1 });
    await expect(rows).toHaveCount(0);
    await expect(cubeWindow(page)).toHaveCount(0);
  });

  test("a row gets its thumbnail when Save lands after the cube has settled", async ({ page }) => {
    await openCubeAtCentre(page);
    const view = cubeWindow(page).locator(".volume-cube__view");
    await expect(view).toHaveAttribute("data-refining", "false");
    await expect(view).toHaveAttribute("data-pan", "0,0");
    await page.waitForTimeout(1500); // settle: past the cube's last frame, so Save cannot ride on one
    expect(await save(page)).toBe(0);
    await openSelectionsDock(page);
    await expect(selectionRow(page, 0).getByTestId("selection-thumb")).toBeVisible();
  });

  test("a row's snapshot follows its entry: a reused id re-snapshots", async ({ page }) => {
    // A 100 µm window, so two places show different parts of the toy volume.
    await reloadWith(page, "window=100");
    // No active categorical, so a new entry is "inspect 1" whatever it holds (named by
    // category, two different windows would not share an id).
    await setModel(page, { active_category: "" });
    const box = await openCubeAtCentre(page);
    expect(await save(page)).toBe(0);
    expect((await selectionsOf(page))[0].id).toBe("inspect 1");
    // The row's thumbnail (rows stay in the DOM while Inspect collapses the dock).
    const thumb = selectionRow(page, 0).getByTestId("selection-thumb");
    const src = () => thumb.getAttribute("src");
    await expect(thumb).toHaveCount(1);
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
    await expect(thumb).toHaveCount(1);
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

  test("the preview float sits beside the hover square, inside the widget, under the tools", async ({ page }) => {
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

    // The float sits under the tools (which stay above the map and the cube).
    const stack = await page.evaluate(() => {
      const z = (el: Element) => Number(getComputedStyle(el).zIndex);
      const f = document.querySelector('[data-testid="inspect-preview"]')!;
      const tools = document.querySelector(".landmarks__chrome-tools")!;
      return { float: z(f), tools: z(tools), pill: Boolean(tools.querySelector('[data-testid="inspect-pill"]')) };
    });
    // In Inspect the top pill is the Inspect pill, in the tools' slot.
    expect(stack.pill).toBe(true);
    expect(stack.float).toBeLessThan(stack.tools);

    // Opening the cube takes the float away: the cube is what is shown then.
    await page.mouse.click(box.x + box.width * 0.4, box.y + box.height * 0.5);
    await expect(cubeWindow(page)).toBeVisible();
    await expect(float).toBeHidden();
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

  test("the cube and the preview open top-down; an axis legend turns with the camera", async ({ page }) => {
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

    // The hover preview is top-down too, with its own legend (it hides while the cube is open).
    await page.keyboard.press("Escape");
    await expect(cubeWindow(page)).toHaveCount(0);
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

  test("a camera preset chosen before the dock's first frame is kept", async ({ page }) => {
    // Hold the volume's requests, so the click lands before the dock has a camera.
    await page.route("**/toy.sdata.zarr/images/**", async (route) => {
      await new Promise((r) => setTimeout(r, 400));
      await route.continue();
    });
    const box = await openCubeAtCentre(page);
    const bar = page.getByTestId("context-inspect-toolbar");
    const view = cubeWindow(page).locator(".volume-cube__view");
    // The cube is mounted but has no camera yet (no data-zoom) when Oblique is chosen.
    await expect(view).toHaveAttribute("data-zoom", "");
    await bar.getByRole("radio", { name: "Oblique view" }).click();
    expect(await view.getAttribute("data-zoom")).toBe("");

    await expect(view).toHaveAttribute("data-refining", "false");
    await expect(view).toHaveAttribute("data-pitch", "35");
    await expect(bar.getByRole("radio", { name: "Oblique view" })).toHaveAttribute("aria-checked", "true");

    // Reopened, the dock opens in the toolbar's preset (still Oblique).
    await page.keyboard.press("Escape");
    await expect(cubeWindow(page)).toHaveCount(0);
    await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.5);
    await expect(view).toHaveAttribute("data-refining", "false");
    await expect(view).toHaveAttribute("data-pitch", "35");
    await expect(bar.getByRole("radio", { name: "Oblique view" })).toHaveAttribute("aria-checked", "true");
  });

  test("a preset picked on the bar before placing is the dock's first view", async ({ page }) => {
    await page.getByRole("radio", { name: "Inspect", exact: true }).click();
    const bar = page.getByTestId("context-inspect-toolbar");
    await bar.getByRole("radio", { name: "Oblique view" }).click();
    await expect(cubeWindow(page)).toHaveCount(0);

    const box = await canvasBox(page);
    await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.5);
    const view = cubeWindow(page).locator(".volume-cube__view");
    await expect(view).toHaveAttribute("data-refining", "false");
    await expect(view).toHaveAttribute("data-pitch", "35");
    await expect(bar.getByRole("radio", { name: "Oblique view" })).toHaveAttribute("aria-checked", "true");
  });

  test("Show image off hides the image in the dock and the preview; labels still draw", async ({ page }) => {
    await reloadWith(page, "window=100");
    await openCubeAtCentre(page, { at: [130, 170] });
    const dock = cubeWindow(page).locator(".volume-cube__view");
    await expect(dock).toHaveAttribute("data-image", "on");
    await expect(dock).toHaveAttribute("data-refining", "false");
    await expect(dock).toHaveAttribute("data-pan", "0,0");
    const imageOn = await dock.screenshot();

    await setShow(page, "Show labels", false);
    await setShow(page, "Show image", false);
    await expect(dock).toHaveAttribute("data-image", "off");
    // Image and labels off: an empty cube in its frame.
    const empty = await dock.screenshot();
    expect(await brightPixels(page, empty)).toBeLessThan((await brightPixels(page, imageOn)) / 4);

    // Labels still draw with no image behind them.
    await setShow(page, "Show labels", true);
    await expect(dock).toHaveAttribute("data-labels", "on");
    await expect(dock).toHaveAttribute("data-channels", "2");
    await expect(dock).toHaveAttribute("data-image", "off");
    const cells = await newCategoryPixels(page, empty, await dock.screenshot());
    expect(cells.type1.count + cells.type0.count).toBeGreaterThan(200);

    // The hover preview follows the same switches (it shows with the cube closed).
    await page.keyboard.press("Escape");
    await expect(cubeWindow(page)).toHaveCount(0);
    const box = await canvasBox(page);
    await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.5, { steps: 3 });
    const pv = preview(page).locator(".volume-cube__view");
    await expect(preview(page)).toBeVisible();
    await expect(pv).toHaveAttribute("data-image", "off");
    await expect(pv).toHaveAttribute("data-labels", "on");

    // Back on: both views show the image again.
    await setShow(page, "Show image", true);
    await expect(pv).toHaveAttribute("data-image", "on");
    await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.5);
    await expect(cubeWindow(page)).toBeVisible();
    await expect(dock).toHaveAttribute("data-image", "on");
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

    // The hover preview draws them too (it shows with the cube closed).
    await setModel(page, {
      landmarks: [line("across", [[20, 128], [240, 140]]), { id: "p", type: "point", vertices: [[128, 100]] }],
    });
    await expect(view).toHaveAttribute("data-overlays", "2");
    await page.keyboard.press("Escape");
    await expect(cubeWindow(page)).toHaveCount(0);
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

    await inspectPill(page).getByRole("button", { name: "Exit Inspect" }).click();
    await expect(preview(page)).toBeHidden();
    await expect(view).toHaveCount(1);

    await page.getByRole("radio", { name: "Inspect", exact: true }).click();
    await page.mouse.move(box.x + box.width * 0.45, box.y + box.height * 0.5, { steps: 3 });
    await expect(preview(page)).toBeVisible();
    expect(await view.evaluate((el) => Boolean((el as any).__kept))).toBe(true);
  });
});
