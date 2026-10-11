import { expect, type Page } from "@playwright/test";

import { growLandmarksFromZeroHeight } from "../helpers";

import {
  applyMolabEmbedStress,
  canvasBox,
  evalInIframe,
  getModel,
  getModelInIframe,
  marimoIframeWidget,
  onCi,
} from "./helpers";

export async function assertMolabPyxaAfterSelection(
  page: Page,
  box: { width: number; height: number },
) {
  await expect
    .poll(async () => ((await getModel(page, "selections")) as unknown[])?.length ?? 0, {
      timeout: onCi() ? 720_000 : 45_000,
    })
    .toBeGreaterThan(0);

  await expect
    .poll(async () => {
      const o = await page.evaluate(() => (window as any).__landmarksEngine.getNeighborhoodOverlay());
      return o.seedRoleCount as number;
    }, { timeout: onCi() ? 120_000 : 30_000 })
    .toBeGreaterThan(0);

  await expect
    .poll(async () => {
      const text = await page.locator('[data-testid="marimo-focus-count"]').innerText();
      return Number.parseInt(text, 10);
    }, { timeout: onCi() ? 720_000 : 60_000 })
    .toBeGreaterThan(0);

  await page.getByRole("radio", { name: "Inspect", exact: true }).click();
  await page.locator("canvas.landmarks__webgl, canvas").first().click({
    position: { x: Math.round(box.width * 0.5), y: Math.round(box.height * 0.5) },
  });
  const cube = page.getByRole("dialog", { name: "Cube" });
  await expect(cube).toBeVisible({ timeout: onCi() ? 180_000 : 90_000 });
  const view = cube.locator(".volume-cube__view");
  await expect(view).toHaveAttribute("data-refining", "false", { timeout: 120_000 });
  await page.getByTestId("context-inspect-toolbar").getByRole("radio", { name: "Top view" }).click();
  await expect.poll(async () => Number(await view.getAttribute("data-viewport-w"))).toBeGreaterThan(120);

  const signal = await page.evaluate(() => {
    const root = document.querySelector('[role="dialog"][aria-label="Cube"] .volume-cube__view');
    const canvas = root?.querySelector("canvas") as HTMLCanvasElement | null;
    const gl = canvas?.getContext("webgl2") ?? canvas?.getContext("webgl");
    if (!gl || !canvas) return { ok: false as const, centerLum: 0, edgeLum: 0 };
    const w = canvas.width;
    const h = canvas.height;
    const center = new Uint8Array(4);
    gl.readPixels(Math.floor(w / 2), Math.floor(h / 2), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, center);
    const edge = new Uint8Array(4);
    gl.readPixels(4, 4, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, edge);
    const lum = (px: Uint8Array) => 0.299 * px[0]! + 0.587 * px[1]! + 0.114 * px[2]!;
    return { ok: true as const, centerLum: lum(center), edgeLum: lum(edge) };
  });
  expect(signal.ok).toBe(true);
  expect(signal.centerLum).toBeGreaterThan(12);
  expect(signal.centerLum).toBeGreaterThan(signal.edgeLum * 0.35);
}

/** Lasso stroke (path length) then post-selection assertions on the top-level marimo page. */
export async function assertMolabPyxaSelectionAndInspect(page: Page, box: { x: number; y: number; width: number; height: number }) {
  const cx = box.x + box.width * 0.5;
  const cy = box.y + box.height * 0.5;
  const r = Math.min(box.width, box.height) * 0.22;
  await page.mouse.move(cx + r, cy);
  await page.mouse.down();
  for (let i = 0; i <= 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    await page.mouse.move(cx + Math.cos(a) * r, cy + Math.sin(a) * r, { steps: 2 });
  }
  const mid = await page.evaluate(() => (window as any).__landmarksEngine.getSelectionGesture());
  expect(mid.lassoPathLength).toBeGreaterThan(2);
  await page.mouse.up();
  await assertMolabPyxaAfterSelection(page, box);
}

