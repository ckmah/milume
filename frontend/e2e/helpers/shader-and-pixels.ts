import { expect, test, type Page } from "@playwright/test";

/** Sample the cube deck interior, excluding the outer wireframe margin (not the geometric center). */
export const CUBE_VOLUME_INSET = { x0: 0.2, y0: 0.2, x1: 0.8, y1: 0.8 } as const;

/**
 * Main cube viewport on `.volume-cube__view` screenshots: x 20%..width−60px, y 10%..85%
 * (reviewer convention on 1280×900 captures). Chromatic counts require saturation ≥ 20 so
 * axis/wireframe greys do not pass as tissue.
 */
export const CUBE_MAIN_VIEWPORT_RIGHT_MARGIN_PX = 60;
export const CUBE_MAIN_VIEWPORT = { x0: 0.2, y0: 0.1, x1: 1, y1: 0.85 } as const;

export type ChannelTintCounts = { dapi: number; panck: number; bright: number };

export type MainViewportSample = ChannelTintCounts & {
  bright60: number;
  chromatic: number;
  w: number;
  h: number;
  rx0: number;
  rx1: number;
  ry0: number;
  ry1: number;
};

const MAIN_VIEWPORT_MIN_LUMA = 45;
const MAIN_VIEWPORT_MIN_SAT = 20;
const MAIN_VIEWPORT_MIN_DAPI = 400;
const MAIN_VIEWPORT_MIN_PANCK = 150;
const MAIN_VIEWPORT_MIN_CHROMATIC = 800;

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

/** Playwright screenshot channel tint counts in the main viewport (user-visible deck). */
export async function cubeMainViewportChannelCounts(
  page: Page,
  rect: CanvasRect = CUBE_MAIN_VIEWPORT,
  marginRightPx = CUBE_MAIN_VIEWPORT_RIGHT_MARGIN_PX,
): Promise<MainViewportSample | null> {
  const png = await page.locator(CUBE_VIEW_SEL).screenshot();
  return page.evaluate(
    async ({ b64, r, marginRightPx: margin }) => {
      const img = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob());
      const ctx = new OffscreenCanvas(img.width, img.height).getContext("2d");
      if (!ctx) return null;
      ctx.drawImage(img, 0, 0);
      const { width: w, height: h, data } = ctx.getImageData(0, 0, img.width, img.height);
      const rx0 = Math.floor(w * r.x0);
      const rx1 = Math.min(w - margin, Math.floor(w * r.x1));
      const ry0 = Math.floor(h * r.y0);
      const ry1 = Math.floor(h * r.y1);
      let dapiN = 0;
      let panckN = 0;
      let bright = 0;
      let bright60 = 0;
      let chromatic = 0;
      for (let y = ry0; y < ry1; y++) {
        for (let x = rx0; x < rx1; x++) {
          const i = (y * w + x) * 4;
          const R = data[i]!;
          const G = data[i + 1]!;
          const B = data[i + 2]!;
          const luma = R + G + B;
          if (luma > 60) bright60++;
          if (luma < 45) continue;
          bright++;
          const sat = Math.max(R, G, B) - Math.min(R, G, B);
          if (sat < 20) continue;
          chromatic++;
          if (B > Math.max(R, G) + 8) dapiN++;
          // PanCK / magenta tint: high R and B, moderate saturation (additive with DAPI stays purple).
          if (R > 55 && B > 40 && R + B > G + 25 && R > G + 4) panckN++;
        }
      }
      return { dapi: dapiN, panck: panckN, bright, bright60, chromatic, w, h, rx0, rx1, ry0, ry1 };
    },
    { b64: png.toString("base64"), r: rect, marginRightPx },
  );
}

function formatMainViewportSample(sample: MainViewportSample): string {
  return `region px x=${sample.rx0}..${sample.rx1} y=${sample.ry0}..${sample.ry1} (${sample.w}×${sample.h}); thresholds luma≥${MAIN_VIEWPORT_MIN_LUMA} sat≥${MAIN_VIEWPORT_MIN_SAT}; measured dapi=${sample.dapi} panck=${sample.panck} bright=${sample.bright} bright60=${sample.bright60} chromatic=${sample.chromatic}`;
}

