/**
 * Visual evidence for #387. Run from frontend/ with dev server on MILUME_387_PORT (default 5187).
 *   npm run dev:landmarks -- --host 127.0.0.1 --port 5187 --strictPort
 *   node scripts/capture-issue-387-evidence.mjs [--before|--after]
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";

const outDir = process.env.MILUME_387_EVIDENCE_DIR || "/opt/cursor/artifacts/screenshots";
const phase = process.argv.includes("--before") ? "before" : "after";
const port = Number(process.env.MILUME_387_PORT || 5187);
const base = `http://127.0.0.1:${port}/`;

mkdirSync(outDir, { recursive: true });

async function hideHarnessChrome(page) {
  await page.addStyleTag({
    content: ".harness-toolbar { display: none !important; } .harness-shell { padding: 0 !important; }",
  });
}

async function openGenesPicker(page) {
  const right = page.locator(".landmarks__chrome-dock--right");
  if ((await right.getAttribute("data-collapsed")) === "true") {
    await page.getByRole("button", { name: "Show right panel" }).click();
  }
  await page.getByTestId("explore-color-by").getByRole("tab", { name: "genes" }).click();
}

async function waitForEngine(page) {
  await page.locator(".landmarks").first().waitFor({ state: "visible" });
  await page.locator("canvas.landmarks__webgl").first().waitFor({ state: "visible" });
  await page.waitForFunction(() => {
    const eng = window.__landmarksEngine;
    const vs = eng?.getViewState?.();
    return Boolean(vs && Number.isFinite(vs.zoom));
  });
}

async function stabilizeUi(page) {
  await page.evaluate(() => {
    if (window.__motionOff) return;
    window.__motionOff = true;
    const animate = Element.prototype.animate;
    Element.prototype.animate = function (keyframes, options) {
      const timing =
        typeof options === "number" ? { duration: 0 } : { ...options, duration: 0, delay: 0, endDelay: 0 };
      return animate.call(this, keyframes, timing);
    };
  });
}

async function boot(page) {
  await page.addInitScript(() => {
    window.localStorage.setItem("milume-harness-theme", "dark");
  });
  await page.goto(base, { waitUntil: "networkidle" });
  await waitForEngine(page);
  await stabilizeUi(page);
  await hideHarnessChrome(page);
  await openGenesPicker(page);
}

async function shotWidget(page, name) {
  const widget = page.locator(".landmarks").first();
  await widget.waitFor({ state: "visible" });
  await page.waitForTimeout(200);
  await widget.screenshot({ path: join(outDir, name) });
}

async function captureAbtb3Found(page) {
  const input = page.getByTestId("explore-color-controls").getByPlaceholder("Select genes");
  await input.click();
  await input.pressSequentially("Abtb3", { delay: 20 });
  await page.getByRole("option", { name: "Abtb3", exact: true }).waitFor({ state: "visible" });
  await shotWidget(page, `issue-387-full-widget-abtb3-${phase}.png`);
}

async function captureEmptyQuery(page) {
  const input = page.getByTestId("explore-color-controls").getByPlaceholder("Select genes");
  await input.click();
  await page.waitForTimeout(150);
  await shotWidget(page, `issue-387-empty-query-${phase}.png`);
}

async function captureSynQuery(page) {
  await page.evaluate(async (size) => {
    const model = window.__landmarksModel;
    const existing = ((model.get("gene_names") ?? []) ).map((g) => g.name);
    const genes = Array.from({ length: size }, (_, i) => ({
      name: existing[i] ?? `SYN_${String(i).padStart(5, "0")}`,
    }));
    model.set("gene_names", genes);
    model.save_changes();
  }, 500);
  await page.waitForTimeout(300);
  const input = page.getByTestId("explore-color-controls").getByPlaceholder("Select genes");
  await input.click();
  await input.fill("");
  await input.pressSequentially("syn", { delay: 30 });
  await page.locator('[data-slot="combobox-item"]').first().waitFor({ state: "visible" });
  await shotWidget(page, `issue-387-syn-query-${phase}.png`);
}

async function captureStuckComposition(page) {
  const input = page.getByTestId("explore-color-controls").getByPlaceholder("Select genes");
  await input.click();
  await page.evaluate(() => {
    const inputEl = document.querySelector(
      '[data-testid="explore-color-controls"] [data-slot="combobox-chip-input"]',
    );
    if (!(inputEl instanceof HTMLInputElement)) throw new Error("input missing");
    inputEl.focus();
    inputEl.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true, data: "" }));
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    if (setter) setter.call(inputEl, "Abtb3");
    else inputEl.value = "Abtb3";
  });
  await page.waitForTimeout(100);
  await shotWidget(page, `issue-387-stuck-composition-${phase}.png`);
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 960 } });

try {
  await boot(page);
  if (phase === "before") {
    await captureStuckComposition(page);
    await page.reload({ waitUntil: "networkidle" });
    await waitForEngine(page);
    await stabilizeUi(page);
    await hideHarnessChrome(page);
    await openGenesPicker(page);
  }
  await captureEmptyQuery(page);
  await page.reload({ waitUntil: "networkidle" });
  await waitForEngine(page);
  await stabilizeUi(page);
  await hideHarnessChrome(page);
  await openGenesPicker(page);
  await captureSynQuery(page);
  await page.reload({ waitUntil: "networkidle" });
  await waitForEngine(page);
  await stabilizeUi(page);
  await hideHarnessChrome(page);
  await openGenesPicker(page);
  await captureAbtb3Found(page);
} finally {
  await browser.close();
}

console.log(`issue-387 evidence (${phase}) -> ${outDir}`);