export async function assertMolabPyxaSelectionAndInspectInIframe(
  page: Page,
  box: { x: number; y: number; width: number; height: number },
) {
  const widget = marimoIframeWidget(page);
  const cx = box.x + box.width * 0.5;
  const cy = box.y + box.height * 0.5;
  const r = Math.min(box.width, box.height) * 0.22;
  await page.mouse.move(cx + r, cy);
  await page.mouse.down();
  for (let i = 0; i <= 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    await page.mouse.move(cx + Math.cos(a) * r, cy + Math.sin(a) * r, { steps: 2 });
  }
  const mid = await evalInIframe<{ lassoPathLength: number }>(
    page,
    `(win) => win.__landmarksEngine.getSelectionGesture()`,
  );
  expect(mid.lassoPathLength).toBeGreaterThan(2);
  await page.mouse.up();

  await expect
    .poll(async () => ((await getModelInIframe(page, "selections")) as unknown[])?.length ?? 0, {
      timeout: onCi() ? 180_000 : 45_000,
    })
    .toBeGreaterThan(0);

  await expect
    .poll(async () => {
      const o = await evalInIframe<{ seedRoleCount: number }>(
        page,
        `(win) => win.__landmarksEngine.getNeighborhoodOverlay()`,
      );
      return o.seedRoleCount;
    })
    .toBeGreaterThan(0);

  await expect
    .poll(async () => {
      const text = await widget.locator('[data-testid="marimo-focus-count"]').innerText();
      return Number.parseInt(text, 10);
    }, { timeout: onCi() ? 180_000 : 60_000 })
    .toBeGreaterThan(0);

  await widget.getByRole("radio", { name: "Inspect", exact: true }).click();
  await widget.locator("canvas.landmarks__webgl, canvas").first().click({
    position: { x: Math.round(box.width * 0.5), y: Math.round(box.height * 0.5) },
  });
  const cube = widget.getByRole("dialog", { name: "Cube" });
  await expect(cube).toBeVisible({ timeout: onCi() ? 180_000 : 90_000 });
  const view = cube.locator(".volume-cube__view");
  await expect(view).toHaveAttribute("data-refining", "false", { timeout: 120_000 });
  await widget.getByTestId("context-inspect-toolbar").getByRole("radio", { name: "Top view" }).click();
  await expect.poll(async () => Number(await view.getAttribute("data-viewport-w"))).toBeGreaterThan(120);

  const signal = await evalInIframe<{ ok: boolean; centerLum: number; edgeLum: number }>(
    page,
    `(win) => {
      const root = win.document.querySelector('[role="dialog"][aria-label="Cube"] .volume-cube__view');
      const canvas = root?.querySelector("canvas");
      const gl = canvas?.getContext("webgl2") ?? canvas?.getContext("webgl");
      if (!gl || !canvas) return { ok: false, centerLum: 0, edgeLum: 0 };
      const w = canvas.width;
      const h = canvas.height;
      const center = new Uint8Array(4);
      gl.readPixels(Math.floor(w / 2), Math.floor(h / 2), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, center);
      const edge = new Uint8Array(4);
      gl.readPixels(4, 4, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, edge);
      const lum = (px) => 0.299 * px[0] + 0.587 * px[1] + 0.114 * px[2];
      return { ok: true, centerLum: lum(center), edgeLum: lum(edge) };
    }`,
  );
  expect(signal.ok).toBe(true);
  expect(signal.centerLum).toBeGreaterThan(12);
  expect(signal.centerLum).toBeGreaterThan(signal.edgeLum * 0.35);
}

export async function prepMolabPyxaPage(page: Page) {
  await growLandmarksFromZeroHeight(page, 560);
  await applyMolabEmbedStress(page);
  await page.waitForFunction(
    () => {
      const s = (window as any).__landmarksEngine?.getPlotSurfaceSize?.();
      return Boolean(s && s.plotW > 200 && s.plotH > 200);
    },
    undefined,
    { timeout: onCi() ? 120_000 : 30_000 },
  );
}
