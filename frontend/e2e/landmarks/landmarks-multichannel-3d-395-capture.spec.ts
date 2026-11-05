import { execFileSync } from "node:child_process";
import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { expect, type Page } from "@playwright/test";

import { test } from "../fixtures";
import {
  bootIssue395LandmarksVolume,
  expectIssue395CubeViewportHealthy,
  openIssue395CubeAtInspectCentre,
  prepareIssue395DapiOnlyObliqueDirectOrder,
  prepareIssue395DapiOnlyObliqueView,
  runIssue395ToggleClipFlow,
  setCubeLabels,
  setCubePreset,
  waitIssue395CubeReadyForCapture,
} from "../helpers/issue395-cube-flow";
import {
  analyzeIssue395PanckSitesInCubeView,
  hideMapPointsForImageAssert,
} from "../helpers/shader-and-pixels";

const volumeHarness = process.env.E2E_HARNESS === "landmarks-volume";
const issue395 = (process.env.E2E_VOLUME_PROFILE ?? "toy") === "issue395-3d";
const cubeViewSel = '[role="dialog"][aria-label="Cube"] .volume-cube__view';

async function captureIsoPanckRoIs(
  page: Page,
  outPath: string,
  label: string,
  testInfo: import("@playwright/test").TestInfo,
) {
  await setCubePreset(page, "Oblique view");
  await setCubeLabels(page, false);
  await waitIssue395CubeReadyForCapture(page, label, "dual");
  await expectIssue395CubeViewportHealthy(page, label, { requirePanckSites: true });
  const analysis = await analyzeIssue395PanckSitesInCubeView(page);
  expect(analysis, `${label} PanCK ROI scan`).toBeTruthy();
  const imageMode = await page.locator(cubeViewSel).getAttribute("data-image-mode");
  for (const site of analysis!.sites) {
    const pass =
      imageMode === "mip"
        ? site.panckPixels >= 14
        : site.maxComponent >= 14;
    expect(pass, `${label} ${site.id}`).toBeTruthy();
  }
  await page.locator(cubeViewSel).screenshot({ path: outPath });
  await testInfo.attach(label, { path: outPath, contentType: "image/png" });
}