export async function expectCubeMainViewportMultichannelTints(
  page: Page,
  preset: "Top view" | "Oblique view",
  minDapi = preset === "Top view" ? 150 : MAIN_VIEWPORT_MIN_DAPI,
  minPanck = MAIN_VIEWPORT_MIN_PANCK,
) {
  await page.getByRole("radio", { name: preset }).click();
  await expect(page.locator(CUBE_VIEW_SEL)).toHaveAttribute("data-refining", "false", { timeout: 120_000 });
  await expect(page.locator(CUBE_VIEW_SEL)).toHaveAttribute("data-image-format", /r8unorm|r16unorm|r32float/, {
    timeout: 120_000,
  });
  await page.waitForTimeout(800);
  const counts = await cubeMainViewportChannelCounts(page);
  expect(counts, `${preset} main viewport screenshot`).toBeTruthy();
  const detail = formatMainViewportSample(counts!);
  expect(
    counts!.chromatic,
    `${preset} main viewport needs saturated tissue ink, not wireframe alone (${detail})`,
  ).toBeGreaterThanOrEqual(MAIN_VIEWPORT_MIN_CHROMATIC);
  expect(
    counts!.dapi,
    `${preset} main viewport must show blue-dominant (DAPI) voxels (${detail})`,
  ).toBeGreaterThanOrEqual(minDapi);
  expect(
    counts!.panck,
    `${preset} main viewport must show magenta-dominant (PanCK) voxels (${detail})`,
  ).toBeGreaterThanOrEqual(minPanck);
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
  await page.getByTestId("layer-channel-PanCK").click({ force: true });
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
  await page.getByTestId("layer-channel-PanCK").click({ force: true });
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
  await page.getByTestId("layer-channel-PanCK").click({ force: true });
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

type ImageChannelTraitRow = {
  name: string;
  visible: boolean;
  constant_zero?: boolean;
  contrast_limits?: [number, number];
};

/** Trait rows, volume.channels, and cube `data-channels` stay in sync (not live GL contrast). */
export async function expectMapCubeImageChannelStateAligned(page: Page) {
  const snap = await page.evaluate(() => {
    const rows = window.__landmarksModel.get("_image_channels") as ImageChannelTraitRow[];
    const vol = window.__landmarksModel.get("volume") as { channels?: ImageChannelTraitRow[] };
    const volRows = vol?.channels ?? [];
    const dataChannels =
      document
        .querySelector('[role="dialog"][aria-label="Cube"] .volume-cube__view')
        ?.getAttribute("data-channels") ?? "";
    const visibleCount = rows.filter((r) => r.visible && !r.constant_zero).length;
    return { rows, volRows, dataChannels, visibleCount };
  });
  expect(Number(snap.dataChannels), "cube data-channels vs trait visibility").toBe(snap.visibleCount);
  for (const row of snap.rows) {
    const vol = snap.volRows.find((v) => v.name === row.name);
    expect(vol, `volume.channels entry for ${row.name}`).toBeTruthy();
    expect(vol!.visible).toBe(row.visible);
    expect(vol!.contrast_limits?.[0]).toBe(row.contrast_limits?.[0]);
    expect(vol!.contrast_limits?.[1]).toBe(row.contrast_limits?.[1]);
  }
}

/** PanCK off/on via layers UI while cube is open; main viewport magenta must drop then return. */
export async function expectCubeMainViewportChangesWhenPanckToggledViaLayers(page: Page) {
  await page.getByRole("radio", { name: "Oblique view" }).click();
  await expect(page.locator(CUBE_VIEW_SEL)).toHaveAttribute("data-refining", "false", { timeout: 120_000 });
  await page.waitForTimeout(500);
  const labelsBtn = page.getByRole("button", { name: "Labels" });
  if ((await labelsBtn.getAttribute("aria-pressed")) === "true") {
    await labelsBtn.click();
    await page.waitForTimeout(600);
    await expect(page.locator(CUBE_VIEW_SEL)).toHaveAttribute("data-refining", "false", { timeout: 120_000 });
  }
  const before = await cubeMainViewportChannelCounts(page);
  expect(before, "two-channel baseline in main viewport").toBeTruthy();
  expect(before!.panck, formatMainViewportSample(before!)).toBeGreaterThanOrEqual(25);
  await expectMapCubeImageChannelStateAligned(page);
  const pngTwoChannel = await page.locator(CUBE_VIEW_SEL).screenshot();

  const panckSwitch = page.getByTestId("layer-channel-PanCK");
  await expect(panckSwitch).toBeVisible();
  const clickPanckSwitch = async () => {
    const sw = page.getByTestId("layer-channel-PanCK");
    const box = await sw.boundingBox();
    expect(box).toBeTruthy();
    const cx = box!.x + box!.width / 2;
    const cy = box!.y + box!.height / 2;
    await page.mouse.move(cx - 100, cy - 60, { steps: 8 });
    await page.waitForTimeout(120);
    await page.mouse.move(cx, cy, { steps: 10 });
    await page.waitForTimeout(100);
    await page.mouse.click(cx, cy);
  };
  await clickPanckSwitch();
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
  await expect(page.locator(CUBE_VIEW_SEL)).toHaveAttribute("data-refining", "false", { timeout: 120_000 });
  await page.waitForTimeout(800);
  await expectMapCubeImageChannelStateAligned(page);
  const pngPanckOff = await page.locator(CUBE_VIEW_SEL).screenshot();
  expect(
    pngTwoChannel.equals(pngPanckOff),
    "PanCK off must change the main cube viewport pixels",
  ).toBe(false);
  const panckOff = await cubeMainViewportChannelCounts(page);
  expect(panckOff).toBeTruthy();
  expect(
    panckOff!.panck,
    `PanCK off must drop magenta in main viewport (${formatMainViewportSample(panckOff!)})`,
  ).toBeLessThan(Math.max(15, Math.floor(before!.panck * 0.5)));

  await clickPanckSwitch();
  await expect
    .poll(async () => {
      const rows = (await page.evaluate(() => window.__landmarksModel.get("_image_channels"))) as Array<{
        name: string;
        visible: boolean;
      }>;
      return rows.find((c) => c.name === "PanCK")?.visible;
    })
    .toBe(true);
  await expect(page.locator(CUBE_VIEW_SEL)).toHaveAttribute("data-channels", "2", { timeout: 30_000 });
  await expect(page.locator(CUBE_VIEW_SEL)).toHaveAttribute("data-refining", "false", { timeout: 120_000 });
  await page.waitForTimeout(800);
  await expectMapCubeImageChannelStateAligned(page);
  const pngPanckOn = await page.locator(CUBE_VIEW_SEL).screenshot();
  expect(
    pngPanckOff.equals(pngPanckOn),
    "PanCK on must change the main cube viewport pixels again",
  ).toBe(false);
  const panckOn = await cubeMainViewportChannelCounts(page);
  expect(panckOn).toBeTruthy();
  expect(
    panckOn!.panck,
    `PanCK on must restore magenta-dominant voxels in the main cube viewport (${formatMainViewportSample(panckOn!)})`,
  ).toBeGreaterThanOrEqual(25);
}
