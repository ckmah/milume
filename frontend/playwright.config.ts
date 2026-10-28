import { defineConfig, devices } from "@playwright/test";

const harness = process.env.E2E_HARNESS ?? "landmarks";
const viewportHeight = Number(process.env.E2E_VIEWPORT_H ?? 900);
const webServerCommands: Record<string, string> = {
  landmarks: "npm run dev:landmarks -- --host 127.0.0.1 --port 5173 --strictPort",
  "landmarks-volume":
    "npm run dev:landmarks-volume -- --host 127.0.0.1 --port 5173 --strictPort",
};
// The inspect cube redraws a ray-marched volume (image and labels) per frame; on
// SwiftShader one frame of an orbit or cut drag can take over a second.
const volume = harness === "landmarks-volume";
const volumeSmoke = volume && process.env.E2E_SMOKE === "1";
const smokeSpec = "**/landmarks-volume-smoke.spec.ts";
const webServerCommand =
  webServerCommands[harness] ?? webServerCommands.landmarks;

// Software GL (SwiftShader) costs ~4s per widget mount; local macOS runs use the GPU (E2E_GPU=0 opts out).
// Linux CI stays on SwiftShader because the canonical snapshots are rendered there.
const useGpu = process.platform === "darwin" && !process.env.CI && process.env.E2E_GPU !== "0";
const gpuArgs = useGpu ? ["--use-angle=metal", "--use-gl=angle", "--ignore-gpu-blocklist", "--enable-gpu"] : [];

/** Canonical visual snapshots: Linux Chromium (CI). Screenshot asserts run only with E2E_SCREENSHOTS=1. */
export default defineConfig({
  testDir: "./e2e",
  // The inspect-cube spec needs the toy SpatialData served by its own harness.
  testIgnore:
    harness === "landmarks-volume"
      ? process.env.E2E_SMOKE === "1"
        ? ["**/hero-webgl.spec.ts", "**/hero-video.spec.ts", "**/landmarks-volume.spec.ts", "**/marimo/**"]
        : ["**/hero-webgl.spec.ts", "**/hero-video.spec.ts", smokeSpec, "**/marimo/**"]
      : [
          "**/landmarks-volume.spec.ts",
          "**/landmarks-inspect-minimap.spec.ts",
          smokeSpec,
          "**/hero-webgl.spec.ts",
          "**/hero-video.spec.ts",
          "**/marimo/**",
        ],
  timeout: volume && !volumeSmoke ? 240_000 : 90_000,
  expect: {
    timeout: volume ? 30_000 : 15_000,
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.02,
      animations: "disabled",
    },
  },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: Number(process.env.E2E_RETRIES ?? 1),
  workers: Number(process.env.E2E_WORKERS ?? (process.env.CI ? 2 : 4)),
  reporter: process.env.CI
    ? [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]]
    : [["list"]],
  snapshotPathTemplate:
    "{testDir}/{testFileDir}/{testFileName}-snapshots/{arg}{-projectName}{ext}",
  use: {
    ...devices["Desktop Chrome"],
    channel: (process.env.PLAYWRIGHT_CHANNEL as "chrome" | undefined) || undefined,
    baseURL: "http://127.0.0.1:5173",
    headless: true,
    trace: "on-first-retry",
    // Videos only on CI failure — avoids requiring ffmpeg locally.
    video: process.env.CI ? "retain-on-failure" : "off",
    viewport: { width: 1280, height: viewportHeight },
    deviceScaleFactor: 1,
    launchOptions: { args: [...gpuArgs, "--disable-lcd-text", "--font-render-hinting=none"] },
  },
  projects: [{
    name: "chromium",
    use: {
      ...devices["Desktop Chrome"],
      viewport: { width: 1280, height: viewportHeight },
      deviceScaleFactor: 1,
      channel: (process.env.PLAYWRIGHT_CHANNEL as "chrome" | undefined) || undefined,
    },
  }],
  webServer: {
    command: webServerCommand,
    // Volume harness serves fixture.json only when Vite is fully up; avoids ERR_CONNECTION_REFUSED
    // from agents running `npx playwright` while dev:landmarks-volume is still booting.
    url:
      harness === "landmarks-volume"
        ? "http://127.0.0.1:5173/fixture.json"
        : "http://127.0.0.1:5173",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
