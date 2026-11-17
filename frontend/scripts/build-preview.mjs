// Static PR preview: default toy widget harness + design-system harness.
// Asset URLs are rooted at /<repo>/pr/<PR_NUMBER>/ so GitHub project Pages can serve them.
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repo = (process.env.GITHUB_REPOSITORY ?? "ckmah/milume").split("/").pop();
const pr = process.env.PR_NUMBER ?? "";
if (!/^[0-9]+$/.test(pr)) {
  console.error("build-preview: set PR_NUMBER to the pull request number");
  process.exit(1);
}

const prefix = `/${repo}/pr/${pr}/`;
const out = path.resolve(frontend, "dist/preview");
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const viteBin = path.join(frontend, "node_modules/vite/bin/vite.js");

function viteBuild(extraEnv, outDir) {
  const result = spawnSync(process.execPath, [viteBin, "build"], {
    cwd: frontend,
    stdio: "inherit",
    env: {
      ...process.env,
      MILUME_PREVIEW: "1",
      MILUME_PREVIEW_OUT: outDir,
      DEV_WIDGET: "",
      ...extraEnv,
    },
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function assertAssets(indexPath, base) {
  const html = readFileSync(indexPath, "utf8");
  const needle = `${base}assets/`;
  if (!html.includes(needle)) {
    console.error(`build-preview: ${indexPath} has no asset URLs under ${needle}`);
    process.exit(1);
  }
}

const harnessOut = out;
viteBuild({ MILUME_PREVIEW_BASE: prefix, DEV_WIDGET: "" }, harnessOut);
cpSync(path.join(frontend, "dev/fixture.json"), path.join(harnessOut, "fixture.json"));
assertAssets(path.join(harnessOut, "index.html"), prefix);

const designRoot = path.join(frontend, "dev/design-system/index.html");
if (existsSync(designRoot)) {
  const designOut = path.join(out, "design-system");
  const designBase = `${prefix}design-system/`;
  viteBuild({ MILUME_PREVIEW_BASE: designBase, DEV_WIDGET: "design-system" }, designOut);
  assertAssets(path.join(designOut, "index.html"), designBase);
  console.log(`  design-system base ${designBase}`);
} else {
  console.log("build-preview: frontend/dev/design-system is absent; widget harness only");
}

console.log(`build-preview: wrote ${out}`);
console.log(`  widget base ${prefix}`);
