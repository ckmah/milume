import { expect, test, type Page } from "@playwright/test";

/** Sample the cube deck interior, excluding the outer wireframe margin (not the geometric center). */
export const CUBE_VOLUME_INSET = { x0: 0.2, y0: 0.2, x1: 0.8, y1: 0.8 } as const;

/** Tighter inset for contrast asserts: axis ticks and frame lines sit just inside the 0.2 margin. */
export const CUBE_CONTRAST_INSET = { x0: 0.38, y0: 0.38, x1: 0.62, y1: 0.62 } as const;

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

type TintStats = { blueExcess: number; magentaExcess: number; bright: number; colored: number };

/** Cube deck GL readback inside the wireframe box (not the map plot canvas). */
export async function cubeGlTintStats(page: Page, rect: CanvasRect = CUBE_VOLUME_INSET): Promise<TintStats | null> {
  return page.evaluate(
    ({ sel, r }) => {
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
      let blueExcess = 0;
      let magentaExcess = 0;
      let bright = 0;
      let colored = 0;
      for (let y = ry0; y < ry1; y++) {
        for (let x = rx0; x < rx1; x++) {
          const yi = h - 1 - y;
          const i = (yi * w + x) * 4;
          const r8 = buf[i]!;
          const g = buf[i + 1]!;
          const b = buf[i + 2]!;
          if (r8 + g + b > 40) bright++;
          if (Math.abs(r8 - g) > 12 || Math.abs(r8 - b) > 12 || Math.abs(g - b) > 12) colored++;
          blueExcess += Math.max(0, b - Math.max(r8, g) - 10);
          magentaExcess += Math.max(0, r8 + b - 2 * g - 20);
        }
      }
      return { blueExcess, magentaExcess, bright, colored };
    },
    { sel: cubeCanvasSel, r: rect },
  );
}

/** Stable subsample of cube GL pixels; Top vs Iso must differ when the volume re-projects. */
export async function cubeGlFootprintSample(
  page: Page,
  preset: "Top view" | "Oblique view",
): Promise<number[] | null> {
  await page.getByRole("radio", { name: preset }).click();
  await expect(page.locator(CUBE_VIEW_SEL)).toHaveAttribute("data-refining", "false", { timeout: 120_000 });
  await page.waitForTimeout(500);
  return page.evaluate(
    ({ sel, r }) => {
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
      const out: number[] = [];
      for (let y = ry0; y < ry1; y += 4) {
        for (let x = rx0; x < rx1; x += 4) {
          const yi = h - 1 - y;
          const i = (yi * w + x) * 4;
          out.push(buf[i]!, buf[i + 1]!, buf[i + 2]!);
        }
      }
      return out;
    },
    { sel: cubeCanvasSel, r: CUBE_VOLUME_INSET },
  );
}

export async function expectCubeVolumeSurvivesMapImageHidden(page: Page) {
  await expect(page.locator(CUBE_VIEW_SEL)).toHaveAttribute("data-refining", "false", { timeout: 120_000 });
  const before = await cubeGlTintStats(page);
  expect(before).toBeTruthy();
  expect(before!.colored, "cube must show multichannel ink before map hide").toBeGreaterThan(80);
  await page.evaluate(() => {
    window.__landmarksModel.set("_image_visible", false);
    window.__landmarksModel.save_changes();
  });
  await page.waitForTimeout(900);
  const after = await cubeGlTintStats(page);
  expect(after).toBeTruthy();
  expect(
    after!.colored,
    "hiding map image must not remove cube volume (backdrop bleed)",
  ).toBeGreaterThan(Math.max(60, before!.colored * 0.55));
  await page.evaluate(() => {
    window.__landmarksModel.set("_image_visible", true);
    window.__landmarksModel.save_changes();
  });
}

export async function expectCubeFootprintChangesTopToIso(page: Page) {
  const top = await cubeGlFootprintSample(page, "Top view");
  const iso = await cubeGlFootprintSample(page, "Oblique view");
  expect(top).toBeTruthy();
  expect(iso).toBeTruthy();
  expect(top!.length).toBe(iso!.length);
  let diff = 0;
  for (let i = 0; i < top!.length; i++) {
    if (top![i] !== iso![i]) diff++;
  }
  expect(diff, "Top vs Oblique cube GL footprint (flat backdrop stays fixed)").toBeGreaterThan(120);
}

