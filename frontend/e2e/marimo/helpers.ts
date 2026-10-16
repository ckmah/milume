import { type Page } from "@playwright/test";

/** marimo e2e covers the Python API and kernel comm only; UI gestures live in the Vite harness specs. */
export function onCi(): boolean {
  return Boolean(process.env.CI);
}

export async function waitForLandmarksWidget(page: Page) {
  const canvas = page.locator("canvas.landmarks__webgl, canvas").first();
  await canvas.waitFor({ state: "visible", timeout: onCi() ? 720_000 : 420_000 });
  await page.waitForFunction(
    () => ((window as any).__landmarksEngine?.getPoints?.()?.length ?? 0) > 0,
    undefined,
    { timeout: onCi() ? 720_000 : 180_000 },
  );
  return canvas;
}

export async function getModel(page: Page, key: string) {
  return page.evaluate((k) => (window as any).__landmarksModel?.get(k), key);
}

/** Write a synced trait from the browser side (what a gesture would do), without driving UI. */
export async function setModelFromBrowser(page: Page, values: Record<string, unknown>) {
  await page.evaluate((v) => {
    const m = (window as any).__landmarksModel;
    for (const [k, val] of Object.entries(v)) m.set(k, val);
    m.save_changes();
  }, values);
}
