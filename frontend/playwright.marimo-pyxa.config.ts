import { defineConfig, devices } from "@playwright/test";

import { marimoE2eHost } from "./scripts/marimo-e2e-host.mjs";

const onCi = Boolean(process.env.CI);
const port = Number(process.env.E2E_MARIMO_PORT ?? 28_793);
const baseURL = `http://${marimoE2eHost()}:${port}`;

export default defineConfig({
  testDir: "./e2e/marimo",
  testMatch: "landmarks-selection-molab.spec.ts",
  testIgnore: "**/landmarks-molab-iframe.spec.ts",
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
    deviceScaleFactor: 2,
  },
  projects: [{ name: "chromium" }],
  webServer: {
    command: "node scripts/marimo-e2e-serve.mjs",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: onCi ? 900_000 : 600_000,
    stdout: "pipe",
    stderr: "pipe",
    env: {
      ...process.env,
      E2E_MARIMO_NOTEBOOK: "frontend/e2e/marimo/fixtures/pyxa-small-landmarks.marimo.py",
      E2E_MARIMO_PORT: String(port),
    },
  },
});
