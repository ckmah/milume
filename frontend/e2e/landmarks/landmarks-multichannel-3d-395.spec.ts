import { join } from "node:path";

import { expect } from "@playwright/test";

import { test } from "../fixtures";
import {
  bootIssue395LandmarksVolume,
  openIssue395CubeAtInspectCentre,
  openLayersPanelWithCubeOpen,
  expectIssue395CubeViewportHealthy,
  prepareIssue395DapiOnlyObliqueDirectOrder,
  runIssue395ToggleClipFlow,
  setCubeLabels,
  setCubePreset,
} from "../helpers/issue395-cube-flow";
import {
  expectCubeFootprintChangesTopToIso,
  cubeGlChecksum,
  cubeGlTintStats,
  CUBE_VIEW_SEL,
  CUBE_VOLUME_INSET,
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
  test.describe.configure({ mode: "serial", timeout: 240_000 });
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

  test("toggle order: PanCK off before Oblique still shows DAPI", async ({ page }) => {
    await openIssue395CubeAtInspectCentre(page);
    await prepareIssue395DapiOnlyObliqueDirectOrder(page);
    await expectIssue395CubeViewportHealthy(page, "DAPI-only direct order Oblique", { forbidPanckSites: true });
  });

  test("dual Oblique shows blended ink and PanCK sites after Top warmup", async ({ page }) => {
    await openIssue395CubeAtInspectCentre(page);
    await setCubePreset(page, "Top view");
    await setCubePreset(page, "Oblique view");
    await setCubeLabels(page, false);
    await expectIssue395CubeViewportHealthy(page, "dual Oblique labels off", { requirePanckSites: true });
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

  test("contrast drag changes cube GL readback for each channel", async ({ page }) => {
    await openIssue395CubeAtInspectCentre(page);
    await page.getByRole("radio", { name: "Oblique view" }).click();
    await expect(page.locator(CUBE_VIEW_SEL)).toHaveAttribute("data-refining", "false", { timeout: 120_000 });
    await openImagePanelInInspect(page);

    const before = await cubeGlChecksum(page, CUBE_VOLUME_INSET);
    const beforeTint = await cubeGlTintStats(page, CUBE_VOLUME_INSET);
    expect(before).not.toBeNull();
    expect(beforeTint).toBeTruthy();

    await page.getByTestId("layer-channel-row-DAPI").focus();
    const dapiHi = page.getByRole("slider", { name: "DAPI contrast, maximum" });
    await expect(dapiHi).toBeVisible();
    const dapiBox = await dapiHi.boundingBox();
    expect(dapiBox).toBeTruthy();
    await page.mouse.move(dapiBox!.x + dapiBox!.width / 2, dapiBox!.y + dapiBox!.height / 2);
    await page.mouse.down();
    await page.mouse.move(dapiBox!.x - 40, dapiBox!.y + dapiBox!.height / 2, { steps: 8 });
    await page.mouse.up();
    await expect
      .poll(async () => {
        const rows = (await getModel(page, "_image_channels")) as Array<{
          name: string;
          contrast_limits: [number, number];
        }>;
        return rows.find((c) => c.name === "DAPI")?.contrast_limits?.[1] ?? 0;
      })
      .toBeLessThan(240);
    const afterDapi = await cubeGlChecksum(page, CUBE_VOLUME_INSET);
    expect(afterDapi, "DAPI contrast drag changes cube GL readback").not.toBe(before);

    await page.getByTestId("layer-channel-row-PanCK").focus();
    const panckHi = page.getByRole("slider", { name: "PanCK contrast, maximum" });
    await expect(panckHi).toBeVisible();
    const panckBox = await panckHi.boundingBox();
    expect(panckBox).toBeTruthy();
    const beforePanck = await cubeGlChecksum(page, CUBE_VOLUME_INSET);
    await page.mouse.move(panckBox!.x + panckBox!.width / 2, panckBox!.y + panckBox!.height / 2);
    await page.mouse.down();
    await page.mouse.move(panckBox!.x - 36, panckBox!.y + panckBox!.height / 2, { steps: 8 });
    await page.mouse.up();
    await expect
      .poll(async () => {
        const rows = (await getModel(page, "_image_channels")) as Array<{
          name: string;
          contrast_limits: [number, number];
        }>;
        return rows.find((c) => c.name === "PanCK")?.contrast_limits?.[1] ?? 0;
      })
      .toBeLessThan(220);
    const afterPanck = await cubeGlChecksum(page, CUBE_VOLUME_INSET);
    expect(afterPanck, "PanCK contrast drag changes cube GL readback").not.toBe(beforePanck);

    const lo = await page.evaluate(() => {
      const rows = window.__landmarksModel.get("_image_channels") as Array<{
        name: string;
        contrast_limits: [number, number];
      }>;
      return rows.find((c) => c.name === "DAPI")?.contrast_limits?.[0] ?? 0;
    });
    await page.evaluate((min) => {
      const model = window.__landmarksModel;
      const apply = (rows: Array<{ name: string; contrast_limits: [number, number] }>) =>
        rows.map((r) => (r.name === "DAPI" ? { ...r, contrast_limits: [min, min] as [number, number] } : r));
      const rows = model.get("_image_channels") as Array<{ name: string; contrast_limits: [number, number] }>;
      const vol = { ...(model.get("volume") as Record<string, unknown>) };
      const volChannels = (vol.channels as typeof rows) ?? [];
      model.set("_image_channels", apply(rows));
      model.set("volume", { ...vol, channels: apply(volChannels) });
      model.save_changes();
    }, lo);
    await expect
      .poll(async () => (await cubeGlTintStats(page, CUBE_VOLUME_INSET))?.blueExcess ?? 0)
      .toBeGreaterThan(beforeTint!.blueExcess);
    await expectMapCubeImageChannelStateAligned(page);
    await page.keyboard.press("Escape");
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
    await hiThumb.focus();
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press("ArrowLeft");
    }
    await expect
      .poll(
        async () => {
          const rows = (await getModel(page, "_image_channels")) as Array<{
            name: string;
            contrast_limits: [number, number];
          }>;
          return rows.find((c) => c.name === "DAPI")?.contrast_limits?.[1] ?? 0;
        },
        { timeout: 20_000 },
      )
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
    await expect
      .poll(async () => cube.locator(".volume-cube__view").getAttribute("data-volume-sums"))
      .toMatch(/^\d+,\d+$/);
    const sums = (await cube.locator(".volume-cube__view").getAttribute("data-volume-sums"))!.split(",").map(Number);
    expect(sums[0]).not.toBe(sums[1]);
    expect(sums[0]).toBeGreaterThan(sums[1]);
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
    if (process.env.ISSUE395_CAPTURE_DOCS === "1") {
      await widget.screenshot({
        path: join(process.cwd(), "..", "docs/visual-acceptance/issue395/395-map-band-dpr2-dual-blend.png"),
      });
    }
  });
});
