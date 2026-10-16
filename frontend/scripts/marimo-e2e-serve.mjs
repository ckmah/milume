#!/usr/bin/env node
/**
 * Start `marimo run` for Playwright (real kernel, anywidget comm).
 * CI: run after `npm run build` and `uv sync --extra demo`.
 */
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { marimoE2eBaseUrl, marimoE2ePort } from "./marimo-e2e-host.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const port = marimoE2ePort();
const notebook =
  process.env.E2E_MARIMO_NOTEBOOK ?? join(root, "demos", "landmarks.py");

const cmd = `printf 'n\\n' | uv run --extra demo marimo run --headless --no-token --host 0.0.0.0 --port ${port} ${JSON.stringify(notebook)}`;

const child = spawn("bash", ["-lc", cmd], {
  cwd: root,
  stdio: "inherit",
  env: process.env,
});

const readyUrl = marimoE2eBaseUrl();
console.log(`[marimo-e2e] waiting for ${readyUrl}`);

async function waitReady() {
  const deadline = Date.now() + (Number(process.env.E2E_MARIMO_READY_MS) || 900_000);
  while (Date.now() < deadline) {
    try {
      const res = await fetch(readyUrl, { redirect: "follow" });
      if (res.ok) {
        console.log(`[marimo-e2e] ready at ${readyUrl}`);
        return;
      }
    } catch {
      // kernel still booting / downloading demo data
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  child.kill("SIGTERM");
  throw new Error(`marimo not ready at ${readyUrl} within deadline`);
}

waitReady().catch((err) => {
  console.error(err);
  process.exit(1);
});

process.on("SIGINT", () => child.kill("SIGTERM"));
process.on("SIGTERM", () => child.kill("SIGTERM"));
