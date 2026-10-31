import { expect } from "@playwright/test";

import { test } from "../fixtures";
import {
  bootLandmarksVolumeHarness,
  setModel,
  waitForEngine,
} from "../helpers";

const volumeHarness = process.env.E2E_HARNESS === "landmarks-volume";
const issue122d = (process.env.E2E_VOLUME_PROFILE ?? "toy") === "issue122-2d";
const colonProfile = (process.env.E2E_VOLUME_PROFILE ?? "toy") === "colon";

async function openLayersSection(page: import("@playwright/test").Page) {
  const left = page.locator(".landmarks__chrome-dock--left");
  if ((await left.getAttribute("data-collapsed")) === "true") {
    await page.getByRole("button", { name: "Show left panel" }).click();
  }
  await page.getByTestId("panel-section-layers").click();
}

async function openImagePanel(page: import("@playwright/test").Page) {
  await openLayersSection(page);
  await page.getByTestId("layers-image-row").click();
}

function makeManyChannels(n: number) {
  const base = ["DAPI", "PanCK", "CD45", "Ki67"];
  const names = [...base];
  for (let i = names.length; i < n; i++) {
    names.push(i < 10 ? `CH${i - 3}` : `Pan-cytokeratin_AE1AE3_long_name_${i}`);
  }
  return names.map((name, i) => ({
    name,
    visible: i === 0,
    contrast_limits: [0, 255] as [number, number],
    constant_zero: false,
    color: i === 1 ? "#ff8844" : undefined,
  }));
}

