/**
 * Record #395 visual acceptance: full-widget PNGs + contrast drag webm (cube open, cursor visible).
 * Run with production preview: npm run build && node scripts/capture-issue395-pr-assets.mjs
 * Env: CAPTURE_BASE=http://127.0.0.1:4173/?noDialkit=1 (vite preview + issue395 profile)
 */
import { chromium } from "@playwright/test";
import { mkdir, rename } from "node:fs/promises";
import { readdir } from "node:fs/promises";
import { join } from "node:path";

const base = process.env.CAPTURE_BASE ?? "http://127.0.0.1:5173/?noDialkit=1";
const outDir = process.env.CAPTURE_OUT ?? "/opt/cursor/artifacts/issue395";
const videoTmp = join(outDir, "_video_tmp");

await mkdir(outDir, { recursive: true });
await mkdir(videoTmp, { recursive: true });

const browser = await chromium.launch({
  args: ["--enable-gpu", "--ignore-gpu-blocklist", "--disable-lcd-text"],
});
const context = await browser.newContext({
  recordVideo: { dir: videoTmp, size: { width: 1280, height: 800 } },
  viewport: { width: 1280, height: 800 },
  deviceScaleFactor: 2,
});
const page = await context.newPage();

async function hideHarnessChrome() {
  await page.addStyleTag({
    content: `
      [data-testid="harness-banner"],
      .harness-banner,
      .landmarks-volume-harness__banner,
      .landmarks-volume-harness__controls,
      [data-dialkit-panel],
      .dialkit-root,
      .deckgl-error-overlay { display: none !important; }
    `,
  });
}

async function waitReady() {
  await page.goto(base, { waitUntil: "networkidle" });
  await page.waitForFunction(() => Boolean(window.__landmarksEngine?.getViewState?.()));
  await hideHarnessChrome();
  await page.waitForTimeout(600);
}

async function openCube() {
  await page.getByRole("radio", { name: "Inspect", exact: true }).click();
  const plot = page.locator(".landmarks__plot");
  const box = await plot.boundingBox();
  if (!box) throw new Error("no plot");
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.getByRole("dialog", { name: "Cube" }).waitFor({ timeout: 60_000 });
  await page.waitForFunction(
    () => document.querySelector(".volume-cube__view")?.getAttribute("data-refining") === "false",
    null,
    { timeout: 120_000 },
  );
  const err = await page.evaluate(() => document.body.innerText.includes("Compilation error"));
  if (err) throw new Error("cube shader compile overlay visible");
}

async function openLayersInInspect() {
  await page.evaluate(() => {
    const root = document.querySelector(".milume-widget.landmarks");
    if (root instanceof HTMLElement) root.focus();
  });
  await page.keyboard.press("[");
  await page.waitForFunction(
    () => document.querySelector(".landmarks__chrome-dock--left")?.getAttribute("data-collapsed") === "false",
    null,
    { timeout: 15_000 },
  );
  await page.getByTestId("panel-section-layers").click({ force: true });
  await page.getByTestId("layers-image-row").waitFor({ state: "attached", timeout: 15_000 });
  const row = page.getByTestId("layers-image-row");
  if ((await row.getAttribute("aria-expanded")) !== "true") await row.click({ force: true });
}

await waitReady();
const widget = page.locator(".milume-widget.landmarks");
await page.waitForTimeout(1500);
await widget.screenshot({ path: join(outDir, "395-map-band-two-channel-blend.png") });

await openCube();
await page.waitForTimeout(800);
await widget.screenshot({ path: join(outDir, "395-cube-two-channel-blend.png") });

await openLayersInInspect();
const hiThumb = page.getByRole("slider", { name: "DAPI contrast, maximum" });
await hiThumb.scrollIntoViewIfNeeded();
const box = await hiThumb.boundingBox();
if (!box) throw new Error("no slider");
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await page.waitForTimeout(300);
await page.mouse.down();
for (let i = 1; i <= 24; i++) {
  await page.mouse.move(box.x - i * 5, box.y + box.height / 2);
  await page.waitForTimeout(50);
}
await page.mouse.up();
await page.waitForTimeout(600);

await context.close();
await browser.close();

const webm = (await readdir(videoTmp)).find((f) => f.endsWith(".webm"));
if (webm) {
  await rename(join(videoTmp, webm), join(outDir, "395-contrast-drag-cube.webm"));
}
console.log(`Wrote captures under ${outDir}`);
