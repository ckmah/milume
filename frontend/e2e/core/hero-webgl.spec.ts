import { expect, test } from "@playwright/test";

const SITE = process.env.E2E_SITE_URL ?? "http://127.0.0.1:8765";
const HERO_BASE_POINTS = 650;
const LOOP_SEC = 10;

test.describe("milume hero WebGL", () => {
  test("canvas renders a non-blank frame on the landing page", async ({ page }) => {
    await page.goto(`${SITE}/`, { waitUntil: "networkidle" });
    const root = page.locator("[data-milume-hero]").first();
    await expect(root).toHaveAttribute("data-hero-mode", "webgl");
    const canvas = root.locator("canvas.milume-hero__canvas");
    await expect(canvas).toBeVisible();
    await page.waitForTimeout(800);
    const blank = await canvas.evaluate((el) => {
      const c = el as HTMLCanvasElement;
      const gl = c.getContext("webgl2") ?? c.getContext("webgl");
      if (!gl) return true;
      const w = c.width;
      const h = c.height;
      const pixels = new Uint8Array(w * h * 4);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      let bright = 0;
      for (let i = 0; i < pixels.length; i += 4) {
        if (pixels[i] + pixels[i + 1] + pixels[i + 2] > 40) bright++;
      }
      return bright < 50;
    });
    expect(blank).toBe(false);
  });

  test("prefers-reduced-motion keeps a static webgl frame", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(`${SITE}/`, { waitUntil: "networkidle" });
    const root = page.locator("[data-milume-hero]").first();
    await expect(root).toHaveAttribute("data-hero-mode", "webgl");
    await expect(root.locator("canvas.milume-hero__canvas")).toBeVisible();
    await page.waitForFunction(() => window.__milumeHeroHandles?.[0]?.isPaused?.() === true);
    const before = await page.evaluate(() => window.__milumeHeroHandles?.[0]?.getFrameId?.() ?? 0);
    await page.waitForTimeout(900);
    const after = await page.evaluate(() => window.__milumeHeroHandles?.[0]?.getFrameId?.() ?? 0);
    expect(after).toBe(before);
    const loopT = await page.evaluate(() => window.__milumeHeroHandles?.[0]?.getLoopTime?.() ?? -1);
    expect(loopT).toBeCloseTo(1.5, 5);
  });

  test("seeded base point count is constant", async ({ page }) => {
    await page.goto(`${SITE}/`, { waitUntil: "networkidle" });
    await page.waitForFunction(() => window.__milumeHeroHandles?.[0]?.getBasePointCount);
    const n = await page.evaluate(() => window.__milumeHeroHandles?.[0]?.getBasePointCount?.() ?? 0);
    expect(n).toBe(HERO_BASE_POINTS);
  });

  test("field has no NaN", async ({ page }) => {
    await page.goto(`${SITE}/`, { waitUntil: "networkidle" });
    await page.waitForFunction(() => window.__milumeHeroHandles?.[0]?.fieldHasNaN);
    const bad = await page.evaluate(() => window.__milumeHeroHandles?.[0]?.fieldHasNaN?.());
    expect(bad).toBe(false);
  });

  test("visible instance count is deterministic at fixed times", async ({ page }) => {
    await page.goto(`${SITE}/`, { waitUntil: "networkidle" });
    await page.waitForFunction(() => window.__milumeHeroHandles?.[0]?.setTime);
    const times = [0, 1.5, 9.7];
    const run = () =>
      page.evaluate((sampleTimes) => {
        const h = window.__milumeHeroHandles?.[0];
        if (!h?.setTime || !h.getLastInstanceCount) return [];
        return sampleTimes.map((t) => {
          h.setTime(t);
          return h.getLastInstanceCount();
        });
      }, times);
    const a = await run();
    const b = await run();
    expect(a).toEqual(b);
    expect(a.every((n) => n > 0)).toBe(true);
  });

  test("pauses when off screen", async ({ page }) => {
    await page.goto(`${SITE}/`, { waitUntil: "networkidle" });
    const root = page.locator("[data-milume-hero]").first();
    await expect(root).toHaveAttribute("data-hero-mode", "webgl");
    await page.waitForFunction(() => (window.__milumeHeroHandles?.[0]?.getFrameId?.() ?? 0) > 2);
    await page.evaluate(() => window.scrollTo(0, window.innerHeight * 1.25));
    await page.waitForFunction(() => window.__milumeHeroHandles?.[0]?.isPaused?.() === true);
    const before = await page.evaluate(() => window.__milumeHeroHandles?.[0]?.getFrameId?.() ?? 0);
    await page.waitForTimeout(900);
    const after = await page.evaluate(() => window.__milumeHeroHandles?.[0]?.getFrameId?.() ?? 0);
    expect(after).toBe(before);
  });
});

declare global {
  interface Window {
    __milumeHeroHandles?: Array<{
      getFrameId?: () => number;
      isPaused?: () => boolean;
      setTime?: (t: number) => void;
      renderOnce?: () => void;
      resume?: () => void;
      getLoopTime?: () => number;
      getBasePointCount?: () => number;
      getLastInstanceCount?: () => number;
      fieldHasNaN?: () => boolean;
    }>;
  }
}
