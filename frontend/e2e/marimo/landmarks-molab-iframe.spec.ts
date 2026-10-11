import { expect, test } from "@playwright/test";

import {
  canvasBoxFrame,
  getModelFrame,
  gotoMolabIframeShell,
  marimoEmbedFrame,
  onCi,
  waitForLandmarksWidgetFrame,
} from "./helpers";

test.describe("marimo kernel — molab iframe shell (scale, zero-height grow)", () => {
  test("lasso, highlight, focus obs names, and centred inspect cube", async ({ page, baseURL }) => {
    test.slow(onCi(), "pyxa kernel boot + zarr read inside iframe");

    expect(baseURL).toBeTruthy();
    expect(baseURL).not.toMatch(/localhost|127\.0\.0\.1/);

    await gotoMolabIframeShell(page, baseURL!);
    const frame = await marimoEmbedFrame(page);
    await waitForLandmarksWidgetFrame(frame);

    await expect
      .poll(
        async () =>
          frame.evaluate(() => {
            const eng = (window as any).__landmarksEngine;
            return eng?.getPoints?.()?.length ?? 0;
          }),
        { timeout: onCi() ? 120_000 : 60_000 },
      )
      .toBeGreaterThan(4000);

    const box = await canvasBoxFrame(frame);
    await frame.getByRole("button", { name: /Lasso/i }).click();
    const cx = box.x + box.width * 0.5;
    const cy = box.y + box.height * 0.5;
    const r = Math.min(box.width, box.height) * 0.22;
    await page.mouse.move(cx + r, cy);
    await page.mouse.down();
    for (let i = 0; i <= 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      await page.mouse.move(cx + Math.cos(a) * r, cy + Math.sin(a) * r, { steps: 2 });
    }
    const mid = await frame.evaluate(() => (window as any).__landmarksEngine.getSelectionGesture());
    expect(mid.lassoPathLength).toBeGreaterThan(2);
    await page.mouse.up();

    await expect
      .poll(async () => ((await getModelFrame(frame, "selections")) as unknown[])?.length ?? 0, {
        timeout: onCi() ? 180_000 : 45_000,
      })
      .toBeGreaterThan(0);

    await expect
      .poll(async () => {
        const o = await frame.evaluate(() => (window as any).__landmarksEngine.getNeighborhoodOverlay());
        return o.seedRoleCount as number;
      })
      .toBeGreaterThan(0);

    await expect
      .poll(async () => {
        const text = await frame.locator('[data-testid="marimo-focus-count"]').innerText();
        return Number.parseInt(text, 10);
      }, { timeout: onCi() ? 180_000 : 60_000 })
      .toBeGreaterThan(0);

    await frame.getByRole("radio", { name: "Inspect", exact: true }).click();
    await frame.locator("canvas.landmarks__webgl, canvas").first().click({
      position: { x: Math.round(box.width * 0.5), y: Math.round(box.height * 0.5) },
    });
    const cube = frame.getByRole("dialog", { name: "Cube" });
    await expect(cube).toBeVisible({ timeout: onCi() ? 180_000 : 90_000 });
    const view = cube.locator(".volume-cube__view");
    await expect(view).toHaveAttribute("data-refining", "false", { timeout: 120_000 });
    await frame.getByTestId("context-inspect-toolbar").getByRole("radio", { name: "Top view" }).click();
    await expect.poll(async () => Number(await view.getAttribute("data-viewport-w"))).toBeGreaterThan(120);

    const signal = await frame.evaluate(() => {
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
  });
});
