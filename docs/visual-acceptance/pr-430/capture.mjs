/**
 * DPR 2 stills (and, when asked, one cursor clip) of the toy Inspect cube.
 *
 * The page must be `vite preview` of the production harness build. The script
 * refuses a dev server: no `@vite/client`, and `/build-stamp.json` must match
 * CAPTURE_SHA.
 *
 *   CAPTURE_URL=http://127.0.0.1:4173 CAPTURE_SHA=<sha> CAPTURE_LABEL=<label> \
 *   CAPTURE_RESET=1 CAPTURE_CLIP=1 node docs/visual-acceptance/pr-430/capture.mjs
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const here = dirname(fileURLToPath(import.meta.url));
const frontend = join(here, "../../../frontend");
const require = createRequire(join(frontend, "package.json"));
const { chromium } = require("@playwright/test");

const base = process.env.CAPTURE_URL ?? "http://127.0.0.1:4173";
const sha = process.env.CAPTURE_SHA ?? "unknown";
const label = process.env.CAPTURE_LABEL ?? "shot";
const short = sha.slice(0, 7);
const doReset = process.env.CAPTURE_RESET === "1";
const doClip = process.env.CAPTURE_CLIP === "1";
const font = "/usr/share/fonts/truetype/macos/Inter-Bold.ttf";

async function installCursor(page) {
  await page.evaluate(() => {
    let el = document.getElementById("__evidence-cursor");
    if (!el) {
      el = document.createElement("div");
      el.id = "__evidence-cursor";
      el.setAttribute("aria-hidden", "true");
      const dot = document.createElement("div");
      dot.style.cssText =
        "position:absolute;left:-11px;top:-11px;width:22px;height:22px;border-radius:50%;border:2px solid #fff;box-shadow:0 0 0 1px #000,0 2px 8px rgb(0 0 0 / 45%);background:rgb(255 255 255 / 25%);";
      const tail = document.createElement("div");
      tail.style.cssText =
        "position:absolute;left:-2px;top:8px;width:4px;height:16px;border-radius:2px;background:#fff;box-shadow:0 0 0 1px #000;transform:rotate(-35deg);transform-origin:top center;";
      el.append(dot, tail);
      document.documentElement.append(el);
    }
    if (el.dataset.bound === "1") return;
    el.dataset.bound = "1";
    const move = (event) => {
      const node = document.getElementById("__evidence-cursor");
      if (!node) return;
      const lm = document.querySelector(".landmarks");
      if (lm instanceof HTMLElement && node.parentElement === lm) {
        const r = lm.getBoundingClientRect();
        node.style.left = `${event.clientX - r.left}px`;
        node.style.top = `${event.clientY - r.top}px`;
      } else {
        node.style.left = `${event.clientX}px`;
        node.style.top = `${event.clientY}px`;
      }
    };
    document.addEventListener("mousemove", move, true);
    document.addEventListener("pointermove", move, true);
  });
}

function annotate(png, text) {
  const txt = `${png}.label.txt`;
  writeFileSync(txt, text);
  const out = png;
  const tmp = `${png}.plain.png`;
  spawnSync("mv", [png, tmp], { stdio: "inherit" });
  const painted = spawnSync(
    "ffmpeg",
    [
      "-y",
      "-i",
      tmp,
      "-update",
      "1",
      "-vf",
      `pad=iw:ih+100:0:100:0x111113,drawtext=fontfile=${font}:textfile=${txt}:fontsize=42:fontcolor=white:x=28:y=28`,
      out,
    ],
    { stdio: "inherit" },
  );
  if (painted.status !== 0) throw new Error(`annotate failed for ${png}`);
  unlinkSync(tmp);
  unlinkSync(txt);
}

function cubePixelCounts(png) {
  const dumped = spawnSync(
    "ffmpeg",
    ["-v", "error", "-i", png, "-vf", "scale=160:120", "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1"],
    { maxBuffer: 12_000_000 },
  );
  if (dumped.status !== 0) return { error: "ffmpeg rawvideo failed" };
  const buf = dumped.stdout;
  let orange = 0;
  let blue = 0;
  const samples = Math.floor(buf.length / 3);
  for (let i = 0; i < buf.length; i += 3) {
    const r = buf[i];
    const g = buf[i + 1];
    const b = buf[i + 2];
    if (r > 140 && g > 60 && g < 180 && b < 100 && r > b + 50) orange += 1;
    if (b > 90 && r < 130 && g < 170 && b > r + 15) blue += 1;
  }
  return { orange, blue, samples };
}

async function assertProduction(page) {
  const stamp = await page.evaluate(async (origin) => {
    const res = await fetch(`${origin}/build-stamp.json`, { cache: "no-store" });
    if (!res.ok) throw new Error(`build-stamp HTTP ${res.status}`);
    return res.json();
  }, base);
  if (stamp.gitSha !== sha) {
    throw new Error(`build-stamp sha ${stamp.gitSha} != ${sha}`);
  }
  if (stamp.mode !== "production" || stamp.command !== "vite build") {
    throw new Error(`build-stamp is not a production vite build: ${JSON.stringify(stamp)}`);
  }
  const probe = await page.evaluate(() => {
    const urls = performance.getEntriesByType("resource").map((e) => e.name);
    return {
      dpr: window.devicePixelRatio,
      urls,
      viteClient: urls.some((u) => u.includes("@vite/client") || u.includes("/@vite/")),
      devModule: urls.some((u) => u.includes("/main.tsx") || u.includes("/src/")),
      assets: urls.filter((u) => u.includes("/assets/")),
    };
  });
  if (probe.dpr !== 2) throw new Error(`devicePixelRatio ${probe.dpr}, expected 2`);
  if (probe.viteClient || probe.devModule) {
    throw new Error(`page loaded the Vite dev server: ${JSON.stringify(probe.urls)}`);
  }
  if (probe.assets.length === 0) throw new Error("page loaded no /assets/ from the production build");
  return { stamp, assets: probe.assets };
}

async function themedContext(browser, theme, extra = {}) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: 2,
    colorScheme: theme,
    ...extra,
  });
  await context.addInitScript((stored) => {
    localStorage.setItem("milume-harness-theme", stored);
  }, theme);
  return context;
}

async function applyTheme(page, theme) {
  const dark = theme === "dark";
  // The volume harness shell is hardcoded `dark` (dev/landmarks-volume/main.tsx) and has no
  // theme button. Light chrome is the same shell with that class removed so the widget's
  // landmarks--light tokens apply.
  await page.evaluate((isDark) => {
    const root = document.documentElement;
    root.classList.remove("light", "dark", "dark-theme", "light-theme");
    root.classList.add(isDark ? "dark" : "light", isDark ? "dark-theme" : "light-theme");
    root.setAttribute("data-theme", isDark ? "dark" : "light");
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
      return isDark ? widget.classList.contains("landmarks--dark") : widget.classList.contains("landmarks--light");
    },
    dark,
    { timeout: 10_000 },
  );
  const chrome = await page.evaluate(() => {
    const body = document.querySelector(".landmarks__body");
    if (!(body instanceof HTMLElement)) return null;
    const parsed = getComputedStyle(body).backgroundColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (!parsed) return null;
    const rgb = [Number(parsed[1]), Number(parsed[2]), Number(parsed[3])];
    return { rgb, luminance: (rgb[0] + rgb[1] + rgb[2]) / 3 };
  });
  if (!chrome) throw new Error(`no landmarks body background for ${theme}`);
  if (dark && chrome.luminance > 80) {
    throw new Error(`dark chrome is bright (${JSON.stringify(chrome)})`);
  }
  if (!dark && chrome.luminance < 140) {
    throw new Error(`light chrome is dark (${JSON.stringify(chrome)})`);
  }
  return chrome;
}

async function pointAt(page, locator, fx = 0.5, fy = 0.5) {
  const box = await locator.boundingBox();
  if (!box) throw new Error("missing box");
  const x = box.x + box.width * fx;
  const y = box.y + box.height * fy;
  await page.mouse.move(x, y);
  await page.evaluate(({ x: px, y: py }) => {
    const lm = document.querySelector(".landmarks");
    if (!(lm instanceof HTMLElement)) throw new Error("landmarks missing");
    const el = document.getElementById("__evidence-cursor");
    if (!el) throw new Error("cursor overlay missing");
    if (el.parentElement !== lm) lm.appendChild(el);
    const r = lm.getBoundingClientRect();
    el.style.cssText =
      "position:absolute;width:0;height:0;z-index:2147483647;pointer-events:none;display:block;";
    el.style.left = `${px - r.left}px`;
    el.style.top = `${py - r.top}px`;
  }, { x, y });
  return { x, y };
}

async function waitCubeSettled(page) {
  const settled = () =>
    page.waitForFunction(
      () => {
        const el = document.querySelector('[role="dialog"][aria-label="Cube"] .volume-cube__view');
        const text = document.body?.innerText ?? "";
        return (
          el?.getAttribute("data-refining") === "false" &&
          el.getAttribute("data-label-cells") === "2" &&
          !text.includes("Refining") &&
          !text.includes("Loading")
        );
      },
      null,
      { timeout: 120_000 },
    );
  await settled();
  await page.waitForTimeout(700);
  await settled();
}

async function openToyCube(page, theme) {
  await page.goto(`${base}/?window=100&noDialkit=1`, { waitUntil: "networkidle" });
  const production = await assertProduction(page);
  await page.waitForFunction(() => Boolean(window.__landmarksEngine?.getViewState?.()), null, { timeout: 120_000 });
  await page.evaluate(() => {
    const model = window.__landmarksModel;
    model.set("render_mode", "raster");
    model.set("inspect_cx", 130.5);
    model.set("inspect_cy", 170.5);
    model.set("inspect_open", true);
    model.save_changes();
  });
  const view = page.getByRole("dialog", { name: "Cube" }).locator(".volume-cube__view");
  await view.waitFor({ state: "visible", timeout: 60_000 });
  await waitCubeSettled(page);
  const chrome = await applyTheme(page, theme);
  await installCursor(page);
  const state = await page.evaluate(() => {
    const el = document.querySelector('[role="dialog"][aria-label="Cube"] .volume-cube__view');
    return {
      labelCells: el?.getAttribute("data-label-cells") ?? null,
      imageMode: el?.getAttribute("data-image-mode") ?? null,
      points: document.querySelectorAll('[data-testid="layer-toggle-points"]').length,
    };
  });
  return { view, production, state: { ...state, chrome } };
}

async function shoot(page, theme, file, caption) {
  const opened = await openToyCube(page, theme);
  if (process.env.CAPTURE_POINTER === "toolbar") {
    await pointAt(page, page.getByTestId("layer-toggle-image"));
  } else {
    await pointAt(page, opened.view, 0.72, 0.38);
  }
  const cubePng = join("/tmp/milume-pr430", `${label}-${theme}-cube.png`);
  mkdirSync(dirname(cubePng), { recursive: true });
  await opened.view.screenshot({ path: cubePng });
  const counts = cubePixelCounts(cubePng);
  const widgetPng = join(here, file);
  await page.locator(".landmarks").first().screenshot({ path: widgetPng });
  annotate(widgetPng, caption);
  return { ...opened, counts, file: widgetPng };
}

async function shootReset(page, theme, file, caption) {
  const opened = await openToyCube(page, theme);
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
  const mode = await opened.view.getAttribute("data-image-mode");
  if (checked !== "true" || mode !== "additive") {
    throw new Error(`Reset left aria-checked=${checked} data-image-mode=${mode}`);
  }
  await pointAt(page, additive);
  const widgetPng = join(here, file);
  await page.locator(".landmarks").first().screenshot({ path: widgetPng });
  annotate(widgetPng, caption);
  return { checked, mode, file: widgetPng, state: opened.state };
}

async function recordClip(browser) {
  const videoDir = join("/tmp/milume-pr430", `${label}-video`);
  mkdirSync(videoDir, { recursive: true });
  const context = await themedContext(browser, "dark", {
    recordVideo: { dir: videoDir, size: { width: 1280, height: 900 } },
  });
  const page = await context.newPage();
  const navStart = Date.now();
  const opened = await openToyCube(page, "dark");
  const ready = Date.now();
  const view = opened.view;
  const box = await view.boundingBox();
  if (!box) throw new Error("cube box missing for clip");
  // A button-down orbit on SwiftShader refines for longer than the 15s clip.
  // The pointer crosses the painted meshes, Iso changes the camera, then Image Reset runs.
  await pointAt(page, view, 0.4, 0.62);
  await page.waitForTimeout(200);
  await pointAt(page, view, 0.72, 0.38);
  await page.waitForTimeout(250);
  const iso = page.getByRole("radio", { name: "Oblique view" });
  await pointAt(page, iso);
  await iso.click({ timeout: 5_000 });
  await waitCubeSettled(page);
  if ((await iso.getAttribute("aria-checked")) !== "true") throw new Error("Iso did not stay selected");
  const image = page.getByTestId("layer-toggle-image");
  await pointAt(page, image);
  await page.waitForTimeout(300);
  await image.click({ button: "right" });
  const panel = page.getByTestId("adjust-image");
  await panel.waitFor({ state: "visible" });
  const mip = panel.getByRole("radio", { name: "MIP" });
  await pointAt(page, mip);
  await page.waitForTimeout(250);
  await mip.click();
  await page.waitForTimeout(400);
  const reset = panel.getByRole("button", { name: "Reset image" });
  await pointAt(page, reset);
  await page.waitForTimeout(250);
  await reset.click();
  const additive = panel.getByRole("radio", { name: "Additive" });
  await additive.waitFor();
  const checked = await additive.getAttribute("aria-checked");
  const mode = await view.getAttribute("data-image-mode");
  if (checked !== "true" || mode !== "additive") {
    throw new Error(`clip Reset left aria-checked=${checked} data-image-mode=${mode}`);
  }
  await pointAt(page, additive);
  await page.screenshot({ path: join(videoDir, "panel-flush.png") });
  await page.waitForTimeout(2500);
  const end = Date.now();
  const duration = (end - ready) / 1000;
  const raw = await page.video().path();
  await context.close();
  const rawProbed = spawnSync(
    "ffprobe",
    ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", raw],
    { encoding: "utf8" },
  );
  const rawSeconds = Number(rawProbed.stdout.trim());
  // The webm clock includes the load before the cube is painted. Keep the tail,
  // which is the pointer, Iso, and Reset, and stay inside 15s.
  const clipSeconds = Math.min(10.8, Number.isFinite(rawSeconds) ? rawSeconds : duration);
  const offset = Math.max(0, (Number.isFinite(rawSeconds) ? rawSeconds : duration) - clipSeconds);
  const clip = join(here, "inspect-reset-clip.mp4");
  const labelFile = join(videoDir, "clip-label.txt");
  writeFileSync(labelFile, `PR ${short} production Vite preview · dark · pointer on meshes, Iso, Image Reset to Additive`);
  const encoded = spawnSync(
    "ffmpeg",
    [
      "-y",
      "-i",
      raw,
      "-ss",
      offset.toFixed(3),
      "-vf",
      `pad=iw:ih+40:0:40:0x111113,drawtext=fontfile=${font}:textfile=${labelFile}:fontsize=18:fontcolor=white:x=12:y=10`,
      "-t",
      clipSeconds.toFixed(3),
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-an",
      "-movflags",
      "+faststart",
      clip,
    ],
    { stdio: "inherit" },
  );
  if (encoded.status !== 0) throw new Error("clip encode failed");
  const probed = spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", clip], {
    encoding: "utf8",
  });
  const seconds = Number(probed.stdout.trim());
  if (!Number.isFinite(seconds) || seconds > 15) {
    throw new Error(`clip duration ${probed.stdout.trim()} is not <= 15s`);
  }
  return { file: clip, seconds, interactionSeconds: duration, checked, mode };
}

const browser = await chromium.launch({
  headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});

const shots = [];
const doStills = process.env.CAPTURE_STILLS !== "0";
if (doStills) for (const theme of ["dark", "light"]) {
  const context = await themedContext(browser, theme);
  const page = await context.newPage();
  const caption = `${label} ${short} · ${theme} · DPR 2 · production vite preview`;
  const shot = await shoot(page, theme, `${label}-${theme}-dpr2.png`, caption);
  shots.push({ theme, kind: "labels", ...shot.state, counts: shot.counts, file: shot.file, stamp: shot.production.stamp, assets: shot.production.assets });
  await context.close();
}

const resets = [];
if (doReset) {
  for (const theme of ["dark", "light"]) {
    const context = await themedContext(browser, theme);
    const page = await context.newPage();
    const caption = `${label} ${short} · ${theme} · DPR 2 · Image Reset → Additive`;
    const shot = await shootReset(page, theme, `${label}-reset-${theme}-dpr2.png`, caption);
    resets.push({ theme, ...shot });
    await context.close();
  }
}

let clip = null;
if (doClip) clip = await recordClip(browser);
await browser.close();

const provenance = {
  label,
  gitSha: sha,
  url: base,
  capturedAt: new Date().toISOString(),
  dpr: 2,
  viewport: { width: 1280, height: 900 },
  server: "vite preview of vite build (production harness, not the dev server)",
  shots,
  resets,
  clip,
};
writeFileSync(join(here, `provenance-${label}.json`), JSON.stringify(provenance, null, 2));
console.log(JSON.stringify({ label, sha, shots: shots.map((s) => s.file), resets: resets.map((r) => r.file), clip }, null, 2));
