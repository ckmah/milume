import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

export const DATASET_ID = "demos/data:ileum";
/** Wide enough for the widget; height matches dev harness shell (~820px at this width). */
export const VIEWPORT = { width: 960, height: 900 };
export const CAPTURE_FPS = 30;

export function milumeSidecarSha(repoRoot) {
  const r = spawnSync("git", ["-C", repoRoot, "rev-parse", "--short", "HEAD"], {
    encoding: "utf8",
  });
  return (r.stdout || "local").trim();
}

export function writeSidecar(path, body) {
  writeFileSync(path, `${JSON.stringify(body, null, 1)}\n`);
}

export function md5File(path) {
  return createHash("md5").update(readFileSync(path)).digest("hex");
}

export function ffmpeg(args) {
  const r = spawnSync("ffmpeg", args, { stdio: "inherit" });
  if (r.status !== 0) throw new Error(`ffmpeg failed: ${args.join(" ")}`);
}

export function probeVideoMeta(mp4Path) {
  const r = spawnSync(
    "ffprobe",
    [
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-count_frames",
      "-show_entries",
      "stream=nb_read_frames,r_frame_rate,duration",
      "-of",
      "json",
      mp4Path,
    ],
    { encoding: "utf8" },
  );
  if (r.status !== 0) return { frames: 0, seconds: 0 };
  const data = JSON.parse(r.stdout);
  const stream = data.streams?.[0] ?? {};
  const frames = Number(stream.nb_read_frames || 0);
  const seconds = Number(stream.duration || 0);
  return { frames, seconds: Math.round(seconds * 10) / 10 };
}

export function encodeFramesToMp4(frameDir, outMp4, { fps = CAPTURE_FPS, crf = 36 } = {}) {
  const pattern = join(frameDir, "f%05d.png");
  ffmpeg([
    "-y",
    "-framerate",
    String(fps),
    "-i",
    pattern,
    "-vf",
    "scale=1920:1200:flags=lanczos",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-crf",
    String(crf),
    "-movflags",
    "+faststart",
    outMp4,
  ]);
}

export function transcodeThemeVideoFromMp4(mp4, outBase, theme, { crf = 36 } = {}) {
  const webm = `${outBase}.${theme}.webm`;
  const poster = `${outBase}.${theme}.poster.webp`;
  ffmpeg(["-y", "-i", mp4, "-an", "-c:v", "libvpx-vp9", "-crf", "24", "-b:v", "0", webm]);
  const meta = probeVideoMeta(mp4);
  const posterAt =
    meta.seconds <= 0.55
      ? Math.max(0.05, meta.seconds * 0.5)
      : Math.min(meta.seconds * 0.45, meta.seconds - 0.08);
  ffmpeg([
    "-y",
    "-ss",
    String(posterAt),
    "-i",
    mp4,
    "-frames:v",
    "1",
    "-q:v",
    "80",
    poster,
  ]);
  return { mp4, webm, poster };
}

/** @deprecated raw webm path; prefer landmarks frame capture + encodeFramesToMp4 */
export function transcodeThemeVideo(rawWebm, outBase, theme, { fps = 30, crf = 36 } = {}) {
  const mp4 = `${outBase}.${theme}.mp4`;
  ffmpeg([
    "-y",
    "-i",
    rawWebm,
    "-an",
    "-vf",
    `fps=${fps},scale=1920:1200:flags=lanczos`,
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-crf",
    String(crf),
    "-movflags",
    "+faststart",
    mp4,
  ]);
  return transcodeThemeVideoFromMp4(mp4, outBase, theme, { crf });
}

/** Docs captures: hide dev banner; cursor ring lives inside `.landmarks` for element screenshots. */
export async function installDocsCaptureChrome(page, theme) {
  await page.addInitScript((t) => {
    localStorage.setItem("milume-harness-theme", t);
  }, theme);
  await page.addInitScript(() => {
    const style = document.createElement("style");
    style.id = "docs-tool-capture-chrome";
    style.textContent = `
      .harness-toolbar { display: none !important; }
      .harness-cell-output { padding: 0 !important; }
      .harness-shell { min-height: 0 !important; }
      #docs-capture-cursor {
        position: absolute; width: 14px; height: 14px; margin: -2px 0 0 -2px;
        border: 2px solid rgba(255,255,255,0.95); border-radius: 50%;
        box-shadow: 0 0 0 1px rgba(0,0,0,0.55);
        pointer-events: none; z-index: 99999; display: none;
      }
    `;
    document.documentElement.appendChild(style);

    const attachCursor = () => {
      const lm = document.querySelector(".landmarks");
      if (!lm || document.getElementById("docs-capture-cursor")) return;
      const dot = document.createElement("div");
      dot.id = "docs-capture-cursor";
      lm.appendChild(dot);
    };

    attachCursor();
    new MutationObserver(attachCursor).observe(document.documentElement, {
      childList: true,
      subtree: true,
    });

    document.addEventListener(
      "mousemove",
      (e) => {
        const lm = document.querySelector(".landmarks");
        const el = document.getElementById("docs-capture-cursor");
        if (!lm || !el) return;
        const r = lm.getBoundingClientRect();
        el.style.display = "block";
        el.style.left = `${e.clientX - r.left}px`;
        el.style.top = `${e.clientY - r.top}px`;
      },
      true,
    );
  });
}

