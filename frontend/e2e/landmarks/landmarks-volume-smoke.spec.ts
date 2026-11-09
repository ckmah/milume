import { expect, type Page } from "@playwright/test";

import { test } from "../fixtures";

import {
  bootLandmarksVolumeHarness,
  canvasBox,
  getModel,
  setModel,
  waitForEngine,
} from "../helpers";

const cubeWindow = (page: Page) => page.getByRole("dialog", { name: "Cube" });
const cutOf = async (page: Page) => (await getModel(page, "volume_cut")) as number[];
const layerToggle = (page: Page, layer: "image" | "labels") => page.getByTestId(`layer-toggle-${layer}`);

async function openCubeAtCentre(page: Page) {
  await page.getByRole("radio", { name: "Inspect", exact: true }).click();
  const box = await canvasBox(page);
  await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.5);
  await expect(cubeWindow(page)).toBeVisible();
  return box;
}

test.describe("Landmarks volume smoke", () => {
  test.beforeEach(async ({ page }) => bootLandmarksVolumeHarness(page));

  test("mount: harness and engine ready", async ({ page }) => {
    await waitForEngine(page, 150);
    await expect(page.locator(".landmarks").first()).toBeVisible();
    await expect(page.locator("canvas.landmarks__webgl").first()).toBeVisible();
  });

  test("image and labels load in the cube", async ({ page }) => {
    await openCubeAtCentre(page);
    const view = cubeWindow(page).locator(".volume-cube__view");
    await expect(view).toHaveAttribute("data-refining", "false");
    await expect(view).toHaveAttribute("data-labels", "on");
    await expect(layerToggle(page, "image")).toHaveAttribute("aria-pressed", "true");
    await expect(layerToggle(page, "labels")).toHaveAttribute("aria-pressed", "true");
  });

  test("widget comm serves volume bytes", async ({ page }) => {
    const loopbackVolume: string[] = [];
    page.on("request", (req) => {
      const url = req.url();
      if (/127\.0\.0\.1:\d+\/(images|labels)\//.test(url)) loopbackVolume.push(url);
    });
    await openCubeAtCentre(page);
    const view = cubeWindow(page).locator(".volume-cube__view");
    await expect(view).toHaveAttribute("data-refining", "false");
    await expect(view).toHaveAttribute("data-labels", "on");
    const reads = await page.evaluate(
      () => (window as { __volumeCommReads?: () => number }).__volumeCommReads?.() ?? 0,
    );
    expect(reads).toBeGreaterThan(5);
    expect(loopbackVolume).toEqual([]);
  });

  test("top and oblique presets", async ({ page }) => {
    await openCubeAtCentre(page);
    const bar = page.getByTestId("context-inspect-toolbar");
    const view = cubeWindow(page).locator(".volume-cube__view");
    await bar.getByRole("radio", { name: "Top view" }).click();
    await expect(bar.getByRole("radio", { name: "Top view" })).toHaveAttribute("aria-checked", "true");
    await expect(view).toHaveAttribute("data-refining", "false");
    await expect(view).toHaveAttribute("data-pitch", "90");
    await bar.getByRole("radio", { name: "Oblique view" }).click();
    await expect(bar.getByRole("radio", { name: "Oblique view" })).toHaveAttribute("aria-checked", "true");
  });

  test("one Z high cut commits", async ({ page }) => {
    test.slow(Boolean(process.env.CI), "SwiftShader cut drag on CI");
    test.setTimeout(process.env.CI ? 180_000 : 120_000);
    await openCubeAtCentre(page);
    const bar = page.getByTestId("context-inspect-toolbar");
    const view = cubeWindow(page).locator(".volume-cube__view");
    await expect(view).toHaveAttribute("data-refining", "false");
    await bar.getByRole("radio", { name: "Side view" }).click();
    await expect(view).toHaveAttribute("data-pitch", "0");
    const point = (attr: string | null, key: string) => {
      const hit = attr?.match(new RegExp(`${key}:(-?\\d+\\.?\\d*),(-?\\d+\\.?\\d*)`));
      expect(hit, attr ?? "").toBeTruthy();
      return { x: Number(hit![1]), y: Number(hit![2]) };
    };
    const host = await view.boundingBox();
    expect(host).toBeTruthy();
    const at = (p: { x: number; y: number }) => ({ x: host!.x + p.x, y: host!.y + p.y });
    const anchorsBefore = await view.getAttribute("data-cut-anchors");
    const near = at(point(await view.getAttribute("data-cut-near-anchors"), "z1"));
    const rim = at(point(anchorsBefore, "z1"));
    const center = at(point(await view.getAttribute("data-cut-centers"), "z1"));
    await page.mouse.move(near.x, near.y);
    await expect(view).toHaveAttribute("data-cut-near", "z1");
    await page.mouse.move(rim.x, rim.y);
    await expect(view).toHaveAttribute("data-cut-face", "z1");
    const before = (await cutOf(page))[5];
    await page.mouse.move(center.x, center.y);
    await page.mouse.down();
    await expect(view).toHaveAttribute("data-cut-dragging", "true");
    await page.mouse.move(center.x, center.y + 48, { steps: 8 });
    await page.mouse.up();
    await expect(view).toHaveAttribute("data-cut-dragging", "false");
    await expect
      .poll(async () => (await cutOf(page))[5] ?? before, { timeout: 60_000 })
      .toBeLessThan(before - 1);
  });

  test("loading chip settles to ready", async ({ page }) => {
    await bootLandmarksVolumeHarness(page, "budgets=2000,20000");
    await openCubeAtCentre(page);
    const chip = page.getByTestId("inspect-status");
    await expect(chip).toHaveAttribute("data-state", /refining|ready/);
    await expect(chip).toHaveAttribute("data-state", "ready");
  });

  test("outside volume shows error state", async ({ page }) => {
    await openCubeAtCentre(page);
    const chip = page.getByTestId("inspect-status");
    await expect(chip).toHaveAttribute("data-state", "ready");
    await setModel(page, { inspect_cx: 10000, inspect_cy: 10000 });
    await expect(cubeWindow(page).getByText("Inspect window is outside the volume")).toBeVisible();
    await expect(chip).toHaveAttribute("data-state", "error");
  });

  test("inspect toolbar visible before cube", async ({ page }) => {
    await page.getByRole("radio", { name: "Inspect", exact: true }).click();
    await expect(page.getByTestId("context-inspect-toolbar")).toBeVisible();
    await expect(layerToggle(page, "image")).toBeVisible();
  });

  test("one esc closes the cube and leaves Inspect", async ({ page }) => {
    await openCubeAtCentre(page);
    await page.keyboard.press("Escape");
    await expect(cubeWindow(page)).toHaveCount(0);
    await expect(page.getByTestId("inspect-pill")).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => (window as any).__landmarksModel.get("inspect_open"))).toBe(false);
  });

  test("cube opens on inspect click", async ({ page }) => {
    await openCubeAtCentre(page);
    await expect(cubeWindow(page).locator(".volume-cube__view")).toBeVisible();
  });
});
