import { expect, type Page } from "@playwright/test";

import {
  bootLandmarksVolumeHarness,
  stabilizeUi,
} from "../helpers";
import {
  CUBE_VIEW_SEL,
  CUBE_VOLUME_INSET,
  analyzeIssue395PanckSitesInCubeView,
  canvasStatsGl,
  expectIssue395PanckMagentaSitesInCubeMainViewport,
  expectNoDeckShaderCompileOverlay,
  hideMapPointsForImageAssert,
  inferIssue395CubeViewportInkMode,
  rejectCubeViewportEmpty,
  rejectCubeViewportSolidFill,
  waitForCubeViewportInk,
  type CubeViewportInkMode,
} from "./shader-and-pixels";

export const ISSUE395_INSPECT_CX = 130.5;
export const ISSUE395_INSPECT_CY = 170.5;

/**
 * Uint8 multichannel cube value domain (issue395-3d, r8unorm):
 * - GPU sample `intensity`: 0–1 (unorm)
 * - inject `* imageScale`: 0–255 raw (imageScale = 255)
 * - `apply_contrast_limits(v, lim)`: 0–1 after window (DAPI lim 12–240, PanCK lim 12–220)
 * Scale is applied once in inject only; tintedSample must not multiply again.
 */
export const ISSUE395_UINT8_VALUE_DOMAIN = {
  sampleUnorm: "[0, 1]",
  afterInjectScale: "[0, 255] raw (imageScale = 255 for r8unorm)",
  injectContrast: "apply_contrast_limits(intensity * imageScale, contrastLimits) per Viv channel",
  afterInjectContrast: "[0, 1] before palette",
  dapiContrastLimits: [12, 240] as const,
  panckContrastLimits: [12, 220] as const,
  tintedSample: "palette lookup only; no second scale or contrast",
} as const;

export async function hideLandmarksVolumeHarnessChrome(page: Page) {
  await page.addStyleTag({
    content: `
      [data-testid="harness-banner"],
      .harness-banner,
      .landmarks-volume-harness__banner,
      .landmarks-volume-harness__controls,
      [data-dialkit-panel],
      .dialkit-root,
      .deckgl-error-overlay { display: none !important; }
      button pre { display: none !important; pointer-events: none !important; }
    `,
  });
}

export async function bootIssue395LandmarksVolume(page: Page, query = "noDialkit=1") {
  await bootLandmarksVolumeHarness(page, query);
  await hideLandmarksVolumeHarnessChrome(page);
  await hideMapPointsForImageAssert(page);
  await stabilizeUi(page);
}

export async function waitCubeRefined(page: Page, timeout = 120_000) {
  await expect(page.locator(CUBE_VIEW_SEL)).toHaveAttribute("data-refining", "false", { timeout });
  await expect(page.locator(CUBE_VIEW_SEL)).toHaveAttribute("data-image-format", /r8unorm|r16unorm|r32float/, {
    timeout,
  });
}

export async function openIssue395CubeAtInspectCentre(page: Page) {
  await page.evaluate(
    ({ cx, cy }) => {
      window.__landmarksModel.set("inspect_cx", cx);
      window.__landmarksModel.set("inspect_cy", cy);
      window.__landmarksModel.save_changes();
    },
    { cx: ISSUE395_INSPECT_CX, cy: ISSUE395_INSPECT_CY },
  );
  await page.getByRole("radio", { name: "Inspect", exact: true }).click();
  const plot = page.locator(".landmarks__plot");
  const box = await plot.boundingBox();
  expect(box).toBeTruthy();
  await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await expect(page.getByRole("dialog", { name: "Cube" })).toBeVisible({ timeout: 60_000 });
  await waitCubeRefined(page);
}

export async function setCubePreset(page: Page, preset: "Top view" | "Oblique view") {
  await page.getByRole("radio", { name: preset }).click();
  await waitCubeRefined(page);
  await page.waitForTimeout(preset === "Oblique view" ? 800 : 600);
}

