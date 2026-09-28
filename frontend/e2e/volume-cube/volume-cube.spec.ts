import { expect, test } from "@playwright/test";

import {
  bootVolumeCubeHarness,
  getVolumeModel,
  setVolumeModel,
  shot,
  toyInspectBox,
  volumeCubeWidget,
} from "../helpers";

/**
 * VolumeCube widget tier — functional coverage + 3 visual anchors:
 * rest volume, inspect window offset, labels hidden.
 */
test.describe("VolumeCubeWidget", () => {
  test.beforeEach(async ({ page }) => {
    await bootVolumeCubeHarness(page);
  });

  test("harness boots and OME-Zarr volume renders", async ({ page }) => {
    const widget = volumeCubeWidget(page);
    await expect(widget).toBeVisible();
    await expect(page.getByRole("button", { name: "Reset" })).toBeVisible();
    await expect(page.getByRole("switch", { name: "Labels" })).not.toBeChecked();
    await expect(
      widget.getByText(/window 128, 128 · 100 µm · X 78–178 · Y 78–178 · Z 0–64/),
    ).toBeVisible();
    await expect(widget.locator("canvas").first()).toBeVisible();
    await shot(page, "rest", widget);
  });

  test("toy inspect drag updates synced window traits", async ({ page }) => {
    const widget = volumeCubeWidget(page);
    const { box } = await toyInspectBox(page);

    // Toy blob 2 sits at x 160, y 150 (data rows, y down like the toy inspect).
    await page.mouse.move(box.x + box.width * 0.62, box.y + box.height * 0.58);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.62, box.y + box.height * 0.58);
    await page.mouse.up();
    await expect.poll(async () => Number(await getVolumeModel(page, "window_cx"))).not.toBe(128);

    const cx = Number(await getVolumeModel(page, "window_cx"));
    const cy = Number(await getVolumeModel(page, "window_cy"));
    expect(cx).toBeGreaterThan(140);
    expect(cx).toBeLessThan(210);
    expect(cy).toBeGreaterThan(120);
    expect(cy).toBeLessThan(180);
    const xLo = Math.max(0, Math.round(cx - 50));
    const xHi = Math.min(256, Math.round(cx + 50));
    const yLo = Math.max(0, Math.round(cy - 50));
    const yHi = Math.min(256, Math.round(cy + 50));
    await expect(
      widget.getByText(
        new RegExp(
          `window ${Math.round(cx)}, ${Math.round(cy)} · 100 µm · X ${xLo}–${xHi} · Y ${yLo}–${yHi} · Z 0–64`,
        ),
      ),
    ).toBeVisible();
    await shot(page, "window-on-sphere", widget);
  });

  test("a window outside the volume shows a status and keeps the page alive", async ({ page }) => {
    const widget = volumeCubeWidget(page);
    // Wholly outside the 256 µm toy: the window box is empty.
    await setVolumeModel(page, { window_cx: 600, window_cy: 600 });
    await expect(widget.getByText("Inspect window is outside the volume")).toBeVisible();
    // Half outside: the loaded window is thin but real.
    await setVolumeModel(page, { window_cx: 300, window_cy: 128 });
    await expect(widget.getByText("Inspect window is outside the volume")).toHaveCount(0);
    await setVolumeModel(page, { window_cx: 128, window_cy: 128 });
    // The page still answers: back inside, the window loads again.
    await expect(widget.getByText(/window 128, 128/)).toBeVisible();
  });

  test("moving the window pans the loaded volume until the new window loads", async ({ page }) => {
    const widget = volumeCubeWidget(page);
    await expect(widget).toHaveAttribute("data-pan", "0,0");
    // Record every pan offset the widget shows; the pan can outlive a poll by little.
    await widget.evaluate((el) => {
      const seen: string[] = [];
      (window as any).__pans = seen;
      new MutationObserver(() => seen.push(el.getAttribute("data-pan") ?? "")).observe(el, {
        attributes: true,
        attributeFilter: ["data-pan"],
      });
    });
    await setVolumeModel(page, { window_cx: 148, window_cy: 118 });
    await expect(widget.getByText(/window 148, 118/)).toBeVisible();
    // Once the new window is on the GPU there is nothing left to pan.
    await expect(widget).toHaveAttribute("data-pan", "0,0");
    // Before that, the old voxels slid by the move (20 left; y by -10 texture rows, which run reversed).
    expect(await page.evaluate(() => (window as any).__pans)).toContain("-20,-10");
  });

  test("model patches update the window and axis slice readout", async ({ page }) => {
    const widget = volumeCubeWidget(page);
    // X/Y cross-section clips inside the boot window 78–178 (Y 60 clamps to 78).
    await setVolumeModel(page, { slice_x_min: 100, slice_x_max: 150, slice_y_min: 60, slice_y_max: 120 });
    await expect(widget.getByText(/X 100–150 · Y 78–120 · Z 0–64/)).toBeVisible();
    await setVolumeModel(page, { slice_x_min: 0, slice_x_max: 256, slice_y_min: 0, slice_y_max: 256 });
    await expect(widget.getByText(/X 78–178 · Y 78–178 · Z 0–64/)).toBeVisible();

    // Window centre from Python, no inspect drag.
    await setVolumeModel(page, { window_cx: 64, window_cy: 192 });
    await expect(
      widget.getByText(/window 64, 192 · 100 µm · X 14–114 · Y 142–242 · Z 0–64/),
    ).toBeVisible();

    // Z slab from Python.
    await setVolumeModel(page, { window_cx: 160, window_cy: 96, slice_z_min: 8, slice_z_max: 48 });
    await expect(widget.getByText(/X 110–210 · Y 46–146 · Z 8–48/)).toBeVisible();
  });

  test("in-widget controls: camera presets, projection, and a committed Z cut", async ({ page }) => {
    const widget = volumeCubeWidget(page);
    // The standalone cube opens oblique (the Landmarks dock opens top-down), with an axis legend.
    await expect(widget.getByRole("radio", { name: "Oblique view" })).toHaveAttribute("data-state", "on");
    const legend = widget.getByLabel("Axes");
    await expect(legend).toBeVisible();
    const zLength = async () => Number((await legend.getAttribute("data-lengths"))!.split(",")[2]);
    expect(await zLength()).toBeGreaterThan(0.5);
    for (const name of ["Top view", "Side view", "Oblique view"]) {
      await widget.getByRole("radio", { name }).click();
      await expect(widget.getByRole("radio", { name })).toHaveAttribute("data-state", "on");
      // From above, z points at the viewer.
      if (name === "Top view") await expect.poll(zLength).toBeLessThan(0.05);
    }
    // A preset only turns the standalone camera: the user's zoom stays.
    const view = widget.locator(".volume-cube__view");
    const zoom = async () => Number(await view.getAttribute("data-zoom"));
    const r = (await view.boundingBox())!;
    await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2);
    const z0 = await zoom();
    await page.mouse.wheel(0, -400);
    await expect.poll(zoom).toBeGreaterThan(z0 + 0.1);
    const zoomed = await zoom();
    await widget.getByRole("radio", { name: "Side view" }).click();
    await expect(widget.getByRole("radio", { name: "Side view" })).toHaveAttribute("data-state", "on");
    expect(await zoom()).toBeCloseTo(zoomed, 2);
    await widget.getByRole("radio", { name: "Oblique view" }).click();
    await widget.getByRole("radio", { name: "Maximum intensity" }).click();
    await expect(widget).toHaveAttribute("data-render", "mip");
    await widget.getByRole("radio", { name: "Additive" }).click();
    await expect(widget).toHaveAttribute("data-render", "additive");

    // Thumbs: X lo/hi, Y lo/hi, Z lo/hi, contrast lo/hi. Keyboard moves commit.
    const zHi = widget.getByRole("slider").nth(5);
    await zHi.focus();
    for (let i = 0; i < 10; i++) await page.keyboard.press("ArrowLeft");
    await expect.poll(async () => Number(await getVolumeModel(page, "slice_z_max"))).toBe(54);
    await expect(widget.getByText(/Z 0–54/)).toBeVisible();
  });

  test("highlight_groups colour chosen cells and follow the Labels switch", async ({ page }) => {
    const widget = volumeCubeWidget(page);
    const labels = page.getByRole("switch", { name: "Labels" });
    const legend = widget.getByLabel("Highlighted cells");
    const view = widget.locator(".volume-cube__view");
    await expect(widget).toHaveAttribute("data-channels", "1");

    // Highlighting from Python turns Labels on and uploads the window's label texture once.
    await setVolumeModel(page, { highlight_groups: [{ name: "blob two", color: "#e377c2", labels: [2] }] });
    await expect(labels).toBeChecked();
    await expect(widget).toHaveAttribute("data-labels", "on");
    await expect(widget).toHaveAttribute("data-channels", "2");
    await expect(view).toHaveAttribute("data-label-format", "rg8");
    await expect(widget).toHaveAttribute("data-highlight", "1");
    await expect(legend.getByText("blob two")).toBeVisible();
    await expect(widget.locator("canvas")).toHaveCount(1);

    // Labels off hides the highlight too; the label texture stays for the next toggle.
    await labels.click();
    await expect(widget).toHaveAttribute("data-labels", "off");
    await expect(widget).toHaveAttribute("data-highlight", "0");
    await expect(widget).toHaveAttribute("data-channels", "1");
    await expect(view).toHaveAttribute("data-label-format", "rg8");
    await expect(legend).toHaveCount(0);
    await labels.click();
    await expect(widget).toHaveAttribute("data-highlight", "1");

    await setVolumeModel(page, { highlight_groups: [] });
    await expect(widget).toHaveAttribute("data-highlight", "0");
    await expect(labels).toBeChecked();
  });

  test("labels switch outlines cells from a compact label texture beside the image", async ({ page }) => {
    const widget = volumeCubeWidget(page);
    const view = widget.locator(".volume-cube__view");
    const canvases = widget.locator("canvas");
    await expect(canvases).toHaveCount(1);
    await expect(widget).toHaveAttribute("data-labels", "off");
    await expect(view).toHaveAttribute("data-label-format", "none");

    await page.getByRole("switch", { name: "Labels" }).click();
    await expect(page.getByRole("switch", { name: "Labels" })).toBeChecked();
    // The image and a two-byte label texture raycast together: still one canvas.
    await expect(widget).toHaveAttribute("data-labels", "on");
    await expect(widget).toHaveAttribute("data-channels", "2");
    await expect(view).toHaveAttribute("data-label-format", "rg8");
    // The boot window (X/Y 78–178) holds a part of each of the three toy cells.
    await expect(view).toHaveAttribute("data-label-cells", "3");
    await expect(canvases).toHaveCount(1);

    await page.getByRole("switch", { name: "Labels" }).click();
    await expect(page.getByRole("switch", { name: "Labels" })).not.toBeChecked();
    await expect(widget).toHaveAttribute("data-labels", "off");
    // Hidden, not unloaded: the image is drawn alone and switching back is a redraw.
    await expect(widget).toHaveAttribute("data-channels", "1");
    await expect(view).toHaveAttribute("data-label-format", "rg8");
    await expect(canvases).toHaveCount(1);
    await shot(page, "labels-off", widget);
  });

  test("a window with more cells than the label texture indexes shows a status, not labels", async ({ page }) => {
    const widget = volumeCubeWidget(page);
    const view = widget.locator(".volume-cube__view");
    // Serve the toy labels as uint32 with a new id on every voxel: 640 k cells in the window.
    await page.route(/\/toy\.ome\.zarr\/labels\/cells\/0\/\.zarray$/, async (route) => {
      const meta = await (await route.fetch()).json();
      await route.fulfill({ json: { ...meta, dtype: "<u4" } });
    });
    await page.route(/\/toy\.ome\.zarr\/labels\/cells\/0\/\d+\/\d+\/\d+$/, (route) => {
      const [cz, cy, cx] = route.request().url().split("/").slice(-3).map(Number);
      const n = 32 * 64 * 64;
      const ids = new Uint32Array(n);
      const first = 1 + ((cz! * 4 + cy!) * 4 + cx!) * n;
      for (let i = 0; i < n; i++) ids[i] = first + i;
      return route.fulfill({ body: Buffer.from(ids.buffer) });
    });
    await page.getByRole("switch", { name: "Labels" }).click();
    await expect(widget).toHaveAttribute("data-labels", "error");
    await expect(widget.getByText("Too many cells in this window for labels")).toBeVisible();
    // The image keeps rendering on its own; nothing was uploaded for the labels.
    await expect(widget).toHaveAttribute("data-channels", "1");
    await expect(view).toHaveAttribute("data-label-format", "none");
  });

  test("a failed labels fetch ends in an error state, not loading", async ({ page }) => {
    const widget = volumeCubeWidget(page);
    // A server error (not a missing-chunk 404, which reads as fill) on every labels chunk.
    await page.route(/\/toy\.ome\.zarr\/labels\/cells\/\d+(\/\d+)+$/, (route) =>
      route.fulfill({ status: 500, body: "boom" }),
    );
    await page.getByRole("switch", { name: "Labels" }).click();
    await expect(widget).toHaveAttribute("data-labels", "error");
    await expect(widget.getByText(/Could not load labels/)).toBeVisible();
    // The image keeps rendering on its own.
    await expect(widget).toHaveAttribute("data-channels", "1");
    await expect(widget.locator(".volume-cube__view")).toHaveAttribute("data-label-format", "none");
  });

  test("the first window shows a loading status until it arrives", async ({ page }) => {
    const widget = volumeCubeWidget(page);
    // Hold every image chunk: the volume opens (metadata only) but no window arrives.
    let release!: () => void;
    const held = new Promise<void>((r) => (release = r));
    await page.route(/\/toy\.ome\.zarr\/\d+(\/\d+)+$/, async (route) => {
      await held;
      await route.continue();
    });
    await page.reload();
    await expect(widget.getByText("Loading window…")).toBeVisible();
    release();
    await expect(widget.getByText("Loading window…")).toHaveCount(0);
    await expect(widget.locator("canvas").first()).toBeVisible();
  });

  test("a failed image window fetch shows a status line", async ({ page }) => {
    const widget = volumeCubeWidget(page);
    await page.route(/\/toy\.ome\.zarr\/\d+(\/\d+)+$/, (route) => route.abort("connectionrefused"));
    // A new window is a new fetch; it hits the refused chunks.
    await setVolumeModel(page, { window_cx: 60, window_cy: 60 });
    await expect(widget.getByText(/Could not load this window/)).toBeVisible();
    await page.getByRole("switch", { name: "Labels" }).click();
    await expect(widget).toHaveAttribute("data-labels", "error");
  });
});
