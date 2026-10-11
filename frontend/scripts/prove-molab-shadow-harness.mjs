#!/usr/bin/env node
/**
 * Prove landmarks-molab-shadow.spec.ts fails on v1.3.3 landmarks.js and passes on the branch fix.
 * Writes logs under MILUME_SHADOW_PROOF_DIR (default: repo-root artifacts/molab-shadow-harness-proof).
 */
import { execSync } from "node:child_process";
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const frontendRoot = resolve(here, "..");
const repoRoot = resolve(frontendRoot, "..");
const landmarksPath = join(repoRoot, "milume/static/landmarks.js");
const outDir = process.env.MILUME_SHADOW_PROOF_DIR
  ? resolve(process.env.MILUME_SHADOW_PROOF_DIR)
  : join(repoRoot, "artifacts/molab-shadow-harness-proof");
const spec = "e2e/landmarks/landmarks-molab-shadow.spec.ts";
const tag = "v1.3.3";

mkdirSync(outDir, { recursive: true });
const backup = join(outDir, "landmarks-branch.js");
copyFileSync(landmarksPath, backup);

function runPlaywright(label) {
  const logPath = join(outDir, `${label}.log`);
  try {
    const out = execSync(`npx playwright test ${spec}`, {
      cwd: frontendRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, FORCE_COLOR: "0" },
    });
    writeFileSync(logPath, out);
    return { ok: true, logPath, out };
  } catch (err) {
    const combined = `${err.stdout ?? ""}${err.stderr ?? ""}`;
    writeFileSync(logPath, combined);
    return { ok: false, logPath, out: combined, code: err.status };
  }
}

function landmarksFromTag() {
  return execSync(`git show ${tag}:milume/static/landmarks.js`, {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });
}

console.log(`Proof output: ${outDir}`);

writeFileSync(landmarksPath, landmarksFromTag());
console.log(`Pinned ${landmarksPath} to ${tag}`);
const v133 = runPlaywright("v1.3.3-fail");
if (v133.ok) {
  console.error(`Expected ${spec} to FAIL on ${tag}; it passed. See ${v133.logPath}`);
  copyFileSync(backup, landmarksPath);
  process.exit(1);
}
console.log(`OK: ${tag} run failed as expected (${v133.logPath})`);

copyFileSync(backup, landmarksPath);
console.log("Restored branch landmarks.js");
const fix = runPlaywright("fix-pass");
if (!fix.ok) {
  console.error(`Expected ${spec} to PASS on branch fix; exit ${fix.code}. See ${fix.logPath}`);
  process.exit(1);
}
console.log(`OK: fix run passed (${fix.logPath})`);

const summary = [
  "# Molab shadow harness regression proof",
  "",
  `Generated: ${new Date().toISOString()}`,
  "",
  `- **${tag}** (landmarks.js from tag): expected **FAIL** — ${v133.ok ? "UNEXPECTED PASS" : "fail"}`,
  `- **branch fix** (restored landmarks.js): expected **PASS** — ${fix.ok ? "pass" : "UNEXPECTED FAIL"}`,
  "",
  "Logs:",
  `- \`v1.3.3-fail.log\``,
  `- \`fix-pass.log\``,
  "",
].join("\n");
writeFileSync(join(outDir, "README.md"), summary);
console.log(summary);
