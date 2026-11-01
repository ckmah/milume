import { expect, type Page } from "@playwright/test";

/** Inner fraction of the canvas excluding the wireframe margin (deck draws the box near the edges). */
const CUBE_VOLUME_INSET = { x0: 0.35, y0: 0.35, x1: 0.65, y1: 0.65 } as const;

export async function expectNoDeckShaderCompileOverlay(page: Page) {
  await expect(page.locator("body")).not.toContainText("Compilation error in fragment shader", {
    timeout: 5_000,
  });
}

type CanvasStats = { bright: number; colored: number; total: number };

type CanvasRect = { x0: number; y0: number; x1: number; y1: number };

async function canvasStats(
  page: Page,
  selector: string,
  rect: CanvasRect = { x0: 0, y0: 0, x1: 1, y1: 1 },
): Promise<CanvasStats | null> {
  return page.evaluate(
    ({ sel, rect: r }) => {
      const c = document.querySelector(sel) as HTMLCanvasElement | null;
      if (!c) return null;
      const gl = c.getContext("webgl2") || c.getContext("webgl");
      if (!gl) return null;
      const w = c.width;
      const h = c.height;
      const rx0 = Math.floor(w * r.x0);
      const rx1 = Math.floor(w * r.x1);
      const ry0 = Math.floor(h * r.y0);
      const ry1 = Math.floor(h * r.y1);
      const buf = new Uint8Array(w * h * 4);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
      let bright = 0;
      let colored = 0;
      let total = 0;
      for (let y = ry0; y < ry1; y++) {
        for (let x = rx0; x < rx1; x++) {
          const i = (y * w + x) * 4;
          const r8 = buf[i]!;
          const g = buf[i + 1]!;
          const b = buf[i + 2]!;
          total++;
          if (r8 + g + b > 40) bright++;
          if (Math.abs(r8 - g) > 12 || Math.abs(r8 - b) > 12 || Math.abs(g - b) > 12) colored++;
        }
      }
      return { bright, colored, total };
    },
    { sel: selector, rect },
  );
}

export async function hideMapPointsForImageAssert(page: Page) {
  await page.evaluate(() => {
    window.__landmarksModel.set("point_size", 0);
  });
}

export async function expectMapBandShowsMultichannelImage(page: Page) {
  await hideMapPointsForImageAssert(page);
  await expect
    .poll(async () => canvasStats(page, "canvas.landmarks__webgl"), { timeout: 60_000 })
    .toMatchObject({ bright: expect.any(Number), colored: expect.any(Number) });
  const stats = await canvasStats(page, "canvas.landmarks__webgl");
  expect(stats).toBeTruthy();
  expect(stats!.bright).toBeGreaterThan(500);
  expect(stats!.colored).toBeGreaterThan(150);
}

const cubeCanvasSel = '[role="dialog"][aria-label="Cube"] .volume-cube__view canvas';

export async function expectCubeShowsMultichannelImage(page: Page) {
  const view = page.getByRole("dialog", { name: "Cube" }).locator(".volume-cube__view canvas");
  await expect(view).toBeVisible({ timeout: 60_000 });
  await expect
    .poll(async () => canvasStats(page, cubeCanvasSel, CUBE_VOLUME_INSET), { timeout: 120_000 })
    .toMatchObject({ bright: expect.any(Number) });
  const stats = await canvasStats(page, cubeCanvasSel, CUBE_VOLUME_INSET);
  expect(stats).toBeTruthy();
  expect(stats!.bright).toBeGreaterThan(250);
  expect(stats!.colored).toBeGreaterThan(150);
}

export async function expectCubePixelsChangeWhenPanckOff(page: Page) {
  const sumForCubeVolume = async () =>
    page.evaluate(
      ({ sel, rect }) => {
        const c = document.querySelector(sel) as HTMLCanvasElement | null;
        const gl = c?.getContext("webgl2");
        if (!c || !gl) return 0;
        const w = c.width;
        const h = c.height;
        const rx0 = Math.floor(w * rect.x0);
        const rx1 = Math.floor(w * rect.x1);
        const ry0 = Math.floor(h * rect.y0);
        const ry1 = Math.floor(h * rect.y1);
        const buf = new Uint8Array(w * h * 4);
        gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
        let sum = 0;
        for (let y = ry0; y < ry1; y++) {
          for (let x = rx0; x < rx1; x++) {
            const i = (y * w + x) * 4;
            sum += buf[i]! + buf[i + 1]! + buf[i + 2]!;
          }
        }
        return sum;
      },
      { sel: cubeCanvasSel, rect: CUBE_VOLUME_INSET },
    );

  const twoChannelSum = await sumForCubeVolume();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Cube" })).toHaveCount(0, { timeout: 30_000 });
  const left = page.locator(".landmarks__chrome-dock--left");
  if ((await left.getAttribute("data-collapsed")) === "true") {
    await page.getByTestId("panel-peek-tab-left").click({ force: true });
  }
  await page.getByTestId("panel-section-layers").click({ force: true });
  await page.getByTestId("layer-channel-PanCK").click();
  await expect
    .poll(async () => {
      const rows = (await page.evaluate(() => window.__landmarksModel.get("_image_channels"))) as Array<{
        name: string;
        visible: boolean;
      }>;
      return rows.find((c) => c.name === "PanCK")?.visible;
    })
    .toBe(false);
  await page.getByRole("radio", { name: "Inspect", exact: true }).click();
  const plot = page.locator(".landmarks__plot");
  const box = await plot.boundingBox();
  expect(box).toBeTruthy();
  await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
  const cube = page.getByRole("dialog", { name: "Cube" });
  await expect(cube).toBeVisible({ timeout: 60_000 });
  const view = cube.locator(".volume-cube__view");
  await expect(view).toHaveAttribute("data-channels", "1", { timeout: 30_000 });
  await expect(view).toHaveAttribute("data-refining", "false", { timeout: 120_000 });
  const oneChannelSum = await sumForCubeVolume();
  expect(oneChannelSum).not.toBe(twoChannelSum);
}
