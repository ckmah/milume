import { expect, test, type Locator, type Page } from "@playwright/test";

/** Linux CI + local Linux compare snapshots; Mac soft-skips unless forced. */
export function screenshotsEnabled(): boolean {
  if (process.env.E2E_SCREENSHOTS === "0") return false;
  if (process.env.E2E_SCREENSHOTS === "1") return true;
  if (process.env.CI) return true;
  return process.platform === "linux";
}

export async function waitForEngine(page: Page) {
  await page.locator(".landmarks").first().waitFor({ state: "visible" });
  await page.locator("canvas.landmarks__webgl").first().waitFor({ state: "visible" });
  await page.waitForFunction(() => {
    const eng = (window as any).__landmarksEngine;
    const vs = eng?.getViewState?.();
    return Boolean(vs && Number.isFinite(vs.zoom));
  });
  // Let deck.gl finish a couple frames after first paint.
  await page.waitForTimeout(400);
}

export async function getZoom(page: Page) {
  return page.evaluate(
    () => (window as any).__landmarksEngine.getViewState().zoom as number,
  );
}

/** Landmark tool (Point/Line/Spline/Shape) lives behind a dropdown; open it and pick `name`. */
export async function clickLandmarkTool(page: Page, name: string) {
  const trigger = page.getByRole("button", {
    name: /Right-click for landmark menu/,
  });
  await trigger.click({ button: "right" });
  // Accessible name also carries the shortcut glyph (e.g. "Point 1"), so anchor
  // only the start rather than requiring an exact match.
  await page.getByRole("menuitem", { name: new RegExp(`^${name}\\b`) }).click();
}

export async function getModel(page: Page, key: string) {
  return page.evaluate((k) => (window as any).__landmarksModel.get(k), key);
}

export async function setModel(page: Page, patch: Record<string, unknown>) {
  await page.evaluate((p) => {
    const model = (window as any).__landmarksModel;
    for (const [k, v] of Object.entries(p)) model.set(k, v);
    model.save_changes();
  }, patch);
}

export async function stabilizeUi(page: Page) {
  await page.addStyleTag({
    content: `
      *, *::before, *::after {
        animation: none !important;
        transition: none !important;
        caret-color: transparent !important;
      }
    `,
  });
}

/** Visual assert — keep call sites to 2–3 biggest state changes per widget. */
export async function shot(page: Page, name: string, target?: Locator) {
  if (!screenshotsEnabled()) {
    test.info().annotations.push({
      type: "note",
      description: `Skipped screenshot "${name}" (set E2E_SCREENSHOTS=1 or run on Linux/CI)`,
    });
    return;
  }
  const locator = target ?? page.locator(".landmarks").first();
  await expect(locator).toHaveScreenshot(`${name}.png`, {
    animations: "disabled",
  });
}

export async function canvasBox(page: Page) {
  const canvas = page.locator("canvas.landmarks__webgl").first();
  const box = await canvas.boundingBox();
  expect(box).toBeTruthy();
  return box!;
}

export async function bootLandmarksHarness(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem("spatial-rx-harness-theme", "dark");
  });
  await page.goto("/", { waitUntil: "networkidle" });
  await waitForEngine(page);
  await stabilizeUi(page);
}

export async function waitForVolumeCube(page: Page) {
  const widget = page.locator(".volume-cube").first();
  await widget.waitFor({ state: "visible" });
  await widget.getByRole("button", { name: "Reset", exact: true }).waitFor({ state: "visible" });
  await expect(widget.getByText("Loading volume…")).toHaveCount(0);
  await page.waitForFunction(() => {
    const model = (window as any).__volumeCubeModel;
    return Boolean(model?.get("image_url"));
  });
  // Let Viv/deck.gl finish first paint after OME-Zarr load.
  await page.waitForTimeout(800);
}

export async function getVolumeModel(page: Page, key: string) {
  return page.evaluate((k) => (window as any).__volumeCubeModel.get(k), key);
}

export async function setVolumeModel(page: Page, patch: Record<string, unknown>) {
  await page.evaluate((p) => {
    const model = (window as any).__volumeCubeModel;
    for (const [k, v] of Object.entries(p)) model.set(k, v);
    model.save_changes();
  }, patch);
}

export async function bootVolumeCubeHarness(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem("spatial-rx-harness-theme", "dark");
  });
  await page.goto("/", { waitUntil: "networkidle" });
  await waitForVolumeCube(page);
  await stabilizeUi(page);
}

/** Landmarks over the toy SpatialData (`E2E_HARNESS=landmarks-volume`); the cube opens from Inspect. */
export async function bootLandmarksVolumeHarness(page: Page) {
  await page.goto("/", { waitUntil: "networkidle" });
  await waitForEngine(page);
  await stabilizeUi(page);
}

export function volumeCubeWidget(page: Page) {
  return page.locator(".volume-cube").first();
}

export async function toyInspectBox(page: Page) {
  const panel = page
    .locator("p")
    .filter({ hasText: "Toy inspect. Drag the 100 µm square." })
    .locator("..")
    .locator(".cursor-crosshair")
    .first();
  const box = await panel.boundingBox();
  expect(box).toBeTruthy();
  return { panel, box: box! };
}
