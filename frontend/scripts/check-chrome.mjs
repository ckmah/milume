// Chrome conventions, enforced instead of described (see AGENTS.md):
//   1. Widget UI uses shadcn/ReUI primitives from src/components/ui, not raw
//      <button>/<input>/<select>/<textarea>. Existing raw elements are ratcheted
//      in chrome-baseline.json: counts may go down, never up.
//   2. Widget styles never set :root / html / body / .dark (host UI would inherit them).
//   3. Motion has two channels, both switched off by the e2e harness (e2e/helpers.ts
//      stabilizeUi): CSS animation/transition, and cube-motion's Web Animations. A direct
//      .animate() call or another animation library would make tests wait out a motion
//      the harness cannot stop.
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, "..", "src");
const baselinePath = join(here, "chrome-baseline.json");
const RAW = /<(button|input|select|textarea)\b/g;
const OFF_CHANNEL_MOTION = /\.animate\(|new Animation\(|from ["'](framer-motion|motion|motion\/react|gsap|animejs)["']/;
const HOST_SELECTOR = /(^|[\s,}])(:root|html|body|\.dark)\s*[,{]/;

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}
const rel = (p) => relative(join(here, ".."), p).split("\\").join("/");

const raw = {};
const hostLeaks = [];
const offChannelMotion = [];
for (const file of walk(src)) {
  const path = rel(file);
  if (path.startsWith("src/components/ui/")) continue;
  const text = readFileSync(file, "utf8");
  if (/\.(tsx?|jsx?)$/.test(file) && OFF_CHANNEL_MOTION.test(text)) offChannelMotion.push(path);
  if (/\.(tsx|jsx)$/.test(file)) {
    const n = (text.match(RAW) ?? []).length;
    if (n) raw[path] = n;
  } else if (file.endsWith(".css")) {
    const code = text.replace(/\/\*[\s\S]*?\*\//g, "");
    if (HOST_SELECTOR.test(code)) hostLeaks.push(path);
  }
}

if (process.argv.includes("--update-baseline")) {
  writeFileSync(baselinePath, JSON.stringify(raw, null, 2) + "\n");
  console.log(`baseline written: ${Object.keys(raw).length} files`);
  process.exit(0);
}

const baseline = JSON.parse(readFileSync(baselinePath, "utf8"));
const errors = [];
for (const [path, n] of Object.entries(raw)) {
  const allowed = baseline[path] ?? 0;
  if (n > allowed) {
    errors.push(
      `${path}: ${n} raw form element(s), baseline ${allowed}. Use a component from src/components/ui.`,
    );
  }
}
for (const path of hostLeaks) {
  errors.push(`${path}: styles :root/html/body/.dark. Scope tokens under the widget / Soft Float root.`);
}
for (const path of offChannelMotion) {
  errors.push(`${path}: animates outside CSS and cube-motion, so e2e cannot switch it off. Use <Rise>/<Morph> or CSS.`);
}
if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log("check:chrome ok");
