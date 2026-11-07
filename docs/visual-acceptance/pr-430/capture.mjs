/**
 * Stills for PR 430 / issue 429.
 *
 * Toy Inspect cube on the landmarks-volume harness (not a leftover Vite server).
 * Start a fresh server, then run this file from anywhere:
 *
 *   cd frontend && npm run build
 *   npx cross-env DEV_WIDGET=landmarks-volume npx vite --host 127.0.0.1 --port 5173 --strictPort
 *   node ../docs/visual-acceptance/pr-430/capture.mjs
 *
 * Writes category-meshes-dark.png, category-meshes-light.png, and image-reset.png
 * next to this file. The pointer overlay is drawn whenever the script moves the mouse.
 */
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const frontend = join(here, "../../../frontend");
const require = createRequire(join(frontend, "package.json"));
const { chromium } = require("@playwright/test");

const base = process.env.CAPTURE_URL ?? "http://127.0.0.1:5173";

const CURSOR_INIT = () => {
  if (document.getElementById("__evidence-cursor")) return;
  const el = document.createElement("div");
  el.id = "__evidence-cursor";
  el.setAttribute("aria-hidden", "true");
  el.style.cssText =
    "position:fixed;left:0;top:0;width:0;height:0;z-index:2147483647;pointer-events:none;";
  const dot = document.createElement("div");
  dot.style.cssText =
    "position:absolute;left:-10px;top:-10px;width:20px;height:20px;border-radius:50%;border:2px solid #fff;box-shadow:0 0 0 1px #000,0 2px 8px rgb(0 0 0 / 45%);background:rgb(255 255 255 / 15%);";
  const tail = document.createElement("div");
  tail.style.cssText =
    "position:absolute;left:-2px;top:8px;width:4px;height:14px;border-radius:2px;background:#fff;box-shadow:0 0 0 1px #000;transform:rotate(-35deg);transform-origin:top center;";
  el.append(dot, tail);
  document.documentElement.append(el);
  const move = (x, y) => {
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
  };
  document.addEventListener("mousemove", (e) => move(e.clientX, e.clientY), true);
  document.addEventListener("pointermove", (e) => move(e.clientX, e.clientY), true);
};

async function pointAt(page, locator) {
  const box = await locator.boundingBox();
  if (!box) throw new Error("missing box");
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.evaluate(({ x, y }) => {
    const lm = document.querySelector(".landmarks");
    if (!(lm instanceof HTMLElement)) throw new Error("landmarks missing");
    let el = document.getElementById("__evidence-cursor");
    if (!el) {
      el = document.createElement("div");
      el.id = "__evidence-cursor";
      el.setAttribute("aria-hidden", "true");
      const dot = document.createElement("div");
      dot.style.cssText =
        "position:absolute;left:-11px;top:-11px;width:22px;height:22px;border-radius:50%;border:2px solid #fff;box-shadow:0 0 0 1px #000;background:rgb(255 255 255 / 20%);";
      const tail = document.createElement("div");
      tail.style.cssText =
        "position:absolute;left:-2px;top:8px;width:4px;height:16px;border-radius:2px;background:#fff;box-shadow:0 0 0 1px #000;transform:rotate(-35deg);transform-origin:top center;";
      el.append(dot, tail);
    }
    if (el.parentElement !== lm) lm.appendChild(el);
    const r = lm.getBoundingClientRect();
    el.style.cssText =
      "position:absolute;width:0;height:0;z-index:2147483647;pointer-events:none;display:block;";
    el.style.left = `${x - r.left}px`;
    el.style.top = `${y - r.top}px`;
  }, { x, y });
  return { x, y };
}

async function applyTheme(page, theme) {
  const dark = theme === "dark";
  await page.evaluate((isDark) => {
    const root = document.documentElement;
    root.classList.remove("light", "dark", "dark-theme", "light-theme");
    root.classList.add(isDark ? "dark" : "light", isDark ? "dark-theme" : "light-theme");
    const shell = document.querySelector(".min-h-screen");
    if (shell instanceof HTMLElement) {
      shell.classList.toggle("dark", isDark);
      shell.classList.toggle("bg-neutral-950", isDark);
      shell.classList.toggle("text-neutral-100", isDark);
      shell.classList.toggle("bg-white", !isDark);
      shell.classList.toggle("text-neutral-950", !isDark);
    }
  }, dark);
  await page.waitForFunction(
    (isDark) => {
      const widget = document.querySelector(".landmarks");
      if (!widget) return false;
      return isDark
        ? widget.classList.contains("landmarks--dark")
        : widget.classList.contains("landmarks--light");
    },
    dark,
    { timeout: 10_000 },
  );
}

async function openToyCube(page, theme) {
  await page.goto(`${base}/?window=100&noDialkit=1`, { waitUntil: "networkidle" });
  await page.waitForFunction(() => Boolean(window.__landmarksEngine?.getViewState?.()));
  await page.evaluate(() => {
    const model = window.__landmarksModel;
    model.set("render_mode", "raster");
    model.set("inspect_cx", 130.5);
    model.set("inspect_cy", 170.5);
    model.set("inspect_open", true);
    model.save_changes();
  });
  const view = page.getByRole("dialog", { name: "Cube" }).locator(".volume-cube__view");
  await view.waitFor({ state: "visible" });
  await page.waitForFunction(
    () => {
      const el = document.querySelector('[role="dialog"][aria-label="Cube"] .volume-cube__view');
      return el?.getAttribute("data-refining") === "false" && el.getAttribute("data-label-cells") === "2";
    },
    null,
    { timeout: 90_000 },
  );
  await applyTheme(page, theme);
  const points = await page.getByTestId("layer-toggle-points").count();
  if (points !== 0) throw new Error(`Points control is present (${points})`);
  return view;
}

async function shootCategory(page, theme, file) {
  const view = await openToyCube(page, theme);
  await pointAt(page, view);
  await page.locator(".landmarks").first().screenshot({ path: join(here, file) });
}

async function shootReset(page, theme) {
  const view = await openToyCube(page, theme);
  const image = page.getByTestId("layer-toggle-image");
  await pointAt(page, image);
  await image.click({ button: "right" });
  const panel = page.getByTestId("adjust-image");
  await panel.waitFor({ state: "visible" });
  const mip = panel.getByRole("radio", { name: "MIP" });
  await pointAt(page, mip);
  await mip.click();
  const reset = panel.getByRole("button", { name: "Reset image" });
  await pointAt(page, reset);
  await reset.click();
  const additive = panel.getByRole("radio", { name: "Additive" });
  await additive.waitFor();
  const checked = await additive.getAttribute("aria-checked");
  if (checked !== "true") throw new Error(`Reset left Image projection ${checked}`);
  const mode = await view.getAttribute("data-image-mode");
  if (mode !== "additive") throw new Error(`Reset left data-image-mode ${mode}`);
  await pointAt(page, reset);
  await page.locator(".landmarks").first().screenshot({ path: join(here, "image-reset.png") });
}

const browser = await chromium.launch({
  headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});

for (const theme of ["dark", "light"]) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: 1,
  });
  await context.addInitScript(CURSOR_INIT);
  const page = await context.newPage();
  await shootCategory(page, theme, `category-meshes-${theme}.png`);
  await context.close();
}

const context = await browser.newContext({
  viewport: { width: 1280, height: 900 },
  deviceScaleFactor: 1,
});
await context.addInitScript(CURSOR_INIT);
const page = await context.newPage();
await shootReset(page, "dark");
await context.close();
await browser.close();
