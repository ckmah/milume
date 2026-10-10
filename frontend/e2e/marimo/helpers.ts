import { expect, type Page } from "@playwright/test";

export function onCi(): boolean {
  return Boolean(process.env.CI);
}

export async function waitForLandmarksWidget(page: Page) {
  const canvas = page.locator("canvas.landmarks__webgl, canvas").first();
  await canvas.waitFor({ state: "visible", timeout: onCi() ? 720_000 : 420_000 });
  await page.waitForFunction(() => {
    const eng = (window as any).__landmarksEngine;
    const vs = eng?.getViewState?.();
    return Boolean(vs && Number.isFinite(vs.zoom));
  });
  await page.waitForFunction(
    () => {
      const eng = (window as any).__landmarksEngine;
      const n = eng?.getPoints?.()?.length ?? 0;
      return n > 20;
    },
    undefined,
    { timeout: onCi() ? 720_000 : 180_000 },
  );
  await page.waitForTimeout(400);
  return canvas;
}

export async function getModel(page: Page, key: string) {
  return page.evaluate((k) => (window as any).__landmarksModel?.get(k), key);
}

export async function canvasBox(page: Page) {
  const canvas = page.locator("canvas.landmarks__webgl, canvas").first();
  const box = await canvas.boundingBox();
  expect(box).toBeTruthy();
  return box!;
}

/** Closed lasso stroke on the map (page.mouse, molab-style). */
export async function drawLasso(page: Page, box: { x: number; y: number; width: number; height: number }) {
  const canvas = page.locator("canvas.landmarks__webgl, canvas").first();
  await page.getByRole("button", { name: "Reset view" }).click({ timeout: 15_000 }).catch(() => undefined);
  await canvas.click({ position: { x: Math.round(box.width * 0.5), y: Math.round(box.height * 0.5) } });
  await page.keyboard.press("l");
  await expect.poll(() => getModel(page, "mode"), { timeout: onCi() ? 60_000 : 15_000 }).toBe("lasso");

  const inset = 0.12;
  const left = box.x + box.width * inset;
  const right = box.x + box.width * (1 - inset);
  const top = box.y + box.height * inset;
  const bottom = box.y + box.height * (1 - inset);
  const cx = (left + right) / 2;
  const cy = (top + bottom) / 2;
  const rx = (right - left) / 2;
  const ry = (bottom - top) / 2;

  await page.mouse.move(cx + rx, cy);
  await page.mouse.down();
  const steps = 14;
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    await page.mouse.move(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry, { steps: 3 });
  }
  await page.mouse.up();
}

/** Click-select an existing landmark (deck onClick in Select mode). */
export async function clickSelectLandmark(page: Page, box: { x: number; y: number; width: number; height: number }) {
  await page.getByRole("radio", { name: "Select", exact: true }).click();
  await expect.poll(() => getModel(page, "mode")).toBe("select");
  const before = ((await getModel(page, "landmarks")) as unknown[])?.length ?? 0;
  if (before === 0) {
    await page.getByRole("button", { name: /Point\. Right-click for landmark menu/ }).click({ button: "right" });
    await page.getByRole("menuitem", { name: /^Point\b/ }).click();
    await expect.poll(() => getModel(page, "mode")).toBe("point");
    await page.mouse.click(box.x + box.width * 0.42, box.y + box.height * 0.38);
    await expect.poll(async () => ((await getModel(page, "landmarks")) as unknown[]).length).toBe(1);
    await page.getByRole("radio", { name: "Select", exact: true }).click();
  }
  await page.mouse.click(box.x + box.width * 0.42, box.y + box.height * 0.38);
  await expect.poll(async () => {
    const kind = await getModel(page, "selected_kind");
    const index = await getModel(page, "selected_index");
    return kind === "landmark" && Number(index) >= 0;
  }).toBe(true);
}
