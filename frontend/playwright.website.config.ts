import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/hero-webgl.spec.ts",
  timeout: 60_000,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [["list"]],
  use: {
    ...devices["Desktop Chrome"],
    baseURL: process.env.E2E_SITE_URL ?? "http://127.0.0.1:8765",
    headless: true,
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: 1,
    launchOptions: {
      args: ["--enable-webgl", "--ignore-gpu-blocklist"],
    },
  },
  webServer: {
    command: "python3 -m http.server 8765 --directory ../site",
    url: "http://127.0.0.1:8765",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