export async function expectCubeDapiContrastRemovesBlue(page: Page) {
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
  const reopenCube = async () => {
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "Cube" })).toHaveCount(0, { timeout: 30_000 });
    await page.getByRole("radio", { name: "Inspect", exact: true }).click();
    const plot = page.locator(".landmarks__plot");
    const box = await plot.boundingBox();
    expect(box).toBeTruthy();
    await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await expect(page.getByRole("dialog", { name: "Cube" })).toBeVisible({ timeout: 60_000 });
    await expect(page.locator(CUBE_VIEW_SEL)).toHaveAttribute("data-refining", "false", { timeout: 120_000 });
    await page.getByRole("radio", { name: "Oblique view" }).click();
    await page.waitForTimeout(800);
  };
  await reopenCube();
  const before = await cubeGlTintStats(page, CUBE_CONTRAST_INSET);
  expect(before).toBeTruthy();
  expect(before!.bright, "DAPI-only cube should show tissue before contrast change").toBeGreaterThan(80);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Cube" })).toHaveCount(0, { timeout: 30_000 });
  await page.evaluate(() => {
    const rows = window.__landmarksModel.get("_image_channels") as Array<{
      name: string;
      contrast_limits: [number, number];
    }>;
    const next = rows.map((r) =>
      r.name === "DAPI" ? { ...r, contrast_limits: [0, 0] as [number, number] } : r,
    );
    window.__landmarksModel.set("_image_channels", next);
    window.__landmarksModel.save_changes();
  });
  await reopenCube();
  const after = await cubeGlTintStats(page);
  expect(after).toBeTruthy();
  expect(
    after!.bright,
    "DAPI contrast max→0 must remove DAPI signal in cube deck GL",
  ).toBeLessThan(Math.max(40, before!.bright * 0.15));
}

export async function expectCubePanckOffRemovesMagenta(page: Page) {
  const before = await cubeGlTintStats(page, CUBE_CONTRAST_INSET);
  expect(before).toBeTruthy();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Cube" })).toHaveCount(0, { timeout: 30_000 });
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
  await expect(page.getByRole("dialog", { name: "Cube" })).toBeVisible({ timeout: 60_000 });
  await expect(page.locator(CUBE_VIEW_SEL)).toHaveAttribute("data-refining", "false", { timeout: 120_000 });
  await page.getByRole("radio", { name: "Oblique view" }).click();
  await page.waitForTimeout(800);
  const after = await cubeGlTintStats(page);
  expect(after).toBeTruthy();
  expect(after!.magentaExcess).toBeLessThanOrEqual(before!.magentaExcess);
  if (before!.magentaExcess > 300) {
    expect(after!.magentaExcess).toBeLessThan(Math.max(80, before!.magentaExcess * 0.35));
  }
}

export async function expectCubeDapiContrastDimsBlueLive(page: Page) {
  await page.getByRole("radio", { name: "Oblique view" }).click();
  await expect(page.locator(CUBE_VIEW_SEL)).toHaveAttribute("data-refining", "false", { timeout: 120_000 });
  await page.waitForTimeout(600);
  await page.evaluate(() => {
    const rows = window.__landmarksModel.get("_image_channels") as Array<{ name: string; visible: boolean }>;
    const next = rows.map((r) => (r.name === "PanCK" ? { ...r, visible: false } : r));
    window.__landmarksModel.set("_image_channels", next);
    window.__landmarksModel.save_changes();
  });
  await expect(page.locator(CUBE_VIEW_SEL)).toHaveAttribute("data-channels", "1", { timeout: 30_000 });
  await page.waitForTimeout(800);
  const beforeGl = await cubeGlTintStats(page, CUBE_VOLUME_INSET);
  expect(beforeGl).toBeTruthy();
  expect(beforeGl!.blueExcess, "DAPI tissue blue in cube before contrast crush").toBeGreaterThan(120);
  const minLo = await page.evaluate(() => {
    const rows = window.__landmarksModel.get("_image_channels") as Array<{
      name: string;
      contrast_limits: [number, number];
    }>;
    return rows.find((c) => c.name === "DAPI")?.contrast_limits?.[0] ?? 0;
  });
  await page.evaluate((lo) => {
    const model = window.__landmarksModel;
    const rows = model.get("_image_channels") as Array<{
      name: string;
      contrast_limits: [number, number];
    }>;
    const nextRows = rows.map((r) =>
      r.name === "DAPI" ? { ...r, contrast_limits: [lo, lo] as [number, number] } : r,
    );
    const vol = { ...(model.get("volume") as Record<string, unknown>) };
    const volChannels = [...((vol.channels as typeof nextRows) ?? [])];
    const apply = (list: typeof nextRows) => {
      const i = list.findIndex((c) => c.name === "DAPI");
      if (i < 0) return list;
      const out = list.slice();
      out[i] = { ...out[i]!, contrast_limits: [lo, lo] as [number, number] };
      return out;
    };
    model.set("_image_channels", nextRows);
    model.set("volume", { ...vol, channels: apply(volChannels.length ? volChannels : nextRows) });
    model.save_changes();
  }, minLo);
  await expect
    .poll(async () => {
      const rows = (await page.evaluate(() => window.__landmarksModel.get("_image_channels"))) as Array<{
        name: string;
        contrast_limits: [number, number];
      }>;
      const dapi = rows.find((c) => c.name === "DAPI")?.contrast_limits;
      return dapi ? `${dapi[0]},${dapi[1]}` : "";
    })
    .toBe(`${minLo},${minLo}`);
  await expect(page.locator(CUBE_VIEW_SEL)).toHaveAttribute("data-refining", "false", { timeout: 120_000 });
  await page.waitForTimeout(600);
  await expect
    .poll(async () => (await cubeGlTintStats(page, CUBE_VOLUME_INSET))?.blueExcess ?? Number.MAX_SAFE_INTEGER, {
      timeout: 15_000,
    })
    .toBeLessThan(Math.max(40, beforeGl!.blueExcess * 0.2));
  const afterGl = await cubeGlTintStats(page, CUBE_VOLUME_INSET);
  expect(afterGl).toBeTruthy();
  expect(
    afterGl!.blueExcess,
    "DAPI max→min must drop blue-weighted cube GL signal at least ~80% without closing cube",
  ).toBeLessThan(Math.max(40, beforeGl!.blueExcess * 0.2));
}

