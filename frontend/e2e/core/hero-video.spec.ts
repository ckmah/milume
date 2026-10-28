import { expect, test, type Page } from "@playwright/test";

const SUBTITLE =
  "Layer images, cells, and transcripts in 3D, in one reactive widget.";

async function gotoLanding(page: Page) {
  await page.goto("/", { waitUntil: "load" });
}

async function waitForHeroHandle(page: Page) {
  await page.waitForFunction(() => window.__milumeHeroHandles?.[0]?.getLoopTime);
}

test.describe("landing hero montage video (#337)", () => {
  test("does not autoplay; click starts playback", async ({ page }) => {
    await gotoLanding(page);
    const video = page.locator(".hero-media__video");
    await expect(video).toHaveJSProperty("paused", true);
    await expect(page.locator(".hero-media")).toHaveAttribute("data-state", "idle");
    await expect(page.locator(".hero-media__play")).toBeVisible();
    await page.locator(".hero-media__play").click();
    await expect(video).toHaveJSProperty("paused", false);
    await expect(page.locator(".hero-media")).toHaveAttribute("data-state", "playing");
  });

  test("field freezes while the video plays", async ({ page }) => {
    await gotoLanding(page);
    await waitForHeroHandle(page);
    await page.waitForTimeout(400);
    await page.locator(".hero-media__play").click();
    await expect(page.locator(".hero-media__video")).toHaveJSProperty("paused", false);
    const sample = async () =>
      page.evaluate(() => {
        const h = window.__milumeHeroHandles?.[0];
        return {
          loop: h?.getLoopTime?.() ?? -1,
          frame: h?.getFrameId?.() ?? -1,
          paused: h?.isPaused?.() ?? false,
        };
      });
    const a = await sample();
    expect(a.paused).toBe(true);
    await page.waitForTimeout(700);
    const b = await sample();
    expect(b.frame).toBe(a.frame);
    expect(b.loop).toBeCloseTo(a.loop, 5);
  });

  test("field resumes from the frozen frame on pause, not from t=0", async ({ page }) => {
    await gotoLanding(page);
    await waitForHeroHandle(page);
    await page.waitForTimeout(500);
    await page.locator(".hero-media__play").click();
    await expect(page.locator(".hero-media__video")).toHaveJSProperty("paused", false);
    await page.waitForTimeout(300);
    await page.evaluate(() => {
      document.querySelector<HTMLVideoElement>(".hero-media__video")?.pause();
    });
    await expect(page.locator(".hero-media__video")).toHaveJSProperty("paused", true);
    const t0 = await page.evaluate(() => window.__milumeHeroHandles?.[0]?.getLoopTime?.() ?? -1);
    expect(t0).toBeGreaterThan(0.2);
    await page.waitForTimeout(600);
    const t1 = await page.evaluate(() => window.__milumeHeroHandles?.[0]?.getLoopTime?.() ?? -1);
    expect(t1).toBeGreaterThan(t0 + 0.35);
    expect(t1).toBeLessThan(9.8);
  });

  test("offscreen and visibility handlers respect video hold", async ({ page }) => {
    await gotoLanding(page);
    await waitForHeroHandle(page);
    await page.waitForTimeout(400);
    await page.locator(".hero-media__play").click();
    await expect(page.locator(".hero-media__video")).toHaveJSProperty("paused", false);
    const frameBefore = await page.evaluate(
      () => window.__milumeHeroHandles?.[0]?.getFrameId?.() ?? 0,
    );
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(400);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(400);
    const frameAfterScroll = await page.evaluate(
      () => window.__milumeHeroHandles?.[0]?.getFrameId?.() ?? 0,
    );
    expect(frameAfterScroll).toBe(frameBefore);

    await page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        get: () => "hidden",
      });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await page.waitForTimeout(300);
    await page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        get: () => "visible",
      });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await page.waitForTimeout(400);
    const frameAfterVis = await page.evaluate(
      () => window.__milumeHeroHandles?.[0]?.getFrameId?.() ?? 0,
    );
    expect(frameAfterVis).toBe(frameBefore);
  });

  test("mobile stack: video first, CTAs on one line; subtitle only in meta", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoLanding(page);
    const videoBox = await page.locator(".hero-media").boundingBox();
    const copyBox = await page.locator(".hero-copy").boundingBox();
    expect(videoBox && copyBox).toBeTruthy();
    if (videoBox && copyBox) {
      expect(videoBox.y).toBeLessThan(copyBox.y);
    }
    const cta = page.locator(".cta-group");
    const docsBtn = page.locator(".btn-primary");
    const demoBtn = page.locator(".btn-ghost");
    const docsBox = await docsBtn.boundingBox();
    const demoBox = await demoBtn.boundingBox();
    expect(docsBox && demoBox).toBeTruthy();
    if (docsBox && demoBox) {
      expect(Math.abs(docsBox.y - demoBox.y)).toBeLessThan(8);
    }
    await expect(page.locator(".hero .lede")).toHaveCount(0);
    const metaDesc = await page.locator('meta[name="description"]').getAttribute("content");
    expect(metaDesc).toContain(SUBTITLE);
    const ogDesc = await page.locator('meta[property="og:description"]').getAttribute("content");
    expect(ogDesc).toContain(SUBTITLE);
    const ghLink = page.locator('.site-nav a[href*="github.com"]');
    const lines = await ghLink.evaluate((el) => {
      const range = document.createRange();
      range.selectNodeContents(el);
      const rects = range.getClientRects();
      return rects.length;
    });
    expect(lines).toBe(1);
  });
});

declare global {
  interface Window {
    __milumeHeroHandles?: Array<{
      getLoopTime?: () => number;
      getFrameId?: () => number;
      isPaused?: () => boolean;
      setHeldByVideo?: (held: boolean) => void;
      resume?: () => void;
    }>;
  }
}