test.describe("multichannel 3D (#395) capture — landmarks-volume harness", () => {
  test.describe.configure({ mode: "serial", timeout: 600_000 });
  test.skip(!volumeHarness || !issue395, "requires E2E_HARNESS=landmarks-volume and E2E_VOLUME_PROFILE=issue395-3d");

  test.beforeEach(async ({ page }) => {
    await bootIssue395LandmarksVolume(page);
    await hideMapPointsForImageAssert(page);
  });

  test("capture: dual ink and both PanCK toggle orders", async ({ page }, testInfo) => {
    const outDir = testInfo.outputDir;
    await mkdir(outDir, { recursive: true });

    await openIssue395CubeAtInspectCentre(page);
    await setCubePreset(page, "Top view");
    await captureIsoPanckRoIs(page, join(outDir, "395-capture-dual-iso-warm-top.png"), "dual iso warm top", testInfo);
    await captureIsoPanckRoIs(
      page,
      join(outDir, "395-capture-dual-iso-at-open.png"),
      "dual iso oblique",
      testInfo,
    );

    await prepareIssue395DapiOnlyObliqueView(page);
    await page.locator(cubeViewSel).screenshot({
      path: join(outDir, "395-capture-dapi-only-oblique-warm-order.png"),
    });

    await page.keyboard.press("Escape");
    await openIssue395CubeAtInspectCentre(page);
    await prepareIssue395DapiOnlyObliqueDirectOrder(page);
    await page.locator(cubeViewSel).screenshot({
      path: join(outDir, "395-capture-dapi-only-oblique-direct-order.png"),
    });

    await page.keyboard.press("Escape");
    await page.evaluate(() => {
      const rows = window.__landmarksModel.get("_image_channels") as Array<{ name: string; visible: boolean }>;
      window.__landmarksModel.set(
        "_image_channels",
        rows.map((row) => ({ ...row, visible: true })),
      );
      window.__landmarksModel.save_changes();
    });
    await openIssue395CubeAtInspectCentre(page);
    await setCubeLabels(page, false);
    await setCubePreset(page, "Oblique view");
    await waitIssue395CubeReadyForCapture(page, "labels off dual", "dual");
    await page.locator(".milume-widget.landmarks").screenshot({
      path: join(outDir, "395-capture-fullwidget-labels-off-dual-oblique.png"),
    });
    const publish = "/opt/cursor/artifacts/issue395";
    await mkdir(publish, { recursive: true });
    for (const name of [
      "395-capture-dual-iso-warm-top.png",
      "395-capture-dual-iso-at-open.png",
      "395-capture-dapi-only-oblique-warm-order.png",
      "395-capture-dapi-only-oblique-direct-order.png",
      "395-capture-fullwidget-labels-off-dual-oblique.png",
    ]) {
      await copyFile(join(outDir, name), join(publish, name)).catch(() => undefined);
    }
  });

  test("capture: toggle clip webm and 1 fps narrative", async ({ browser }, testInfo) => {
    const outDir = testInfo.outputDir;
    await mkdir(outDir, { recursive: true });
    const videoDir = join(outDir, "_toggle_video");
    await mkdir(videoDir, { recursive: true });

    const context = await browser.newContext({
      recordVideo: { dir: videoDir, size: { width: 1280, height: 900 } },
      viewport: { width: 1280, height: 900 },
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();
    await bootIssue395LandmarksVolume(page);

    const narrativeDir = join(outDir, "395-narrative-frames");
    await mkdir(narrativeDir, { recursive: true });
    const frames = {
      "dual-oblique": "395-narrative-01-dual-oblique.png",
      "panck-off": "395-narrative-02-panck-off.png",
      "panck-on": "395-narrative-03-panck-on.png",
    } as const;
    await runIssue395ToggleClipFlow(page, async (phase) => {
      const file = frames[phase];
      const path = join(narrativeDir, file);
      await page.locator(cubeViewSel).screenshot({ path });
    });
    const frameFiles = Object.values(frames);
    const listPath = join(outDir, "395-narrative-concat.txt");
    const last = frameFiles[frameFiles.length - 1]!;
    await writeFile(
      listPath,
      [
        ...frameFiles.map((f) => `file '${join(narrativeDir, f)}'\nduration 1`),
        `file '${join(narrativeDir, last)}'`,
      ].join("\n"),
    );
    const narrativeMp4 = join(outDir, "395-channel-toggle-narrative-1fps.mp4");
    execFileSync(
      "ffmpeg",
      [
        "-y",
        "-f",
        "concat",
        "-safe",
        "0",
        "-i",
        listPath,
        "-vf",
        "fps=1",
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        narrativeMp4,
      ],
      { stdio: "pipe" },
    );

    const toggleWebm = join(outDir, "395-channel-toggle-cube.webm");
    const video = page.video();
    await context.close();
    if (video) await video.saveAs(toggleWebm);
    const publish = "/opt/cursor/artifacts/issue395";
    await mkdir(publish, { recursive: true });
    for (const file of frameFiles) {
      await copyFile(join(narrativeDir, file), join(publish, file));
      await testInfo.attach(file, { path: join(narrativeDir, file), contentType: "image/png" });
    }
    await copyFile(toggleWebm, join(publish, "395-channel-toggle-cube.webm"));
    await copyFile(narrativeMp4, join(publish, "395-channel-toggle-narrative-1fps.mp4"));
    await testInfo.attach("395-channel-toggle-cube.webm", { path: toggleWebm, contentType: "video/webm" });
    await testInfo.attach("395-channel-toggle-narrative-1fps.mp4", {
      path: narrativeMp4,
      contentType: "video/mp4",
    });
  });
});
