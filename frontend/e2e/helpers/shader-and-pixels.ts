import { expect, type Page } from "@playwright/test";

export async function expectNoDeckShaderCompileOverlay(page: Page) {
  await expect(page.locator("body")).not.toContainText("Compilation error in fragment shader", {
    timeout: 5_000,
  });
}

type CanvasStats = { bright: number; colored: number; total: number };

async function canvasStats(page: Page, selector: string): Promise<CanvasStats | null> {
  return page.evaluate((sel) => {
    const c = document.querySelector(sel) as HTMLCanvasElement | null;
    if (!c) return null;
    const gl = c.getContext("webgl2") || c.getContext("webgl");
    if (!gl) return null;
    const w = c.width;
    const h = c.height;
    const buf = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    let bright = 0;
    let colored = 0;
    for (let i = 0; i < buf.length; i += 4) {
      const r = buf[i]!;
      const g = buf[i + 1]!;
      const b = buf[i + 2]!;
      if (r + g + b > 40) bright++;
      if (Math.abs(r - g) > 12 || Math.abs(r - b) > 12 || Math.abs(g - b) > 12) colored++;
    }
    return { bright, colored, total: w * h };
  }, selector);
}

export async function expectMapBandShowsMultichannelImage(page: Page) {
  await expect
    .poll(async () => canvasStats(page, "canvas.landmarks__webgl"), { timeout: 60_000 })
    .toMatchObject({ bright: expect.any(Number), colored: expect.any(Number) });
  const stats = await canvasStats(page, "canvas.landmarks__webgl");
  expect(stats).toBeTruthy();
  expect(stats!.bright).toBeGreaterThan(500);
  expect(stats!.colored).toBeGreaterThan(200);
}

export async function expectCubeShowsMultichannelImage(page: Page) {
  const view = page.getByRole("dialog", { name: "Cube" }).locator(".volume-cube__view canvas");
  await expect(view).toBeVisible({ timeout: 60_000 });
  await expect
    .poll(async () => canvasStats(page, '[role="dialog"][aria-label="Cube"] .volume-cube__view canvas'), {
      timeout: 120_000,
    })
    .toMatchObject({ bright: expect.any(Number) });
  const stats = await canvasStats(page, '[role="dialog"][aria-label="Cube"] .volume-cube__view canvas');
  expect(stats).toBeTruthy();
  expect(stats!.bright).toBeGreaterThan(1000);
  expect(stats!.colored).toBeGreaterThan(400);
}

export async function expectCubePixelsChangeWhenPanckOff(page: Page) {
  const cubeCanvasSel = '[role="dialog"][aria-label="Cube"] .volume-cube__view canvas';

  const sumForCubeCanvas = async () =>
    page.evaluate((sel) => {
      const c = document.querySelector(sel) as HTMLCanvasElement | null;
      const gl = c?.getContext("webgl2");
      if (!c || !gl) return 0;
      const w = c.width;
      const h = c.height;
      const buf = new Uint8Array(w * h * 4);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i += 16) sum += buf[i]! + buf[i + 1]! + buf[i + 2]!;
      return sum;
    }, cubeCanvasSel);

  const twoChannelSum = await sumForCubeCanvas();
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
  const oneChannelSum = await sumForCubeCanvas();
  expect(oneChannelSum).not.toBe(twoChannelSum);
}
