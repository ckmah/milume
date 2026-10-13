/**
 * Issue #172 PR evidence: 2D (top) and 3D (iso) inspect labels, light + dark.
 * Usage: PORT=5173 OUT=/opt/cursor/artifacts node scripts/capture-issue-172-evidence.mjs
 *
 * landmarks-volume harness is always mounted under a `.dark` shell; theme is applied
 * the same way as HarnessShell (documentElement + shell + widget classes).
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "@playwright/test";

const PORT = Number(process.env.PORT || 5173);
const OUT = process.env.OUT || "/opt/cursor/artifacts";
mkdirSync(OUT, { recursive: true });

function md5(path) {
  return createHash("md5").update(readFileSync(path)).digest("hex");
}

async function applyHarnessTheme(page, theme) {
  const dark = theme === "dark";
  await page.evaluate((isDark) => {
    const root = document.documentElement;
    root.classList.remove("light", "dark", "dark-theme", "light-theme");
    if (isDark) root.classList.add("dark", "dark-theme");
    else root.classList.add("light", "light-theme");
    window.localStorage.setItem("milume-harness-theme", isDark ? "dark" : "light");
    const shell = document.querySelector(".min-h-screen");
    if (shell instanceof HTMLElement) {
      shell.classList.toggle("dark", isDark);
      shell.classList.toggle("bg-neutral-950", isDark);
      shell.classList.toggle("text-neutral-100", isDark);
      shell.classList.toggle("bg-white", !isDark);
      shell.classList.toggle("text-neutral-950", !isDark);
    }
    const widget = document.querySelector(".landmarks");
    if (widget instanceof HTMLElement) {
      widget.classList.toggle("dark", isDark);
      widget.classList.toggle("landmarks--dark", isDark);
    }
  }, dark);
  await page.waitForTimeout(250);
}

async function openCube(page, theme) {
  await page.goto(`http://127.0.0.1:${PORT}/?window=100`, { waitUntil: "networkidle", timeout: 120_000 });
  await page.waitForFunction(() => Boolean(window.__landmarksEngine?.getViewState?.()), null, { timeout: 120_000 });
  await applyHarnessTheme(page, theme);
  await page.getByRole("radio", { name: "Inspect", exact: true }).click();
  const canvas = page.locator("canvas.landmarks__webgl").first();
  const box = await canvas.boundingBox();
  if (!box) throw new Error("no canvas");
  await page.mouse.click(box.x + box.width * 0.52, box.y + box.height * 0.48);
  const view = page.locator('[role="dialog"][aria-label="Cube"] .volume-cube__view');
  await view.waitFor({ state: "visible", timeout: 120_000 });
  await page.waitForFunction(
    () => document.querySelector(".volume-cube__view")?.getAttribute("data-refining") === "false",
    null,
    { timeout: 120_000 },
  );
  for (const toggle of ["layer-toggle-labels", "layer-toggle-image"]) {
    const el = page.getByTestId(toggle);
    if (toggle.endsWith("labels") && (await el.getAttribute("aria-pressed")) !== "true") await el.click();
  }
  return { view, bar: page.getByTestId("context-inspect-toolbar") };
}

async function ensureImage(page, on) {
  const el = page.getByTestId("layer-toggle-image");
  const pressed = (await el.getAttribute("aria-pressed")) === "true";
  if (on !== pressed) await el.click();
  await page.waitForTimeout(200);
}

async function capture(theme, tag) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  try {
    const { view, bar } = await openCube(page, theme);
    await ensureImage(page, false);
    await bar.getByRole("radio", { name: "Top view" }).click();
    await page.waitForTimeout(600);
    const top = join(OUT, `issue-172-after-2d-top-${theme}-${tag}.png`);
    await view.screenshot({ path: top });
    console.log("wrote", top);

    await ensureImage(page, true);
    await page.waitForTimeout(600);
    const topImage = join(OUT, `issue-172-after-2d-top-image-on-${theme}-${tag}.png`);
    await view.screenshot({ path: topImage });
    console.log("wrote", topImage);

    await bar.getByRole("radio", { name: "Oblique view" }).click();
    await page.waitForFunction(
      () => document.querySelector(".volume-cube__view")?.getAttribute("data-pitch") === "35",
      null,
      { timeout: 30_000 },
    );
    await page.waitForTimeout(600);
    const iso = join(OUT, `issue-172-after-3d-iso-${theme}-${tag}.png`);
    await view.screenshot({ path: iso });
    console.log("wrote", iso);

    await page.evaluate(() => {
      const m = window.__landmarksModel;
      m.set("volume_cut", [0, 256, 0, 256, 31, 33]);
      m.save_changes();
    });
    await page.waitForFunction(
      () => document.querySelector(".volume-cube__view")?.getAttribute("data-refining") === "false",
      null,
      { timeout: 120_000 },
    );
    await page.waitForTimeout(600);
    const cut = join(OUT, `issue-172-after-3d-zcut-iso-${theme}-${tag}.png`);
    await view.screenshot({ path: cut });
    console.log("wrote", cut);
  } finally {
    await browser.close();
  }
}

await capture("light", "inspect");
await capture("dark", "inspect");

const lightTop = join(OUT, "issue-172-after-2d-top-light-inspect.png");
const darkTop = join(OUT, "issue-172-after-2d-top-dark-inspect.png");
const hLight = md5(lightTop);
const hDark = md5(darkTop);
console.log("md5 2d-top light", hLight);
console.log("md5 2d-top dark", hDark);
if (hLight === hDark) {
  console.error("FAIL: light and dark 2d-top screenshots are identical");
  process.exit(1);
}
console.log("done");