/** Wait for refined cube, settled deck frame, and non-empty GL/screenshot ink before captures. */
export async function waitIssue395CubeReadyForCapture(
  page: Page,
  label: string,
  mode?: CubeViewportInkMode,
) {
  await waitCubeRefined(page);
  await expectNoDeckShaderCompileOverlay(page);
  const resolved = mode ?? (await inferIssue395CubeViewportInkMode(page));
  await waitForCubeViewportInk(page, resolved);
  await expect(page.locator(CUBE_VIEW_SEL)).toHaveAttribute("data-settled", "true", { timeout: 60_000 });
  const rendersBefore = await page.evaluate(() => (window as unknown as { __volumeCubeRenderCount?: number }).__volumeCubeRenderCount ?? 0);
  try {
    await expect
      .poll(async () => page.evaluate(() => (window as unknown as { __volumeCubeRenderCount?: number }).__volumeCubeRenderCount ?? 0), {
        timeout: 8_000,
      })
      .toBeGreaterThan(rendersBefore);
  } catch {
    await page.waitForTimeout(800);
  }
  await page.waitForTimeout(600);
  await rejectCubeViewportEmpty(page, label, resolved);
  const mapStats = await canvasStatsGl(page, "canvas.landmarks__webgl");
  const cubeGl = await canvasStatsGl(page, `${CUBE_VIEW_SEL} canvas`, CUBE_VOLUME_INSET);
  if (
    mapStats &&
    cubeGl &&
    mapStats.colored > 150 &&
    cubeGl.blueTissue < 100 &&
    resolved !== "panck-only"
  ) {
    expect(
      cubeGl.blueTissue,
      `${label}: map shows tissue but cube GL inset lacks DAPI (map colored=${mapStats.colored}; cube blue=${cubeGl.blueTissue} tissue=${cubeGl.tissue})`,
    ).toBeGreaterThanOrEqual(800);
  }
  await page.waitForFunction(
    () => {
      const view = document.querySelector('[role="dialog"][aria-label="Cube"] .volume-cube__view');
      if (!view) return false;
      const r = view.getBoundingClientRect();
      const cx = r.left + r.width * 0.45;
      const cy = r.top + r.height * 0.45;
      const top = document.elementFromPoint(cx, cy);
      return top instanceof HTMLCanvasElement && view.contains(top);
    },
    null,
    { timeout: 15_000 },
  );
}

export async function prepareIssue395DapiOnlyObliqueView(page: Page) {
  await setCubeLabels(page, false);
  await setCubePreset(page, "Top view");
  await setCubePreset(page, "Oblique view");
  await openLayersPanelWithCubeOpen(page);
  await clickPanckLayerSwitch(page);
  await expectPanckVisible(page, false);
  await waitIssue395CubeReadyForCapture(page, "DAPI-only Oblique", "dapi-only");
}

export async function setCubeLabels(page: Page, on: boolean) {
  const btn = page.getByRole("button", { name: "Labels" });
  const pressed = (await btn.getAttribute("aria-pressed")) === "true";
  if (pressed !== on) await btn.click();
  await page.waitForTimeout(on ? 400 : 600);
  if (on) {
    await expect(page.locator(CUBE_VIEW_SEL)).toHaveAttribute("data-labels", "on", { timeout: 60_000 });
  }
}

export async function openLayersPanelWithCubeOpen(page: Page) {
  await page.evaluate(() => {
    const root = document.querySelector(".milume-widget.landmarks");
    if (root instanceof HTMLElement) root.focus();
  });
  const left = page.locator(".landmarks__chrome-dock--left");
  if ((await left.getAttribute("data-collapsed")) === "true") {
    await page.getByRole("button", { name: "Show left panel" }).click();
  }
  await page.keyboard.press("[");
  await page.getByTestId("panel-section-layers").click({ force: true });
  const row = page.getByTestId("layers-image-row");
  if ((await row.getAttribute("aria-expanded")) !== "true") await row.click({ force: true });
  await page.getByTestId("layer-channel-PanCK").waitFor({ state: "visible", timeout: 30_000 });
}

export async function clickPanckLayerSwitch(page: Page) {
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
}

