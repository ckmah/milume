import { expect, test } from "@playwright/test";

import { bytesFromCommBuffer } from "../../src/widgets/volume-cube/comm-buffer";

/**
 * Real marimo kernel (not the Vite harness): anywidget comm must deliver volume_get
 * binary payloads. Marimo maps buffers to DataView; `new Uint8Array(dataView)` is
 * empty in Chromium, which produced "Unexpected end of JSON input" on zarr metadata
 * (see comm-buffer.ts). This spec guards that path on demos/landmarks.py.
 */
test.describe("marimo kernel — landmarks Inspect volume comm", () => {
  test("marimo anywidget comm buffers are DataView-shaped", () => {
    const json = new TextEncoder().encode('{"zarr_format":2}');
    const dv = new DataView(json.buffer, json.byteOffset, json.byteLength);
    expect(new Uint8Array(dv).byteLength).toBe(0);
    expect(bytesFromCommBuffer(dv)?.byteLength).toBe(json.byteLength);
  });
  test("Inspect cube loads image on a non-localhost origin with no comm/console failures", async ({
    page,
    baseURL,
  }) => {
    test.slow(Boolean(process.env.CI), "HF demo fetch + scanpy on first kernel boot");

    expect(baseURL).toBeTruthy();
    expect(baseURL).not.toMatch(/localhost|127\.0\.0\.1/);

    const consoleErrors: string[] = [];
    const loopbackVolume: string[] = [];

    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    page.on("pageerror", (err) => consoleErrors.push(err.message));
    page.on("request", (req) => {
      const url = req.url();
      if (/127\.0\.0\.1:\d+\/(images|labels)\//.test(url) || /localhost:\d+\/(images|labels)\//.test(url)) {
        loopbackVolume.push(url);
      }
    });

    await page.goto("/", { waitUntil: "domcontentloaded", timeout: 120_000 });

    // landmarks.py: HF small download + leiden + zarr write can take several minutes on cold CI.
    const canvas = page.locator("canvas").first();
    await canvas.waitFor({ state: "visible", timeout: onCi() ? 720_000 : 420_000 });

    await page.getByRole("radio", { name: "Inspect", exact: true }).click();
    const box = await canvas.boundingBox();
    expect(box).toBeTruthy();
    await page.mouse.click(box!.x + box.width * 0.55, box!.y + box.height * 0.55);

    const cube = page.getByRole("dialog", { name: "Cube" });
    await expect(cube).toBeVisible({ timeout: 120_000 });
    const view = cube.locator(".volume-cube__view");
    await expect(view).toHaveAttribute("data-refining", "false", { timeout: 120_000 });
    await expect(view).toHaveAttribute("data-channels", /1|2/);

    const cubeText = await cube.innerText();
    expect(cubeText).not.toMatch(/Unexpected end of JSON input/i);

    const jsonErrors = consoleErrors.filter(
      (t) =>
        /Unexpected end of JSON input/i.test(t) ||
        /volume_get failed/i.test(t) ||
        /ERR_CONNECTION_REFUSED/i.test(t),
    );
    expect(jsonErrors, `console errors: ${jsonErrors.join("\n")}`).toEqual([]);
    expect(loopbackVolume).toEqual([]);

    // Sanity: image channel on (labels may be present on Pyxa small).
    await expect(view).toHaveAttribute("data-image", "on");
  });
});

function onCi(): boolean {
  return Boolean(process.env.CI);
}
