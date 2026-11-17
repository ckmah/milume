import { expect, type Page } from "@playwright/test";

import { test } from "../fixtures";
import { bootLandmarksVolumeHarness, setModel } from "../helpers";

const volumeHarness = process.env.E2E_HARNESS === "landmarks-volume";

async function openImageChannels(page: Page) {
  const left = page.locator(".landmarks__chrome-dock--left");
  if ((await left.getAttribute("data-collapsed")) === "true") {
    await page.getByRole("button", { name: "Show left panel" }).click();
  }
  await page.getByTestId("panel-section-layers").click();
  const image = page.getByTestId("layers-image-row");
  if ((await image.getAttribute("aria-expanded")) !== "true") {
    await image.click();
  }
}

async function redness(page: Page) {
  return page.evaluate(() => {
    const canvas = document.querySelector("canvas.landmarks__webgl") as HTMLCanvasElement | null;
    const gl = canvas?.getContext("webgl2") ?? canvas?.getContext("webgl");
    if (!canvas || !gl) return 0;
    const { width, height } = canvas;
    const buf = new Uint8Array(width * height * 4);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    let red = 0;
    let blue = 0;
    let n = 0;
    for (let i = 0; i < buf.length; i += 16) {
      const r = buf[i] ?? 0;
      const g = buf[i + 1] ?? 0;
      const b = buf[i + 2] ?? 0;
      if (r + g + b < 24) continue;
      red += r;
      blue += b;
      n += 1;
    }
    return n ? (red - blue) / n : 0;
  });
}

test.describe("channel color picker (#396)", () => {
  test.skip(!volumeHarness, "requires the landmarks volume harness");

  test("a swatch recolors that channel on the dot and the map", async ({ page }) => {
    await bootLandmarksVolumeHarness(page);
    await setModel(page, {
      _image_visible: true,
      _image_channels: [
        { name: "Channel 0", visible: true, contrast_limits: [0, 48] },
        { name: "PanCK", visible: false, contrast_limits: [0, 48] },
      ],
    });
    await openImageChannels(page);
    const before = await redness(page);
    const dot = page.getByTestId("channel-color-Channel 0");
    await dot.click();
    const picker = page.getByTestId("channel-color-picker-Channel 0");
    await expect(picker).toBeVisible();
    await picker.getByRole("radio", { name: "Red" }).click();
    await expect(picker).toBeHidden();
    await expect(dot.locator(".landmarks-layer-swatch")).toHaveCSS("background-color", "rgb(255, 59, 59)");
    await expect
      .poll(async () =>
        page.evaluate(() => {
          const rows = (
            window as unknown as {
              __landmarksModel: { get: (key: string) => Array<{ name: string; color?: string; visible?: boolean }> };
            }
          ).__landmarksModel.get("_image_channels");
          return {
            chosen: rows.find((row) => row.name === "Channel 0")?.color ?? null,
            visible: rows.find((row) => row.name === "Channel 0")?.visible ?? null,
            other: rows.find((row) => row.name === "PanCK")?.color ?? null,
          };
        }),
      )
      .toEqual({ chosen: "#ff3b3b", visible: true, other: null });
    await expect.poll(async () => redness(page), { timeout: 20_000 }).toBeGreaterThan(before + 8);
  });

  test("escape closes the picker and returns focus to the dot", async ({ page }) => {
    await bootLandmarksVolumeHarness(page);
    await setModel(page, {
      _image_visible: true,
      _image_channels: [
        { name: "Channel 0", visible: true, contrast_limits: [0, 48] },
        { name: "PanCK", visible: false, contrast_limits: [0, 48] },
      ],
    });
    await openImageChannels(page);
    const dot = page.getByTestId("channel-color-Channel 0");
    await dot.click();
    await expect(page.getByTestId("channel-color-picker-Channel 0")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("channel-color-picker-Channel 0")).toBeHidden();
    await expect(dot).toBeFocused();
  });
});
