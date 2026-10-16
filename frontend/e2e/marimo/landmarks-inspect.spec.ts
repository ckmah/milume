import { expect, test } from "@playwright/test";

import { bytesFromCommBuffer } from "../../src/widgets/volume-cube/comm-buffer";
import { getModel, waitForLandmarksWidget } from "./helpers";

/**
 * Real marimo kernel (not the Vite harness), Python/kernel side only, no UI gestures:
 * demos/landmarks.py loads on a non-localhost origin with no comm/console errors and
 * attaches a comm-served image store. Marimo maps comm buffers to DataView
 * (`new Uint8Array(dataView)` is empty in Chromium); the decode is checked below and
 * in tests/test_marimo_comm_buffers.py.
 */
test.describe("marimo kernel — landmarks Inspect volume comm", () => {
  test("marimo anywidget comm buffers are DataView-shaped", () => {
    const json = new TextEncoder().encode('{"zarr_format":2}');
    const dv = new DataView(json.buffer, json.byteOffset, json.byteLength);
    expect(new Uint8Array(dv).byteLength).toBe(0);
    expect(bytesFromCommBuffer(dv)?.byteLength).toBe(json.byteLength);
  });
  test("kernel loads and attaches a comm image store on a non-localhost origin with no comm/console failures", async ({
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
    await waitForLandmarksWidget(page);

    // No UI gestures. The cube's volume_get round-trip needs the cube opened by a canvas click
    // (or a raw-model test probe the widget does not expose), so this checks the kernel side only:
    // the widget loads on a real kernel and Python attached a comm-served image store.
    const volume = (await getModel(page, "volume")) as { image_url?: string };
    expect(volume?.image_url, "widget should expose a comm image store").toMatch(/^images\//);

    const jsonErrors = consoleErrors.filter(
      (t) =>
        /Unexpected end of JSON input/i.test(t) ||
        /volume_get failed/i.test(t) ||
        /ERR_CONNECTION_REFUSED/i.test(t),
    );
    expect(jsonErrors, `console errors: ${jsonErrors.join("\n")}`).toEqual([]);
    expect(loopbackVolume).toEqual([]);
  });
});

function onCi(): boolean {
  return Boolean(process.env.CI);
}
