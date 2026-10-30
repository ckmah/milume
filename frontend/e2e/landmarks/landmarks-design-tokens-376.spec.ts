import { expect, type Page } from "@playwright/test";

import { test } from "../fixtures";

import { bootLandmarksHarness, stabilizeUi, waitForEngine } from "../helpers";

/** WCAG contrast from computed `rgb()` / `rgba()` strings. */
function contrastFromComputed(fg: string, bg: string): number {
  const parse = (s: string) => {
    const m = s.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i);
    if (!m) throw new Error(`bad color ${s}`);
    return [Number(m[1]), Number(m[2]), Number(m[3])].map((c) => c / 255);
  };
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const lum = (rgb: number[]) => {
    const [r, g, b] = rgb.map(lin);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const l1 = lum(parse(fg));
  const l2 = lum(parse(bg));
  const hi = Math.max(l1, l2);
  const lo = Math.min(l1, l2);
  return (hi + 0.05) / (lo + 0.05);
}

async function loadNicheAndLandmark(page: Page) {
  await page.evaluate(async () => {
    const res = await fetch("/squidpy-niche-fixture.json");
    if (!res.ok) throw new Error(`fixture ${res.status}`);
    const patch = (await res.json()) as Record<string, unknown>;
    const model = (window as any).__landmarksModel;
    const eng = (window as any).__landmarksEngine;
    const b = eng.getViewportWorldBounds();
    const W = b.xMax - b.xMin;
    const H = b.yMax - b.yMin;
    const X = (f: number) => b.xMin + W * f;
    const Y = (f: number) => b.yMin + H * f;
    for (const [k, v] of Object.entries(patch)) model.set(k, v);
    model.set("landmarks", [
      {
        id: "measure-line",
        type: "line",
        vertices: [
          [X(0.35), Y(0.42)],
          [X(0.55), Y(0.48)],
        ],
        color: "#00e5ff",
        line_style: "solid",
      },
    ]);
    model.set("selected_kind", "landmark");
    model.set("selected_index", 0);
    model.save_changes();
  });
  await waitForEngine(page, 150);
  await stabilizeUi(page);
}

async function openCategoryDonut(page: Page) {
  const right = page.locator(".landmarks__chrome-dock--right");
  if ((await right.getAttribute("data-collapsed")) === "true") {
    await page.getByRole("button", { name: "Show right panel" }).click();
  }
  await page.getByTestId("explore-color-by").getByRole("tab", { name: "category" }).click();
  await expect(page.getByTestId("info-donut")).toBeVisible();
}

async function sampleTextContrast(page: Page, selector: string) {
  return page.evaluate(
    ({ sel }) => {
      const resolve = (cssColor: string) => {
        const canvas = document.createElement("canvas");
        canvas.width = 1;
        canvas.height = 1;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("no canvas");
        ctx.fillStyle = cssColor;
        ctx.fillRect(0, 0, 1, 1);
        const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
        return `rgb(${r}, ${g}, ${b})`;
      };
      const el = document.querySelector(sel);
      if (!el) return null;
      const cs = getComputedStyle(el);
      const rawFg =
        el instanceof SVGElement && cs.fill && cs.fill !== "none" ? cs.fill : cs.color;
      const fg = resolve(rawFg);
      let node: Element | null = el;
      let rawBg = "rgb(255, 255, 255)";
      while (node) {
        const bg = getComputedStyle(node).backgroundColor;
        if (bg && !/,\s*0\s*\)$/.test(bg)) {
          rawBg = bg;
          break;
        }
        node = node.parentElement;
      }
      const bg = resolve(rawBg);
      return { fg, bg };
    },
    { sel: selector },
  );
}

test.describe("Design tokens #376", () => {
  test.beforeEach(async ({ page }) => {
    await bootLandmarksHarness(page);
    await loadNicheAndLandmark(page);
    await openCategoryDonut(page);
  });

  test("donut cells caption and landmark Length meta are at least 4.5:1", async ({ page }) => {
    const caption = await sampleTextContrast(page, ".landmarks__info-donut-caption");
    expect(caption).toBeTruthy();
    const captionRatio = contrastFromComputed(caption!.fg, caption!.bg);
    expect(captionRatio).toBeGreaterThanOrEqual(4.5);

    const measure = await sampleTextContrast(page, "[data-testid='landmark-measure']");
    expect(measure).toBeTruthy();
    const measureRatio = contrastFromComputed(measure!.fg, measure!.bg);
    expect(measureRatio).toBeGreaterThanOrEqual(4.5);
    test.info().annotations.push({
      type: "contrast",
      description: `dark caption ${captionRatio.toFixed(2)}:1 length ${measureRatio.toFixed(2)}:1`,
    });
  });

  test("legend +N overflow badge is 11px", async ({ page }) => {
    const size = await page.locator(".landmarks__legend-overflow").first().evaluate((el) => {
      return getComputedStyle(el).fontSize;
    });
    expect(size).toBe("11px");
  });
});

test.describe("Design tokens #376 light theme", () => {
  test("contrast holds in light theme", { tag: "@isolated" }, async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem("milume-harness-theme", "light");
    });
    await bootLandmarksHarness(page);
    await loadNicheAndLandmark(page);
    await openCategoryDonut(page);

    const caption = await sampleTextContrast(page, ".landmarks__info-donut-caption");
    expect(contrastFromComputed(caption!.fg, caption!.bg)).toBeGreaterThanOrEqual(4.5);

    const measure = await sampleTextContrast(page, "[data-testid='landmark-measure']");
    const captionRatio = contrastFromComputed(caption!.fg, caption!.bg);
    const measureRatio = contrastFromComputed(measure!.fg, measure!.bg);
    expect(captionRatio).toBeGreaterThanOrEqual(4.5);
    expect(measureRatio).toBeGreaterThanOrEqual(4.5);
    test.info().annotations.push({
      type: "contrast",
      description: `light caption ${captionRatio.toFixed(2)}:1 length ${measureRatio.toFixed(2)}:1`,
    });
  });
});
