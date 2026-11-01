import { expect, test, type Page } from "@playwright/test";

/** Inner fraction of the cube deck, excluding the wireframe margin. */
export const CUBE_VOLUME_INSET = { x0: 0.35, y0: 0.35, x1: 0.65, y1: 0.65 } as const;

export const CUBE_VIEW_SEL = '[role="dialog"][aria-label="Cube"] .volume-cube__view';
const cubeCanvasSel = `${CUBE_VIEW_SEL} canvas`;

export async function expectNoDeckShaderCompileOverlay(page: Page) {
  await expect(page.locator("body")).not.toContainText("Compilation error in fragment shader", {
    timeout: 5_000,
  });
}

type CanvasStats = { bright: number; colored: number; total: number };

type CanvasRect = { x0: number; y0: number; x1: number; y1: number };

async function statsFromPngBuffer(
  page: Page,
  png: Buffer,
  rect: CanvasRect = { x0: 0, y0: 0, x1: 1, y1: 1 },
): Promise<CanvasStats> {
  const b64 = png.toString("base64");
  return page.evaluate(
    async ({ dataUrl, r }) => {
      const img = await createImageBitmap(await (await fetch(dataUrl)).blob());
      const ctx = new OffscreenCanvas(img.width, img.height).getContext("2d");
      if (!ctx) return { bright: 0, colored: 0, total: 0 };
      ctx.drawImage(img, 0, 0);
      const { width: w, height: h, data } = ctx.getImageData(0, 0, img.width, img.height);
      const rx0 = Math.floor(w * r.x0);
      const rx1 = Math.floor(w * r.x1);
      const ry0 = Math.floor(h * r.y0);
      const ry1 = Math.floor(h * r.y1);
      let bright = 0;
      let colored = 0;
      let total = 0;
      for (let y = ry0; y < ry1; y++) {
        for (let x = rx0; x < rx1; x++) {
          const i = (y * w + x) * 4;
          const r8 = data[i]!;
          const g = data[i + 1]!;
          const b = data[i + 2]!;
          total++;
          if (r8 + g + b > 40) bright++;
          if (Math.abs(r8 - g) > 12 || Math.abs(r8 - b) > 12 || Math.abs(g - b) > 12) colored++;
        }
      }
      return { bright, colored, total };
    },
    { dataUrl: `data:image/png;base64,${b64}`, r: rect },
  );
}

/** Playwright screenshot of the cube deck (what users see), with optional artifact attach. */
export async function cubeViewScreenshotStats(
  page: Page,
  rect: CanvasRect = CUBE_VOLUME_INSET,
  attachName?: string,
): Promise<{ stats: CanvasStats; png: Buffer }> {
  const view = page.locator(CUBE_VIEW_SEL);
  await expect(view).toBeVisible({ timeout: 60_000 });
  const png = await view.screenshot();
  if (attachName) {
    await test.info().attach(attachName, { body: png, contentType: "image/png" });
  }
  const stats = await statsFromPngBuffer(page, png, rect);
  return { stats, png };
}

async function canvasStatsGl(
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
          // WebGL readPixels origin is bottom-left; align with screenshot (top-left).
          const yi = h - 1 - y;
          const i = (yi * w + x) * 4;
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
    .poll(async () => canvasStatsGl(page, "canvas.landmarks__webgl"), { timeout: 60_000 })
    .toMatchObject({ bright: expect.any(Number), colored: expect.any(Number) });
  const stats = await canvasStatsGl(page, "canvas.landmarks__webgl");
  expect(stats).toBeTruthy();
  expect(stats!.bright).toBeGreaterThan(500);
  expect(stats!.colored).toBeGreaterThan(150);
}

export async function expectCubeShowsMultichannelImage(page: Page) {
  await expectCubeMainViewportScreenshot(page, "Top view", "cube-top-viewport-screenshot");
  await expectCubeMainViewportScreenshot(page, "Oblique view", "cube-iso-viewport-screenshot");
}

export async function expectCubeMainViewportScreenshot(
  page: Page,
  preset: "Top view" | "Oblique view",
  attachName: string,
) {
  await page.getByRole("radio", { name: preset }).click();
  await expect(page.locator(CUBE_VIEW_SEL)).toHaveAttribute("data-refining", "false", { timeout: 120_000 });
  await expect(page.locator(CUBE_VIEW_SEL)).toHaveAttribute("data-image-format", /r8unorm|r16unorm|r32float/, {
    timeout: 120_000,
  });
  await page.waitForTimeout(600);
  const { stats, png } = await cubeViewScreenshotStats(page, CUBE_VOLUME_INSET, attachName);
  const glStats = await canvasStatsGl(page, cubeCanvasSel, CUBE_VOLUME_INSET);
  expect(glStats).toBeTruthy();
  expect(stats.bright, `${preset} screenshot: volume ink in box interior`).toBeGreaterThan(120);
  expect(stats.colored, `${preset} screenshot: multichannel tint in box interior`).toBeGreaterThan(80);
  expect(
    glStats!.bright > 120 && stats.bright < 40,
    `${preset}: GL readback bright but user screenshot empty (buffer/canvas mismatch)`,
  ).toBe(false);
  void png;
}

/** User-visible cube deck capture (Playwright element screenshot, same as page clip). */
export async function expectCubeUserVisibleScreenshot(page: Page) {
  await expectCubeMainViewportScreenshot(page, "Top view", "cube-top-user-visible");
  await expectCubeMainViewportScreenshot(page, "Oblique view", "cube-iso-user-visible");
}

export async function expectCubePixelsChangeWhenPanckOff(page: Page) {
  await page.getByRole("radio", { name: "Oblique view" }).click();
  await page.waitForTimeout(400);

  const sumFromScreenshot = async () => {
    const { stats, png } = await cubeViewScreenshotStats(page, CUBE_VOLUME_INSET);
    const b64 = png.toString("base64");
    const sum = await page.evaluate(
      async ({ dataUrl, r }) => {
        const img = await createImageBitmap(await (await fetch(dataUrl)).blob());
        const ctx = new OffscreenCanvas(img.width, img.height).getContext("2d")!;
        ctx.drawImage(img, 0, 0);
        const { width: w, height: h, data } = ctx.getImageData(0, 0, img.width, img.height);
        const rx0 = Math.floor(w * r.x0);
        const rx1 = Math.floor(w * r.x1);
        const ry0 = Math.floor(h * r.y0);
        const ry1 = Math.floor(h * r.y1);
        let sum = 0;
        for (let y = ry0; y < ry1; y++) {
          for (let x = rx0; x < rx1; x++) {
            const i = (y * w + x) * 4;
            sum += data[i]! + data[i + 1]! + data[i + 2]!;
          }
        }
        return sum;
      },
      { dataUrl: `data:image/png;base64,${b64}`, r: CUBE_VOLUME_INSET },
    );
    void stats;
    return sum;
  };

  const twoChannelSum = await sumFromScreenshot();
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
  const oneChannelSum = await sumFromScreenshot();
  expect(oneChannelSum).not.toBe(twoChannelSum);
}
