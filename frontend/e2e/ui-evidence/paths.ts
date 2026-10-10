import { mkdirSync } from "node:fs";
import { join } from "node:path";

/** Stable paths for CI ui-evidence captures (worker-scoped tests skip testInfo.outputPath). */
export function uiEvidencePng(name: string) {
  const dir = join("test-results", "ui-evidence");
  mkdirSync(dir, { recursive: true });
  return join(dir, name);
}
