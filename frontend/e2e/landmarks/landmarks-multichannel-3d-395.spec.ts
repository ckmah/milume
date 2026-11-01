import { expect } from "@playwright/test";

import { test } from "../fixtures";
import {
  bootIssue395LandmarksVolume,
  openIssue395CubeAtInspectCentre,
  openLayersPanelWithCubeOpen,
  runIssue395ToggleClipFlow,
} from "../helpers/issue395-cube-flow";
import {
  expectCubeFootprintChangesTopToIso,
  expectCubeDapiContrastDimsBlueLive,
  expectCubePanckOffDimsMagentaLive,
  expectCubeDapiOnlyShowsVolume,
  expectCubeMainViewportChangesWhenPanckToggledViaLayers,
  expectMapCubeImageChannelStateAligned,
  expectCubeMainViewportMultichannelTints,
  expectCubeShowsMultichannelImage,
  expectCubeUserVisibleScreenshot,
  expectCubeVolumeSurvivesMapImageHidden,
  expectMapBandShowsMultichannelImage,
  expectNoDeckShaderCompileOverlay,
  hideMapPointsForImageAssert,
} from "../helpers/shader-and-pixels";
import {
  getModel,
  shot,
  stabilizeUi,
} from "../helpers";

const volumeHarness = process.env.E2E_HARNESS === "landmarks-volume";
const issue395 = (process.env.E2E_VOLUME_PROFILE ?? "toy") === "issue395-3d";

async function openImagePanelInInspect(page: import("@playwright/test").Page) {
  await openLayersPanelWithCubeOpen(page);
}

test.describe("multichannel 3D (#395) — landmarks-volume harness", () => {
  test.describe.configure({ mode: "serial" });
  test.skip(!volumeHarness || !issue395, "requires E2E_HARNESS=landmarks-volume and E2E_VOLUME_PROFILE=issue395-3d");

  test.beforeEach(async ({ page }) => {
    await bootIssue395LandmarksVolume(page);
  });

  test("map band shows blended multichannel tissue", async ({ page }) => {
    await expectMapBandShowsMultichannelImage(page);
    await expectNoDeckShaderCompileOverlay(page);
  });

  test("cube compiles shader and shows blended channels", async ({ page }) => {
    await openIssue395CubeAtInspectCentre(page);
    await expectCubeShowsMultichannelImage(page);
  });

  test("main viewport shows DAPI and PanCK tints (Top and Iso)", async ({ page }) => {
    await openIssue395CubeAtInspectCentre(page);
    await expectCubeMainViewportMultichannelTints(page, "Top view");
    await expectCubeMainViewportMultichannelTints(page, "Oblique view");
  });

  test("clip viewport states (Top, Iso, PanCK off/on) reject solid fill and empty", async ({ page }) => {
    await runIssue395ToggleClipFlow(page);
  });

  test("cube volume survives hiding map image (not flat backdrop bleed)", async ({ page }) => {
    await openIssue395CubeAtInspectCentre(page);
    await expectCubeVolumeSurvivesMapImageHidden(page);
  });

  test("Top vs Oblique changes cube GL footprint", async ({ page }) => {
    await openIssue395CubeAtInspectCentre(page);
    await expectCubeFootprintChangesTopToIso(page);
  });

  test("Playwright cube viewport screenshot shows multichannel ink in box (Top and Oblique)", async ({
    page,
  }) => {
    await openIssue395CubeAtInspectCentre(page);
    await expectCubeUserVisibleScreenshot(page);
  });

  test("DAPI-only channel still renders volume in cube (fixture sanity)", async ({ page }) => {
    await expectCubeDapiOnlyShowsVolume(page);
  });

  test.skip("live DAPI contrast crush drops blue in cube GL without closing cube", async ({ page }) => {
    // Live cube contrast rendering is #417; trait/state coverage is separate in this spec.
    await openIssue395CubeAtInspectCentre(page);
    await expectCubeDapiContrastDimsBlueLive(page);
  });

  test.skip("live PanCK off drops magenta in cube GL without closing cube", async ({ page }) => {
    // Live cube GL readback for channel/contrast is #417; UI toggle + main viewport is covered below.
    await openIssue395CubeAtInspectCentre(page);
    await expectCubePanckOffDimsMagentaLive(page);
  });

  test("toggle PanCK in layers updates trait, data-channels, and main viewport", async ({ page }) => {
    await openIssue395CubeAtInspectCentre(page);
    await openImagePanelInInspect(page);
    await expectCubeMainViewportChangesWhenPanckToggledViaLayers(page);
  });

  test("per-channel contrast drag keeps map trait and cube channel state aligned", async ({ page }) => {
    await openIssue395CubeAtInspectCentre(page);
    await openImagePanelInInspect(page);
    await page.getByTestId("layer-channel-row-DAPI").focus();
    const loBefore = await page.evaluate(() => {
      const rows = window.__landmarksModel.get("_image_channels") as Array<{
        name: string;
        contrast_limits: [number, number];
      }>;
      const dapi = rows.find((c) => c.name === "DAPI");
      return dapi?.contrast_limits ?? [0, 0];
    });
    expect(loBefore[1]).toBeGreaterThan(loBefore[0]);
    const hiThumb = page.getByRole("slider", { name: "DAPI contrast, maximum" });
    await expect(hiThumb).toBeVisible();
    const box = await hiThumb.boundingBox();
    expect(box).toBeTruthy();
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.mouse.down();
    await page.mouse.move(box!.x - 60, box!.y + box!.height / 2, { steps: 16 });
    await page.mouse.up();
    await expect
      .poll(async () => {
        const rows = (await getModel(page, "_image_channels")) as Array<{
          name: string;
          contrast_limits: [number, number];
        }>;
        return rows.find((c) => c.name === "DAPI")?.contrast_limits?.[1] ?? 0;
      })
      .not.toBe(loBefore[1]);
    await expectMapCubeImageChannelStateAligned(page);
    await page.keyboard.press("Escape");
  });

  test("cube reports GPU bytes per visible channel", async ({ page }) => {
    await openIssue395CubeAtInspectCentre(page);
    const cube = page.getByRole("dialog", { name: "Cube" });
    await expect(cube.locator(".volume-cube__view")).toHaveAttribute("data-channels", "2");
    await expect(cube.locator(".volume-cube__view")).toHaveAttribute("data-gpu-channel-bytes", /\d+,\d+/);
    const bytes = await cube.locator(".volume-cube__view").getAttribute("data-gpu-channel-bytes");
    const parts = (bytes ?? "").split(",").map(Number);
    expect(parts.length).toBe(2);
    expect(parts.every((n) => n > 0)).toBeTruthy();
    await page.keyboard.press("Escape");
  });

  test("screenshot: cube two-channel blend", async ({ page }) => {
    await openIssue395CubeAtInspectCentre(page);
    await page.getByRole("radio", { name: "Oblique view" }).click();
    await page.waitForTimeout(800);
    await stabilizeUi(page);
    const widget = page.locator(".milume-widget.landmarks");
    await shot(page, "395-cube-two-channel-blend", widget);
  });

  test("screenshot: map band two-channel blend", async ({ page }) => {
    await hideMapPointsForImageAssert(page);
    await expectMapBandShowsMultichannelImage(page);
    await stabilizeUi(page);
    const widget = page.locator(".milume-widget.landmarks");
    await shot(page, "395-map-band-two-channel-blend", widget);
  });
});
