import { defineConfig, devices } from "@playwright/test";

import { marimoE2eBaseUrl } from "./scripts/marimo-e2e-host.mjs";

const baseURL = marimoE2eBaseUrl();
const onCi = Boolean(process.env.CI);

export default defineConfig({
  testDir: "./e2e/marimo",
  timeout: onCi ? 900_000 : 600_000,
  expect: { timeout: onCi ? 120_000 : 60_000 },
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    ...devices["Desktop Chrome"],
    baseURL,
    headless: true,
    trace: "retain-on-failure",
    video: onCi ? "retain-on-failure" : "off",
    viewport: { width: 1400, height: 900 },
  },
  projects: [{ name: "chromium" }],
  webServer: {
    command: "node scripts/marimo-e2e-serve.mjs",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: onCi ? 900_000 : 600_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
