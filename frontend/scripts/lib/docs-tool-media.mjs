import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

export const DATASET_ID = "demos/data:ileum";
export const VIEWPORT = { width: 960, height: 720 };
export const WIDGET_HEIGHT = 600;

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

export function transcodeThemeVideo(rawWebm, outBase, theme, { fps = 30, crf = 36 } = {}) {
  const mp4 = `${outBase}.${theme}.mp4`;
  const webm = `${outBase}.${theme}.webm`;
  const poster = `${outBase}.${theme}.poster.webp`;
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
  ffmpeg(["-y", "-i", mp4, "-an", "-c:v", "libvpx-vp9", "-crf", "24", "-b:v", "0", webm]);
  const meta = probeVideoMeta(mp4);
  const posterAt = Math.max(0.5, meta.seconds * 0.45);
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

/** Docs captures: hide dev banner, fixed widget height, optional cursor ring. */
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
      .landmarks { height: ${WIDGET_HEIGHT}px !important; max-height: ${WIDGET_HEIGHT}px !important; }
      #docs-capture-cursor {
        position: fixed; width: 14px; height: 14px; margin: -2px 0 0 -2px;
        border: 2px solid rgba(255,255,255,0.95); border-radius: 50%;
        box-shadow: 0 0 0 1px rgba(0,0,0,0.55);
        pointer-events: none; z-index: 99999; display: none;
      }
    `;
    document.documentElement.appendChild(style);
    const dot = document.createElement("div");
    dot.id = "docs-capture-cursor";
    document.documentElement.appendChild(dot);
    document.addEventListener(
      "mousemove",
      (e) => {
        const el = document.getElementById("docs-capture-cursor");
        if (!el) return;
        el.style.display = "block";
        el.style.left = `${e.clientX}px`;
        el.style.top = `${e.clientY}px`;
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

export async function screenshotLandmarks(page, path) {
  await page.locator(".landmarks").first().screenshot({ path });
}
