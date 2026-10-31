/**
 * #394 visual acceptance: before (legacy traits on main) and after (color API) captures.
 * Same harness fixture.json, 1280×800 @ 2× DPR, full widget, banner hidden.
 *
 *   CAPTURE_URL=http://127.0.0.1:5173 CAPTURE_PHASE=after node scripts/capture-color-visual-acceptance-394.mjs
 *   CAPTURE_URL=http://127.0.0.1:5174 CAPTURE_PHASE=before node scripts/capture-color-visual-acceptance-394.mjs
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "@playwright/test";

const root = join(import.meta.dirname, "..");
const patchDir = join(root, "dev/harness-visual-394");
const phase = process.env.CAPTURE_PHASE ?? "after";
const outDir =
  process.env.CAPTURE_OUT ??
  join("/opt/cursor/artifacts/color-api-394-visual", phase);
const base = process.env.CAPTURE_URL ?? "http://127.0.0.1:5173";
const api = phase === "before" ? "legacy" : "colorApi";

const modes = [
  { id: "categorical", tab: "cat" },
  { id: "numeric", tab: "num" },
  { id: "gene-blend", tab: "genes" },
  { id: "embedding", tab: "embed" },
];

mkdirSync(outDir, { recursive: true });

async function hideHarnessBanner(page) {
  await page.addStyleTag({
    content: `[data-testid="harness-banner"], .harness-banner, .harness-toolbar, .landmarks__dev-panel { display: none !important; }`,
  });
}

async function waitEngine(page) {
  await page.waitForFunction(() => Boolean(window.__landmarksEngine?.getViewState?.()), null, {
    timeout: 120_000,
  });
}

async function setModel(page, patch) {
  await page.evaluate((p) => {
    const model = window.__landmarksModel;
    for (const [k, v] of Object.entries(p)) model.set(k, v);
    model.save_changes();
  }, patch);
}

async function captureWidget(page, name) {
  const widget = page.locator(".milume-widget.landmarks").first();
  await widget.waitFor({ state: "visible", timeout: 120_000 });
  await hideHarnessBanner(page);
  await page.waitForTimeout(300);
  const path = join(outDir, `${name}.png`);
  await widget.screenshot({ path });
  return path;
}

function loadPatch(modeId) {
  const raw = readFileSync(join(patchDir, `${modeId}.json`), "utf8");
  const doc = JSON.parse(raw);
  return doc[api];
}

async function captureModes(page) {
  for (const { id, tab } of modes) {
    const patch = loadPatch(id);
    await page.goto(`${base}/?fixture=${encodeURIComponent("/fixture.json")}`, {
      waitUntil: "networkidle",
    });
    await waitEngine(page);
    await setModel(page, patch);
    await page.getByRole("tab", { name: tab }).click();
    await page.waitForTimeout(500);
    await captureWidget(page, id);
  }
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 2,
  });
  await captureModes(page);
  await browser.close();
  console.log(JSON.stringify({ phase, api, outDir }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
