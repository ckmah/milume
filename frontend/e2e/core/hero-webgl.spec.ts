import { expect, test } from "@playwright/test";

const SITE = process.env.E2E_SITE_URL ?? "http://127.0.0.1:8765";

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

  test("prefers-reduced-motion shows poster fallback", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(`${SITE}/`, { waitUntil: "domcontentloaded" });
    const root = page.locator("[data-milume-hero]").first();
    await expect(root).toHaveAttribute("data-hero-mode", "poster");
    await expect(root.locator("img.milume-hero__poster")).toBeVisible();
    await expect(root.locator("canvas.milume-hero__canvas")).toHaveAttribute("hidden", "");
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
    __milumeHeroHandles?: Array<{ getFrameId?: () => number; isPaused?: () => boolean }>;
  }
}
