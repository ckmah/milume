/**
 * #394 visual acceptance item 2: UI colour switch clip with visible cursor and w.color overlay.
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "@playwright/test";

const outDir = process.env.CAPTURE_OUT ?? "/opt/cursor/artifacts/color-api-394-visual";
const base = process.env.CAPTURE_URL ?? "http://127.0.0.1:5173";

mkdirSync(outDir, { recursive: true });

async function installCursorAndOverlay(page) {
  await page.addStyleTag({
    content: `[data-testid="harness-banner"], .harness-banner, .harness-toolbar, .landmarks__dev-panel { display: none !important; }`,
  });
  await page.evaluate(() => {
    const cur = document.createElement("div");
    cur.id = "capture-cursor";
    cur.style.cssText =
      "width:14px;height:14px;border:2px solid #111;background:#fff;border-radius:50%;position:fixed;z-index:999999;pointer-events:none;transform:translate(-3px,-3px);box-shadow:0 0 0 1px #fff";
    document.body.appendChild(cur);
    const el = document.createElement("div");
    el.id = "color-probe-overlay";
    el.style.cssText =
      "position:fixed;bottom:12px;left:12px;z-index:99999;font:14px monospace;background:#111;color:#eee;padding:8px 10px;border-radius:6px;pointer-events:none";
    document.body.appendChild(el);
  });
}

async function moveCursor(page, x, y) {
  await page.mouse.move(x, y);
  await page.evaluate(
    ([px, py]) => {
      const cur = document.getElementById("capture-cursor");
      if (cur) {
        cur.style.left = `${px}px`;
        cur.style.top = `${py}px`;
      }
    },
    [x, y],
  );
}

async function showColor(page) {
  const c = await page.evaluate(() => window.__landmarksModel.get("color"));
  await page.evaluate((color) => {
    document.getElementById("color-probe-overlay").textContent = `w.color = ${JSON.stringify(color)}`;
  }, c);
  return c;
}

async function waitEngine(page) {
  await page.waitForFunction(() => Boolean(window.__landmarksEngine?.getViewState?.()), null, {
    timeout: 120_000,
  });
}

async function openRightPanel(page) {
  const right = page.locator(".landmarks__chrome-dock--right");
  if ((await right.getAttribute("data-collapsed")) === "true") {
    const btn = page.getByRole("button", { name: "Show right panel" });
    const box = await btn.boundingBox();
    if (box) await moveCursor(page, box.x + box.width / 2, box.y + box.height / 2);
    await btn.click();
  }
}

async function main() {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 2,
    recordVideo: { dir: outDir, size: { width: 1280, height: 800 } },
  });
  const page = await context.newPage();
  await page.goto(`${base}/?fixture=${encodeURIComponent("/fixture.json")}`, { waitUntil: "networkidle" });
  await waitEngine(page);
  await installCursorAndOverlay(page);
  await openRightPanel(page);

  const colorBy = page.getByTestId("explore-color-by");

  const clickTab = async (name) => {
    const tab = colorBy.getByRole("tab", { name });
    const box = await tab.boundingBox();
    if (box) await moveCursor(page, box.x + box.width / 2, box.y + box.height / 2);
    await tab.click();
    await page.waitForTimeout(350);
  };

  await clickTab("cat");
  await showColor(page);

  const catBtn = page.getByRole("button", { name: /region/i }).first();
  if (await catBtn.isVisible()) {
    const box = await catBtn.boundingBox();
    if (box) await moveCursor(page, box.x + box.width / 2, box.y + box.height / 2);
    await catBtn.click();
    await page.waitForTimeout(400);
  }
  await showColor(page);

  await clickTab("num");
  await showColor(page);

  await clickTab("genes");
  const input = page.getByTestId("explore-color-controls").locator('[data-slot="combobox-chip-input"]');
  for (const gene of ["Abtb3", "Adamts2"]) {
    const ib = await input.boundingBox();
    if (ib) await moveCursor(page, ib.x + 20, ib.y + ib.height / 2);
    await input.click();
    await page.keyboard.type(gene);
    const opt = page.getByRole("option", { name: gene, exact: true });
    const ob = await opt.boundingBox();
    if (ob) await moveCursor(page, ob.x + ob.width / 2, ob.y + ob.height / 2);
    await opt.click();
    await page.waitForTimeout(300);
    await showColor(page);
  }

  await clickTab("embed");
  await showColor(page);

  const video = page.video();
  await page.close();
  if (video) await video.saveAs(join(outDir, "color-ui-switch-cursor.webm"));
  await context.close();
  await browser.close();
  console.log(`wrote ${join(outDir, "color-ui-switch-cursor.webm")}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
