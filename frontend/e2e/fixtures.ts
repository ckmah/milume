import { test as base, type Browser, type Page, type TestInfo } from "@playwright/test";

/** Tag a test `{ tag: "@isolated" }` when it needs a fresh page (an init script, or anything a remount cannot undo). */
const ISOLATED = "@isolated";

async function newPage(browser: Browser, info: Pick<TestInfo, "project">) {
  const { baseURL, viewport, deviceScaleFactor } = info.project.use;
  const context = await browser.newContext({ baseURL, viewport, deviceScaleFactor });
  return { context, page: await context.newPage() };
}

/** Undo what a previous test did to the shared page: input state, routes, listeners, viewport, URL options. */
async function resetPage(page: Page, info: Pick<TestInfo, "project">) {
  await page.mouse.up().catch(() => undefined);
  for (const key of ["Shift", "Control", "Alt", "Meta", "Space"]) {
    await page.keyboard.up(key).catch(() => undefined);
  }
  await page.unrouteAll({ behavior: "ignoreErrors" }).catch(() => undefined);
  for (const event of ["request", "response", "console", "pageerror", "dialog"] as const) {
    page.removeAllListeners(event);
  }
  const viewport = info.project.use.viewport;
  if (viewport) await page.setViewportSize(viewport).catch(() => undefined);
  // `?window=` / `?budgets=` are read once at load: leave them behind with a plain reload.
  if (new URL(page.url(), "http://x").search !== "") {
    await page.goto("/", { waitUntil: "networkidle" }).catch(() => undefined);
  }
  await page.evaluate(() => {
    (document.activeElement as HTMLElement | null)?.blur?.();
    window.scrollTo(0, 0);
  }).catch(() => undefined);
}

/**
 * One page per worker instead of one per test. The first test boots the harness
 * (Vite modules, deck.gl, fixture); later tests call the boot helper, which
 * remounts the widget in place. Tests stay independent: each starts on a fresh
 * model and a fresh engine, only the browser page is shared.
 */
export const test = base.extend<object, { workerPage: Page }>({
  workerPage: [
    async ({ browser }, use, workerInfo) => {
      const { context, page } = await newPage(browser, workerInfo);
      // A fresh page per test used to start with a cold HTTP cache; keep that, or chunk loads
      // finish instantly and tests that watch progressive loading never see the coarse level.
      const cdp = await context.newCDPSession(page);
      await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
      await use(page);
      await context.close();
    },
    { scope: "worker" },
  ],
  page: async ({ browser, workerPage }, use, testInfo) => {
    if (testInfo.tags.includes(ISOLATED)) {
      const { context, page } = await newPage(browser, testInfo);
      await use(page);
      await context.close();
      return;
    }
    // Mirror the config's `trace: "on-first-retry"`; tracing slows timing-sensitive tests, so the first attempt runs untraced.
    const context = workerPage.context();
    const isTraced = testInfo.retry > 0;
    if (isTraced) await context.tracing.start({ screenshots: true, snapshots: true });
    await resetPage(workerPage, testInfo);
    await use(workerPage);
    await resetPage(workerPage, testInfo);
    if (isTraced) {
      const path = testInfo.outputPath("trace.zip");
      await context.tracing.stop({ path });
      if (testInfo.status !== testInfo.expectedStatus) {
        await testInfo.attach("trace", { path, contentType: "application/zip" });
      }
    }
  },
});

export { expect } from "@playwright/test";
