import { expect } from "@playwright/test";

import { test } from "../fixtures";
import {
  getModel,
  shot,
  stabilizeUi,
  waitForEngine,
} from "../helpers";

const volumeHarness = process.env.E2E_HARNESS === "landmarks-volume";
const issue395 = (process.env.E2E_VOLUME_PROFILE ?? "toy") === "issue395-3d";

async function openCubeAtCentre(page: import("@playwright/test").Page) {
  await page.getByRole("radio", { name: "Inspect", exact: true }).click();
  const plot = page.locator(".landmarks__plot");
  const box = await plot.boundingBox();
  expect(box).toBeTruthy();
  await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await expect(page.getByRole("dialog", { name: "Cube" })).toBeVisible({ timeout: 60_000 });
}

async function openLayersSection(page: import("@playwright/test").Page) {
  const left = page.locator(".landmarks__chrome-dock--left");
  if ((await left.getAttribute("data-collapsed")) === "true") {
    await page.getByRole("button", { name: "Show left panel" }).click();
  }
  await page.getByTestId("panel-section-layers").click();
}

async function openImagePanel(page: import("@playwright/test").Page) {
  await openLayersSection(page);
  const row = page.getByTestId("layers-image-row");
  const expanded = await row.getAttribute("aria-expanded");
  if (expanded !== "true") await row.click();
}

test.describe("multichannel 3D (#395) — landmarks-volume harness", () => {
  test.describe.configure({ mode: "serial" });
  test.skip(!volumeHarness || !issue395, "requires E2E_HARNESS=landmarks-volume and E2E_VOLUME_PROFILE=issue395-3d");

  test.beforeEach(async ({ page }) => {
    await page.goto("/", { waitUntil: "networkidle" });
    await waitForEngine(page);
    await stabilizeUi(page);
  });

  test("toggle channel off updates cube channel count", async ({ page }) => {
    await openImagePanel(page);
    await page.getByTestId("layer-channel-PanCK").click();
    await expect
      .poll(async () => {
        const rows = (await getModel(page, "_image_channels")) as Array<{ name: string; visible: boolean }>;
        return rows.find((c) => c.name === "PanCK")?.visible;
      })
      .toBe(false);
    await openCubeAtCentre(page);
    const cube = page.getByRole("dialog", { name: "Cube" });
    await expect(cube.locator(".volume-cube__view")).toHaveAttribute("data-channels", "1", { timeout: 30_000 });
    const channels = (await getModel(page, "_image_channels")) as Array<{ name: string; visible: boolean }>;
    expect(channels.find((c) => c.name === "PanCK")?.visible).toBe(false);
    await page.keyboard.press("Escape");
  });

  test("per-channel contrast drag in layers updates trait", async ({ page }) => {
    await openImagePanel(page);
    await page.getByTestId("layer-channel-row-DAPI").focus();
    const loBefore = await page.evaluate(() => {
      const rows = window.__landmarksModel.get("_image_channels") as Array<{
        name: string;
        contrast_limits: [number, number];
      }>;
      return rows.find((c) => c.name === "DAPI")?.contrast_limits?.[1] ?? 0;
    });
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
      .not.toBe(loBefore);
  });

  test("cube reports GPU bytes per visible channel", async ({ page }) => {
    await openCubeAtCentre(page);
    const cube = page.getByRole("dialog", { name: "Cube" });
    await expect(cube).toBeVisible();
    await expect(cube.locator(".volume-cube__view")).toHaveAttribute("data-channels", "2");
    await expect(cube.locator(".volume-cube__view")).toHaveAttribute("data-gpu-channel-bytes", /\d+,\d+/);
    const bytes = await cube.locator(".volume-cube__view").getAttribute("data-gpu-channel-bytes");
    const parts = (bytes ?? "").split(",").map(Number);
    expect(parts.length).toBe(2);
    expect(parts.every((n) => n > 0)).toBeTruthy();
    await page.keyboard.press("Escape");
    await expect(cube).toHaveCount(0, { timeout: 30_000 });
  });

  test("screenshot: cube two-channel blend", async ({ page }) => {
    await openCubeAtCentre(page);
    await stabilizeUi(page);
    const widget = page.locator(".milume-widget.landmarks");
    await shot(page, "395-cube-two-channel-blend", widget);
  });

  test("screenshot: map band two-channel blend", async ({ page }) => {
    await stabilizeUi(page);
    const widget = page.locator(".milume-widget.landmarks");
    await shot(page, "395-map-band-two-channel-blend", widget);
  });
});
