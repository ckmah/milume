/**
 * Short hero loop clip via readPixels frames + ffmpeg (for PR evidence).
 */
import { chromium } from "@playwright/test";
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const SITE = process.env.E2E_SITE_URL ?? "http://127.0.0.1:8765";
const OUT = process.env.HERO_RECORD_OUT ?? "/opt/cursor/artifacts/hero-designer-review.webm";
const TIMES = [0, 0.6, 1.5, 3, 4.5, 6, 7.5, 9, 10.5];
const HOLD_FRAMES = 4;

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
    content: `.hero-veil,.hero-copy,.site-header,.promo-montage{display:none!important}`,
  });
  await page.waitForFunction(() => window.__milumeHeroHandles?.[0]?.setTime);

  let frameIdx = 0;
  for (const t of TIMES) {
    await page.evaluate((time) => {
      const h = window.__milumeHeroHandles?.[0];
      h?.setTime(time);
      h?.renderOnce();
    }, t);
    const { w, h, px } = await page.evaluate(() => {
      const c = document.querySelector(".milume-hero__canvas");
      const gl = c.getContext("webgl2");
      const width = c.width;
      const height = c.height;
      const buf = new Uint8Array(width * height * 4);
      gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, buf);
      return { w: width, h: height, px: Array.from(buf) };
    });
    const rgb = Buffer.alloc(w * h * 3);
    for (let y = 0; y < h; y++) {
      const srcRow = (h - 1 - y) * w * 4;
      for (let x = 0; x < w; x++) {
        const si = srcRow + x * 4;
        const di = (y * w + x) * 3;
        rgb[di] = px[si];
        rgb[di + 1] = px[si + 1];
        rgb[di + 2] = px[si + 2];
      }
    }
    for (let r = 0; r < HOLD_FRAMES; r++) {
      const frame = join(dir, `f${String(frameIdx).padStart(4, "0")}.png`);
      const py = spawnSync(
        "python3",
        [
          "-c",
          "import sys; from PIL import Image; w,h=int(sys.argv[1]),int(sys.argv[2]); out=sys.argv[3]; raw=sys.stdin.buffer.read(); Image.frombytes('RGB',(w,h),raw).save(out)",
          String(w),
          String(h),
          frame,
        ],
        { input: rgb },
      );
      if (py.status !== 0) throw new Error(py.stderr?.toString() || "frame encode failed");
      frameIdx++;
    }
  }
  await browser.close();

  const ff = spawnSync(
    "ffmpeg",
    ["-y", "-framerate", "8", "-i", join(dir, "f%04d.png"), "-c:v", "libvpx-vp9", "-b:v", "900k", "-pix_fmt", "yuv420p", OUT],
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