test.describe("image panel polish (#399) — issue122-2d", () => {
  test.skip(!volumeHarness || !issue122d, "requires landmarks-volume issue122-2d profile");

  test.beforeEach(async ({ page }) => {
    await bootLandmarksVolumeHarness(page);
  });

  test("plot background is black with image visible and grey when hidden", async ({ page }) => {
    const root = page.locator(".milume-widget.landmarks");
    await expect(root).toHaveClass(/landmarks--image/);
    const plot = page.locator(".landmarks__plot").first();
    await expect.poll(async () =>
      plot.evaluate((el) => getComputedStyle(el).backgroundColor),
    ).toBe("rgb(0, 0, 0)");

    await openLayersSection(page);
    await page.getByTestId("layer-toggle-image").click();
    await expect(page.locator(".milume-widget.landmarks")).not.toHaveClass(/landmarks--image/);
    await expect.poll(async () =>
      plot.evaluate((el) => getComputedStyle(el).backgroundColor),
    ).toBe("rgb(20, 20, 20)");
  });

  test("multi-channel header, contrast caption, typography, sliders, labels", async ({
    page,
  }) => {
    await setModel(page, {
      _image_channels: [
        { name: "DAPI", visible: true, contrast_limits: [0, 255], color: "#9a9a9a" },
        { name: "PanCK", visible: true, contrast_limits: [0, 255], color: "#ff8844" },
        { name: "CD45", visible: false, contrast_limits: [0, 165] },
        { name: "Ki67", visible: false, contrast_limits: [0, 152] },
      ],
    });
    await openImagePanel(page);

    await expect(page.getByTestId("layers-image-header")).toContainText("Image · DAPI + PanCK");

    await expect(page.locator(".landmarks-slider-caption").filter({ hasText: "DAPI contrast" })).toBeVisible();

    const dapiRow = page.getByTestId("layer-channel-row-DAPI");
    const typeStyle = await dapiRow.evaluate((el) => {
      const name = el.querySelector(".landmarks-image-channel-row__name") as HTMLElement | null;
      const target = name ?? el;
      const s = getComputedStyle(target);
      return { fontSize: s.fontSize, lineHeight: s.lineHeight };
    });
    expect(typeStyle.fontSize).toBe("12px");
    expect(typeStyle.lineHeight).toBe("16px");

    const cellsLabel = page.getByTestId("layers-cells-row").locator(".landmarks-layer-label");
    const imageLabel = page.getByTestId("layers-image-header").locator(".landmarks-layer-label");
    const [cellsLeft, imageLeft] = await page.evaluate(
      ([a, b]) => [a.getBoundingClientRect().left, b.getBoundingClientRect().left],
      [await cellsLabel.elementHandle(), await imageLabel.elementHandle()],
    );
    expect(Math.abs(cellsLeft - imageLeft)).toBeLessThan(0.5);

    const tracks = page.locator(".landmarks-image-controls .landmarks-slider-control");
    await expect(tracks).toHaveCount(2);
    const [a, b] = await tracks.evaluateAll((els) =>
      els.map((el) => {
        const r = el.getBoundingClientRect();
        return { x: r.x, width: r.width };
      }),
    );
    expect(Math.abs(a!.x - b!.x)).toBeLessThan(0.5);
    expect(Math.abs(a!.width - b!.width)).toBeLessThan(0.5);

    await page.getByTestId("layer-channel-row-CD45").click();
    await expect(page.locator(".landmarks-slider-caption").filter({ hasText: "CD45 contrast" })).toBeVisible();

    const panckCaption = page.locator(".landmarks-slider-caption").filter({ hasText: "PanCK contrast" });
    await page.getByTestId("layer-channel-row-PanCK").focus();
    await expect(panckCaption).toBeVisible();
    const notTruncated = await panckCaption.evaluate((el) => el.scrollWidth <= el.clientWidth + 0.5);
    expect(notTruncated).toBe(true);
  });

  test("whole-row click toggles channel visibility", async ({ page }) => {
    await setModel(page, {
      _image_channels: [
        { name: "DAPI", visible: true, contrast_limits: [0, 255] },
        { name: "PanCK", visible: false, contrast_limits: [0, 255] },
      ],
    });
    await openImagePanel(page);
    const row = page.getByTestId("layer-channel-row-PanCK");
    const sw = page.getByTestId("layer-channel-PanCK");
    await expect(sw).toHaveAttribute("aria-checked", "false");
    await row.click({ position: { x: 8, y: 12 } });
    await expect(sw).toHaveAttribute("aria-checked", "true");
  });

  test("channel list caps at eight rows with internal scroll", async ({ page }) => {
    await setModel(page, { _image_channels: makeManyChannels(18) });
    await openImagePanel(page);
    const list = page.getByTestId("layer-channel-list");
    await expect(list).toHaveCSS("max-height", "192px");
    await expect(list).toHaveCSS("overscroll-behavior", "contain");

    const dock = page.locator(".landmarks__chrome-dock--left");
    const dockBox = await dock.boundingBox();
    expect(dockBox).toBeTruthy();
    expect(dockBox!.y + dockBox!.height).toBeLessThanOrEqual(800.5);

    await list.evaluate((el) => {
      el.scrollTop = 80;
    });
    await expect.poll(async () => list.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  });

  test("channel row shows keyboard focus ring", async ({ page }) => {
    await setModel(page, {
      _image_channels: [
        { name: "DAPI", visible: true, contrast_limits: [0, 255] },
        { name: "PanCK", visible: false, contrast_limits: [0, 255] },
        { name: "CD45", visible: false, contrast_limits: [0, 165] },
      ],
    });
    await openImagePanel(page);
    const row = page.getByTestId("layer-channel-row-CD45");
    await row.focus();
    await expect(row).toBeFocused();
    const ring = await row.evaluate((el) => {
      const s = getComputedStyle(el);
      return {
        boxShadow: s.boxShadow,
        outline: s.outlineWidth,
      };
    });
    expect(ring.boxShadow).not.toBe("none");
    expect(ring.boxShadow).toMatch(/3px/);
  });

  test("contrast follows first visible channel when focus is on a hidden row", async ({ page }) => {
    await setModel(page, { _image_channels: makeManyChannels(18) });
    await openImagePanel(page);
    await page.getByTestId("layer-channel-row-CD45").focus();
    await expect(page.locator(".landmarks-slider-caption").filter({ hasText: "DAPI contrast" })).toBeVisible();
  });

  test("visual acceptance captures", async ({ page }) => {
    test.skip(!process.env.CAPTURE_VISUAL, "set CAPTURE_VISUAL=1 to write PR stills");
    const out = process.env.CAPTURE_OUT ?? "/opt/cursor/artifacts/panel-polish-399";
    await page.addStyleTag({
      content: `[data-testid="harness-banner"], .harness-banner { display: none !important; }`,
    });
    await setModel(page, {
      _image_channels: [
        { name: "DAPI", visible: true, contrast_limits: [0, 255], color: "#9a9a9a" },
        { name: "PanCK", visible: true, contrast_limits: [0, 255], color: "#ff8844" },
        { name: "CD45", visible: false, contrast_limits: [0, 165] },
        { name: "Ki67", visible: false, contrast_limits: [0, 152] },
      ],
    });
    await openImagePanel(page);
    const dock = page.locator(".landmarks__chrome-dock--left");
    await dock.screenshot({ path: `${out}/399-after-2ch-panel.png` });
    await page.getByTestId("layer-channel-row-CD45").focus();
    await dock.screenshot({ path: `${out}/399-after-channel-focus.png` });
    await setModel(page, { _image_channels: makeManyChannels(18) });
    await page.getByTestId("layer-channel-list").waitFor();
    await page.getByTestId("layer-channel-list").evaluate((el) => {
      el.scrollTop = 48;
    });
    await dock.screenshot({ path: `${out}/399-after-18ch-scroll.png` });
    const canvas = page.locator("canvas.landmarks__webgl").first();
    const box = await canvas.boundingBox();
    expect(box).toBeTruthy();
    const widget = page.locator(".milume-widget.landmarks").first();
    await widget.screenshot({
      path: `${out}/399-after-seam-crop.png`,
      clip: {
        x: Math.max(0, box!.x - 4),
        y: box!.y + box!.height * 0.2,
        width: Math.min(420, box!.width * 0.55),
        height: Math.min(280, box!.height * 0.45),
      },
    });
  });
});

test.describe("image panel polish (#399) — colon depth rail", () => {
  test.skip(!volumeHarness || !colonProfile, "requires landmarks-volume colon profile");

  test.beforeEach(async ({ page }) => {
    await bootLandmarksVolumeHarness(page, "noDialkit=1");
  });

  test("rail readout stays 11px while dragging lower bound", async ({ page }) => {
    await expect(page.getByTestId("depth-rail")).toBeVisible();
    const loThumb = page.getByRole("slider", { name: "Lower z bound" });
    const box = await loThumb.boundingBox();
    expect(box).toBeTruthy();
    const cx = box!.x + box!.width / 2;
    const cy = box!.y + box!.height / 2;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx, cy + 20, { steps: 5 });
    const readout = page.getByTestId("depth-rail").locator(".landmarks-depth-rail__readout");
    await expect(readout).toHaveClass(/readout--dragging/);
    const fontSize = await readout.evaluate((el) => getComputedStyle(el).fontSize);
    expect(fontSize).toBe("11px");
    await page.mouse.up();
  });
});
