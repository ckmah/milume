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

async function panSeamEdgeIntoView(page: import("@playwright/test").Page) {
  await waitForEngine(page);
  await expect
    .poll(async () =>
      page.evaluate(
        () =>
          (window as unknown as { __landmarksEngine?: { getBackdropPick?: () => { level?: number } } })
            .__landmarksEngine?.getBackdropPick?.()?.level,
      ),
    )
    .not.toBeNull();
  await page.evaluate(async () => {
    const eng = (window as unknown as {
      __landmarksEngine: {
        getBackdropBounds?: () => number[];
        getViewState: () => { zoom?: number; target?: number[] };
        setViewState: (v: unknown) => void;
        getCanvasSize?: () => { width: number; height: number };
      };
    }).__landmarksEngine;
    const lm = (window as unknown as { __landmarksModel: { get: (k: string) => number[] } })
      .__landmarksModel;
    const xb = lm.get("x_bounds");
    const yb = lm.get("y_bounds");
    const cx = (xb[0]! + xb[1]!) / 2;
    const cy0 = (yb[0]! + yb[1]!) / 2;
    const span0 = Math.max(xb[1]! - xb[0]!, yb[1]! - yb[0]!, 1);
    const vs0 = eng.getViewState();
    const { width, height } = eng.getCanvasSize?.() ?? { width: 1280, height: 800 };
    const fitZoom = Math.log2(Math.min(width, height) / (span0 * 1.15));
    eng.setViewState({ ...vs0, target: [cx, cy0, vs0.target?.[2] ?? 0], zoom: fitZoom });
    await new Promise((r) => setTimeout(r, 700));
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    let bounds = eng.getBackdropBounds?.();
    for (let i = 0; i < 20 && !bounds; i++) {
      await sleep(200);
      bounds = eng.getBackdropBounds?.();
    }
    if (!bounds) {
      bounds = [xb[0]!, yb[0]!, xb[1]!, yb[1]!];
    }
    const [left, bottom, right, top] = bounds;
    const cy = (bottom + top) / 2;
    const span = Math.max(right - left, top - bottom, 1);
    const vs = eng.getViewState();
    const zoom = Math.log2(Math.min(width, height) / (span * 0.38));
    eng.setViewState({
      ...vs,
      target: [right - span * 0.035, cy, vs.target?.[2] ?? 0],
      zoom,
    });
  });
  await page.waitForTimeout(1600);
}

async function sampleSeamCanvasPixels(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const eng = (window as unknown as {
      __landmarksEngine: {
        getBackdropBounds?: () => number[];
        getViewState: () => { zoom?: number; target?: number[] };
      };
    }).__landmarksEngine;
    const lm = (window as unknown as { __landmarksModel: { get: (k: string) => number[] } }).__landmarksModel;
    const cached = eng.getBackdropBounds?.();
    let left: number;
    let bottom: number;
    let right: number;
    let top: number;
    if (cached && cached.length === 4) {
      [left, bottom, right, top] = cached;
    } else {
      const cut = lm.get("volume_cut");
      if (!cut || cut.length < 4) return { ok: false as const };
      left = cut[0]!;
      right = cut[1]!;
      bottom = cut[2]!;
      top = cut[3]!;
    }
    const cy = (bottom + top) / 2;
    const span = Math.max(right - left, top - bottom, 1);
    const canvas = document.querySelector("canvas.landmarks__webgl") as HTMLCanvasElement | null;
    const gl = canvas?.getContext("webgl2") ?? canvas?.getContext("webgl");
    if (!canvas || !gl) return { ok: false as const };
    const vs = eng.getViewState();
    const cRect = canvas.getBoundingClientRect();
    const scale = 2 ** (vs.zoom ?? 0);
    const tx = vs.target?.[0] ?? 0;
    const ty = vs.target?.[1] ?? 0;
    const project = (wx: number, wy: number) => ({
      x: (wx - tx) * scale + cRect.width / 2 + cRect.left,
      y: cRect.height / 2 - (wy - ty) * scale + cRect.top,
    });
    const outsidePt = project(right + span * 0.06, cy);
    const readAtClient = (clientX: number, clientY: number) => {
      const x = Math.floor(((clientX - cRect.left) * canvas.width) / cRect.width);
      const y = Math.floor(
        (1 - (clientY - cRect.top) / cRect.height) * canvas.height,
      );
      const px = new Uint8Array(4);
      gl.readPixels(
        Math.max(0, Math.min(canvas.width - 1, x)),
        Math.max(0, Math.min(canvas.height - 1, y)),
        1,
        1,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        px,
      );
      return [px[0]!, px[1]!, px[2]!] as [number, number, number];
    };
    const nearBlack = ([r, g, b]: [number, number, number]) =>
      r <= 1 && g <= 1 && b <= 1;
    const insideCandidates = [
      project(right - span * 0.02, cy),
      project(right - span * 0.04, cy),
      project(left + span * 0.93, cy),
      project(left + span * 0.85, cy),
    ];
    let inside = readAtClient(insideCandidates[0]!.x, insideCandidates[0]!.y);
    for (const pt of insideCandidates) {
      const rgb = readAtClient(pt.x, pt.y);
      if (nearBlack(rgb)) {
        inside = rgb;
        break;
      }
    }
    if (!nearBlack(inside)) {
      for (let t = 0.05; t <= 0.95; t += 0.05) {
        const pt = project(left + span * t, cy);
        const rgb = readAtClient(pt.x, pt.y);
        if (nearBlack(rgb)) {
          inside = rgb;
          break;
        }
      }
    }
    const outside = project(right + span * 0.06, cy);
    return {
      ok: true as const,
      inside,
      outside: readAtClient(outsidePt.x, outsidePt.y),
    };
  });
}

function nearBlack([r, g, b]: [number, number, number], tolerance = 1) {
  return r <= tolerance && g <= tolerance && b <= tolerance;
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

  test("empty backdrop pixels match canvas black at the image edge", async ({ page }) => {
    await page.goto("/?noDialkit=1", { waitUntil: "networkidle" });
    await waitForEngine(page);
    await expect
      .poll(
        async () =>
          page.evaluate(
            () =>
              (window as unknown as { __landmarksEngine?: { getBackdropPick?: () => { level?: number } } })
                .__landmarksEngine?.getBackdropPick?.()?.level,
          ),
        { timeout: 90_000 },
      )
      .not.toBeNull();
    await panSeamEdgeIntoView(page);
    await page.waitForTimeout(2000);
    const pixels = await sampleSeamCanvasPixels(page);
    expect(pixels.ok, JSON.stringify(pixels)).toBe(true);
    if (!pixels.ok) return;
    expect(nearBlack(pixels.inside), `inside=${pixels.inside.join(",")}`).toBe(true);
    expect(nearBlack(pixels.outside), `outside=${pixels.outside.join(",")}`).toBe(true);
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
