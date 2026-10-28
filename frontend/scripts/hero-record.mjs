/**
 * Full hero loop clip (11s @ 8fps) via canvas screenshots + ffmpeg.
 */
import { chromium } from "@playwright/test";
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const SITE = process.env.E2E_SITE_URL ?? "http://127.0.0.1:8765";
const OUT =
  process.env.HERO_RECORD_OUT ?? "/cursor/stores/self/pr139/hero-recording.mp4";
const LOOP_SEC = 11;
const FPS = 8;
const FRAME_COUNT = LOOP_SEC * FPS;

async function main() {
  const dir = join(tmpdir(), `hero-rec-${Date.now()}`);
  mkdirSync(dir, { recursive: true });

  const browser = await chromium.launch({
    headless: true,
    args: ["--enable-webgl", "--ignore-gpu-blocklist"],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto(`${SITE}/`, { waitUntil: "networkidle" });
  await page.addStyleTag({
    content: `.hero-veil,.hero-copy,.site-header,.hero-media{display:none!important}`,
  });
  await page.waitForFunction(() => window.__milumeHeroHandles?.[0]?.setTime);
  const canvas = page.locator(".milume-hero__canvas");

  for (let i = 0; i < FRAME_COUNT; i++) {
    const t = (i / (FRAME_COUNT - 1)) * LOOP_SEC;
    await page.evaluate((time) => {
      const h = window.__milumeHeroHandles?.[0];
      h?.setTime(time);
      h?.renderOnce();
    }, t);
    await canvas.screenshot({ path: join(dir, `f${String(i).padStart(4, "0")}.png`) });
  }
  await browser.close();

  const ff = spawnSync(
    "ffmpeg",
    [
      "-y",
      "-framerate",
      String(FPS),
      "-i",
      join(dir, "f%04d.png"),
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-crf",
      "26",
      "-movflags",
      "+faststart",
      OUT,
    ],
    { stdio: "inherit" },
  );
  rmSync(dir, { recursive: true, force: true });
  if (ff.status !== 0) process.exit(ff.status ?? 1);
  console.log(OUT);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