export async function expectPanckVisible(page: Page, visible: boolean) {
  await expect
    .poll(async () => {
      const rows = (await page.evaluate(() => window.__landmarksModel.get("_image_channels"))) as Array<{
        name: string;
        visible: boolean;
      }>;
      return rows.find((c) => c.name === "PanCK")?.visible;
    })
    .toBe(visible);
  const channels = visible ? "2" : "1";
  await expect(page.locator(CUBE_VIEW_SEL)).toHaveAttribute("data-channels", channels, { timeout: 30_000 });
  await waitCubeRefined(page);
  await page.waitForTimeout(visible ? 800 : 700);
}

export async function expectDapiVisible(page: Page, visible: boolean) {
  await page.evaluate((on) => {
    const rows = window.__landmarksModel.get("_image_channels") as Array<{ name: string; visible: boolean }>;
    const next = rows.map((r) => (r.name === "DAPI" ? { ...r, visible: on } : r));
    window.__landmarksModel.set("_image_channels", next);
    window.__landmarksModel.save_changes();
  }, visible);
  await expect
    .poll(async () => {
      const rows = (await page.evaluate(() => window.__landmarksModel.get("_image_channels"))) as Array<{
        name: string;
        visible: boolean;
      }>;
      return rows.find((c) => c.name === "DAPI")?.visible;
    })
    .toBe(visible);
  const channels = visible ? (await page.evaluate(() => {
    const rows = window.__landmarksModel.get("_image_channels") as Array<{ name: string; visible: boolean }>;
    return rows.filter((c) => c.visible).length;
  })) : 0;
  if (visible) {
    await expect(page.locator(CUBE_VIEW_SEL)).toHaveAttribute("data-channels", String(channels), { timeout: 30_000 });
  }
  await waitCubeRefined(page);
  await page.waitForTimeout(700);
}

/** Same viewport checks for e2e and capture: no solid single-hue fill, not empty. */
export async function expectIssue395CubeViewportHealthy(
  page: Page,
  label: string,
  opts: { requirePanckSites?: boolean; forbidPanckSites?: boolean } = {},
) {
  await expectNoDeckShaderCompileOverlay(page);
  await rejectCubeViewportSolidFill(page, label);
  const channels = await page.locator(CUBE_VIEW_SEL).getAttribute("data-channels");
  const rows = (await page.evaluate(() => window.__landmarksModel.get("_image_channels"))) as Array<{
    name: string;
    visible: boolean;
  }>;
  const dapiOn = rows.find((c) => c.name === "DAPI")?.visible ?? true;
  const panckOn = rows.find((c) => c.name === "PanCK")?.visible ?? true;
  const mode =
    channels === "2"
      ? "dual"
      : panckOn && !dapiOn
        ? "panck-only"
        : "dapi-only";
  await rejectCubeViewportEmpty(page, label, mode);
  if (opts.requirePanckSites) {
    await expectIssue395PanckMagentaSitesInCubeMainViewport(page, "Oblique view");
  }
  if (opts.forbidPanckSites) {
    const analysis = await analyzeIssue395PanckSitesInCubeView(page);
    expect(analysis, `${label} PanCK site scan`).toBeTruthy();
    for (const site of analysis!.sites) {
      expect(
        site.maxComponent,
        `${label}: PanCK off must drop magenta at ${site.id}`,
      ).toBeLessThan(8);
    }
  }
}

/** Clip order: cube open (Iso) → layers → PanCK off → PanCK on. */
export async function runIssue395ToggleClipFlow(page: Page) {
  await openIssue395CubeAtInspectCentre(page);
  await setCubePreset(page, "Oblique view");
  await setCubeLabels(page, false);
  await expectIssue395CubeViewportHealthy(page, "two-channel Iso labels off", { requirePanckSites: true });
  await setCubePreset(page, "Top view");
  await expectIssue395CubeViewportHealthy(page, "two-channel Top labels off", { requirePanckSites: false });
  await setCubePreset(page, "Oblique view");
  await openLayersPanelWithCubeOpen(page);
  await page.waitForTimeout(400);
  await clickPanckLayerSwitch(page);
  await expectPanckVisible(page, false);
  await expectIssue395CubeViewportHealthy(page, "PanCK off", { forbidPanckSites: true });
  await clickPanckLayerSwitch(page);
  await expectPanckVisible(page, true);
  await expectIssue395CubeViewportHealthy(page, "PanCK on", { requirePanckSites: true });
}
