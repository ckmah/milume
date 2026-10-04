import { expect, test, type Locator, type Page } from "@playwright/test";

/** Linux CI + local Linux compare snapshots; Mac soft-skips unless forced. */
export function screenshotsEnabled(): boolean {
  if (process.env.E2E_SCREENSHOTS === "0") return false;
  if (process.env.E2E_SCREENSHOTS === "1") return true;
  if (process.env.CI) return true;
  return process.platform === "linux";
}

export async function waitForEngine(page: Page, settleMs = 400) {
  await page.locator(".landmarks").first().waitFor({ state: "visible" });
  await page.locator("canvas.landmarks__webgl").first().waitFor({ state: "visible" });
  await page.waitForFunction(() => {
    const eng = (window as any).__landmarksEngine;
    const vs = eng?.getViewState?.();
    return Boolean(vs && Number.isFinite(vs.zoom));
  });
  // Let deck.gl finish a couple frames after first paint.
  await page.waitForTimeout(settleMs);
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
  // Idempotent: a shared worker page can be reloaded between tests, which drops the style.
  await page.evaluate(() => {
    if (document.getElementById("e2e-stabilize-ui")) return;
    const style = document.createElement("style");
    style.id = "e2e-stabilize-ui";
    style.textContent = `
      *, *::before, *::after {
        animation: none !important;
        transition: none !important;
        caret-color: transparent !important;
      }
    `;
    document.head.appendChild(style);
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
  const isWarm = await page
    .evaluate(() => typeof (window as any).__harnessReset === "function")
    .catch(() => false);
  if (isWarm) {
    // Shared worker page: remount the widget on a fresh model, no page load.
    await page.evaluate(() => (window as any).__harnessReset());
    await waitForEngine(page, 150);
    await stabilizeUi(page);
    return;
  }
  await page.addInitScript(() => {
    window.localStorage.setItem("milume-harness-theme", "dark");
  });
  await page.goto("/", { waitUntil: "networkidle" });
  await waitForEngine(page);
  await stabilizeUi(page);
}

/** Landmarks over the toy SpatialData (`E2E_HARNESS=landmarks-volume`); the cube opens from Inspect. */
export async function bootLandmarksVolumeHarness(page: Page) {
  // Warm only on the plain harness URL: `?window=` / `?budgets=` are read once at load.
  const isWarm = await page
    .evaluate(() => location.search === "" && typeof (window as any).__harnessReset === "function")
    .catch(() => false);
  if (isWarm) {
    await page.evaluate(() => (window as any).__harnessReset());
    await waitForEngine(page, 150);
    await stabilizeUi(page);
    return;
  }
  await page.goto("/", { waitUntil: "networkidle" });
  await waitForEngine(page);
  await stabilizeUi(page);
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