export async function waitForLandmarks(page) {
  await page.locator(".landmarks").first().waitFor({ state: "visible" });
  await page.locator("canvas.landmarks__webgl").first().waitFor({ state: "visible" });
  await page.waitForFunction(() => {
    const eng = window.__landmarksEngine;
    const vs = eng?.getViewState?.();
    return Boolean(vs && Number.isFinite(vs.zoom));
  });
  await page.waitForFunction(
    () => window.__landmarksEngine?.getPerfSnapshot?.().spatialIndexBuilt,
    null,
    { timeout: 120_000 },
  );
  await page.waitForTimeout(350);
}

export async function gotoDocsFixture(page, baseUrl, fixturePath) {
  const q = encodeURIComponent(fixturePath);
  await page.goto(`${baseUrl}/?fixture=${q}`, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await waitForLandmarks(page);
}

/** Reset view and pan to the densest spatial bin so zoom gestures land on tissue. */
export async function fitDenseTissueView(page) {
  await page.evaluate(() => {
    const eng = window.__landmarksEngine;
    eng.resetZoom();
    const pts = eng.getPoints();
    if (!pts.length) return;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const [x, y] of pts) {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
    const cols = 24;
    const rows = 24;
    const dx = (maxX - minX) / cols || 1;
    const dy = (maxY - minY) / rows || 1;
    const bins = new Int32Array(cols * rows);
    for (const [x, y] of pts) {
      const ix = Math.min(cols - 1, Math.max(0, Math.floor((x - minX) / dx)));
      const iy = Math.min(rows - 1, Math.max(0, Math.floor((y - minY) / dy)));
      bins[iy * cols + ix] += 1;
    }
    let best = 0;
    let bestI = 0;
    for (let i = 0; i < bins.length; i++) {
      if (bins[i] > best) {
        best = bins[i];
        bestI = i;
      }
    }
    const bx = minX + (bestI % cols + 0.5) * dx;
    const by = minY + (Math.floor(bestI / cols) + 0.5) * dy;
    eng.panTo(bx, by, { animate: false });
  });
  await page.waitForTimeout(450);
}

export async function worldToCanvasPixel(page, x, y) {
  return page.evaluate(
    ({ wx, wy }) => {
      const eng = window.__landmarksEngine;
      const vs = eng.getViewState();
      const canvas = document.querySelector("canvas.landmarks__webgl");
      if (!vs?.target || !canvas || vs.zoom == null) return null;
      const [tx, ty] = vs.target;
      const scale = 2 ** vs.zoom;
      const rect = canvas.getBoundingClientRect();
      const cx = rect.left + rect.width / 2 + (wx - tx) * scale;
      const cy = rect.top + rect.height / 2 - (wy - ty) * scale;
      return { x: cx, y: cy };
    },
    { wx: x, wy: y },
  );
}

export async function screenshotLandmarks(page, path) {
  await page.locator(".landmarks").first().screenshot({ path });
}

/** Snap `.landmarks` on an interval while `wait(ms)` runs (Playwright serializes one page). */
export function createLandmarksFrameRecorder(page, frameDir, { fps = CAPTURE_FPS } = {}) {
  mkdirSync(frameDir, { recursive: true });
  let frame = 0;
  const intervalMs = Math.max(1, Math.round(1000 / fps));
  const snap = async () => {
    const path = join(frameDir, `f${String(frame++).padStart(5, "0")}.png`);
    await screenshotLandmarks(page, path);
  };
  const wait = async (ms) => {
    if (ms <= 0) return;
    const end = Date.now() + ms;
    while (Date.now() < end) {
      await snap();
      const left = end - Date.now();
      if (left <= 0) break;
      await page.waitForTimeout(Math.min(intervalMs, left));
    }
  };
  const padToMinSeconds = async (minSeconds) => {
    const minFrames = Math.ceil(minSeconds * fps);
    while (frame < minFrames) {
      await snap();
      await page.waitForTimeout(intervalMs);
    }
  };
  return { snap, wait, padToMinSeconds, get frameCount() { return frame; } };
}

/**
 * Record a loop: `run(page, rec)` should use `rec.wait` instead of `page.waitForTimeout`
 * and call `rec.snap()` before gestures so the cursor ring is visible.
 */
export async function recordLandmarksLoop(page, frameDir, run, { minSeconds = 4.5 } = {}) {
  const rec = createLandmarksFrameRecorder(page, frameDir);
  await rec.snap();
  await run(page, rec);
  await rec.wait(500);
  await rec.padToMinSeconds(minSeconds);
  return rec.frameCount;
}

export function countFramePngs(frameDir) {
  return readdirSync(frameDir).filter((n) => /^f\d+\.png$/.test(n)).length;
}
