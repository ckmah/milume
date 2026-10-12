import { expect, test } from "@playwright/test";

const SITE = process.env.E2E_SITE_URL ?? "http://127.0.0.1:8765";

/** `HERO_BAKED_BASE_COUNT` × z tiles (see `website/landing/hero/subsample.ts`). */
const HERO_INSTANCE_COUNT = 85 * 5;

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

  test("visible point count is stable across one camera loop", async ({ page }) => {
    await page.goto(`${SITE}/`, { waitUntil: "networkidle" });
    await page.waitForFunction(() => window.__milumeHeroHandles?.[0]?.setTime);
    const loopSec = 11;
    const samples = 24;
    const counts = await page.evaluate(
      ({ loopSec, samples }) => {
        const h = window.__milumeHeroHandles?.[0];
        if (!h?.setTime || !h.getVisiblePointCount) return [];
        const out: number[] = [];
        for (let i = 0; i < samples; i++) {
          const t = (i / samples) * loopSec;
          h.setTime(t);
          out.push(h.getVisiblePointCount());
        }
        return out;
      },
      { loopSec, samples },
    );
    expect(counts.length).toBe(samples);
    expect(counts.every((n) => n === HERO_INSTANCE_COUNT)).toBe(true);
    const unique = new Set(counts);
    expect(unique.size).toBe(1);
    expect(counts[0]).toBe(HERO_INSTANCE_COUNT);
  });

  test("visible disc count per frame matches designer density band", async ({ page }) => {
    await page.goto(`${SITE}/`, { waitUntil: "networkidle" });
    await page.waitForFunction(() => window.__milumeHeroHandles?.[0]?.getVisibleDiscStatsAcrossLoop);
    const stats = await page.evaluate(() => {
      const h = window.__milumeHeroHandles?.[0];
      return h?.getVisibleDiscStatsAcrossLoop?.() ?? null;
    });
    expect(stats).not.toBeNull();
    expect(stats!.mean).toBeGreaterThanOrEqual(300);
    expect(stats!.mean).toBeLessThanOrEqual(400);
    expect(stats!.min).toBeGreaterThanOrEqual(280);
    expect(stats!.max).toBeLessThanOrEqual(425);
  });

  test("projected point radius stays below viewport cap across the loop", async ({ page }) => {
    await page.goto(`${SITE}/`, { waitUntil: "networkidle" });
    await page.waitForFunction(() => window.__milumeHeroHandles?.[0]?.setTime);
    const result = await page.evaluate(() => {
      const h = window.__milumeHeroHandles?.[0];
      if (!h?.getMaxProjectedRadiusAcrossLoop || !h.getMaxAllowedProjectedRadius) {
        return { max: 0, cap: 0 };
      }
      return {
        max: h.getMaxProjectedRadiusAcrossLoop(),
        cap: h.getMaxAllowedProjectedRadius(),
      };
    });
    expect(result.cap).toBeGreaterThan(0);
    expect(result.max).toBeLessThanOrEqual(result.cap * 1.001);
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
      getVisiblePointCount?: () => number;
      getMaxProjectedRadiusAcrossLoop?: () => number;
      getMaxAllowedProjectedRadius?: () => number;
      getVisibleDiscStatsAcrossLoop?: () => {
        min: number;
        max: number;
        mean: number;
      } | null;
    }>;
  }
}
