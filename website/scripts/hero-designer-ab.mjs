/**
 * Wrapper: run from frontend so @playwright/test resolves.
 *   cd frontend && node ../website/scripts/hero-designer-ab.mjs
 */
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const frontendScript = join(dirname(fileURLToPath(import.meta.url)), "../../frontend/scripts/hero-designer-ab.mjs");
const r = spawnSync(process.execPath, [frontendScript], {
  stdio: "inherit",
  env: process.env,
  cwd: join(dirname(fileURLToPath(import.meta.url)), "../../frontend"),
});
process.exit(r.status ?? 1);
