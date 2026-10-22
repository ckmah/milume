// check:shot-spec: validates docs/montage/shot-spec.md (#264). See that file's header.
//   node scripts/check-shot-spec.mjs [--spec path]
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { canonicalTagline, shotSpecErrors } from "./lib/shot-spec.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const i = process.argv.indexOf("--spec");
const spec = i > 0 ? process.argv[i + 1] : join(root, "docs", "montage", "shot-spec.md");
const tagline = canonicalTagline(readFileSync(join(root, "website", "landing", "index.html"), "utf8"));
const errors = shotSpecErrors(readFileSync(spec, "utf8"), { tagline, root });
if (errors.length) {
  console.error("check:shot-spec failed:\n" + errors.map((e) => `  - ${e}`).join("\n"));
  process.exit(1);
}
console.log(`check:shot-spec ok (tagline: "${tagline}")`);