export async function expectCubePanckOffDimsMagentaLive(page: Page) {
  await page.getByRole("radio", { name: "Oblique view" }).click();
  await page.waitForTimeout(600);
  const before = await cubeGlTintStats(page, CUBE_CONTRAST_INSET);
  expect(before).toBeTruthy();
  await page.evaluate(() => {
    const root = document.querySelector(".milume-widget.landmarks");
    if (root instanceof HTMLElement) root.focus();
  });
  await page.keyboard.press("[");
  await page.getByTestId("panel-section-layers").click({ force: true });
  const row = page.getByTestId("layers-image-row");
  if ((await row.getAttribute("aria-expanded")) !== "true") await row.click({ force: true });
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
  await expect(page.locator(CUBE_VIEW_SEL)).toHaveAttribute("data-channels", "1", { timeout: 30_000 });
  await page.waitForTimeout(700);
  const after = await cubeGlTintStats(page, CUBE_CONTRAST_INSET);
  expect(after).toBeTruthy();
  if (before!.magentaExcess > 200) {
    expect(
      after!.magentaExcess,
      "PanCK off must drop magenta in cube deck GL without closing cube",
    ).toBeLessThan(Math.max(40, before!.magentaExcess * 0.2));
  }
}

export async function expectCubeDapiOnlyShowsVolume(page: Page) {
  await page.evaluate(() => {
    const rows = window.__landmarksModel.get("_image_channels") as Array<{ name: string; visible: boolean }>;
    const next = rows.map((r) => (r.name === "PanCK" ? { ...r, visible: false } : r));
    window.__landmarksModel.set("_image_channels", next);
    window.__landmarksModel.save_changes();
  });
  await page.getByRole("radio", { name: "Inspect", exact: true }).click();
  const plot = page.locator(".landmarks__plot");
  const box = await plot.boundingBox();
  expect(box).toBeTruthy();
  await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await expect(page.getByRole("dialog", { name: "Cube" })).toBeVisible({ timeout: 60_000 });
  await expect(page.locator(CUBE_VIEW_SEL)).toHaveAttribute("data-refining", "false", { timeout: 120_000 });
  await page.getByRole("radio", { name: "Oblique view" }).click();
  await page.waitForTimeout(600);
  const stats = await cubeGlTintStats(page);
  expect(stats).toBeTruthy();
  expect(stats!.bright, "DAPI-only issue395 fixture must render tissue in cube").toBeGreaterThan(120);
  expect(stats!.blueExcess, "DAPI-only cube should retain blue channel ink").toBeGreaterThan(80);
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
  expect(glStats!.bright, `${preset} GL: volume ink in cube canvas`).toBeGreaterThan(120);
  expect(glStats!.colored, `${preset} GL: multichannel tint in cube canvas`).toBeGreaterThan(80);
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
  await expect(page.locator(CUBE_VIEW_SEL)).toHaveAttribute("data-refining", "false", { timeout: 120_000 });
  await page.waitForTimeout(500);
  const before = await cubeGlTintStats(page, CUBE_CONTRAST_INSET);
  expect(before).toBeTruthy();
  await page.evaluate(() => {
    const root = document.querySelector(".milume-widget.landmarks");
    if (root instanceof HTMLElement) root.focus();
  });
  await page.keyboard.press("[");
  await page.getByTestId("panel-section-layers").click({ force: true });
  const row = page.getByTestId("layers-image-row");
  if ((await row.getAttribute("aria-expanded")) !== "true") await row.click({ force: true });
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
  await expect(page.locator(CUBE_VIEW_SEL)).toHaveAttribute("data-channels", "1", { timeout: 30_000 });
  await page.waitForTimeout(700);
  const after = await cubeGlTintStats(page, CUBE_CONTRAST_INSET);
  expect(after).toBeTruthy();
  expect(after!.colored).toBeGreaterThan(40);
  if (before!.magentaExcess > 120) {
    expect(
      after!.magentaExcess,
      "PanCK off must change cube deck GL (magenta drops while cube stays open)",
    ).toBeLessThan(Math.max(40, before!.magentaExcess * 0.35));
  } else {
    expect(before!.colored - after!.colored, "two-channel vs DAPI-only must differ in cube GL").toBeGreaterThan(15);
  }
}
