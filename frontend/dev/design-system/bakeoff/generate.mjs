/**
 * Generate the same shadcn slice for each bakeoff style, then restore the
 * production tree. `components.json` `style` is what makes `shadcn add` emit
 * Base UI. Run from frontend/: `node dev/design-system/bakeoff/generate.mjs`
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const outRoot = path.resolve(frontend, "dev/design-system/bakeoff/generated");
const componentsJsonPath = path.resolve(frontend, "components.json");

const STYLES = ["base-nova", "base-maia", "base-luma", "base-rhea"];
const ITEMS = [
  "button",
  "switch",
  "slider",
  "select",
  "dropdown-menu",
  "tooltip",
  "collapsible",
  "card",
  "separator",
  "field",
  "label",
];

const RESTORE = [
  "components.json",
  "src/styles/globals.css",
  "src/lib/utils.ts",
  "src/components/ui",
];

function restore() {
  execFileSync("git", ["checkout", "--", ...RESTORE], {
    cwd: frontend,
    stdio: "inherit",
  });
  const created = path.resolve(frontend, "src/components/ui/select.tsx");
  if (fs.existsSync(created)) fs.rmSync(created);
}

function patchSource(source) {
  let next = source.replaceAll(/from "@\/components\/ui\/([^"]+)"/g, 'from "./$1"');
  const portalRe = /<(\w+Primitive)\.Portal(\s[^>]*)?>/g;
  if (portalRe.test(next)) {
    portalRe.lastIndex = 0;
    next = next.replace(portalRe, (_match, name, rest) => {
      const extra = rest && !rest.includes("container=") ? rest : rest || "";
      if (rest && rest.includes("container=")) return `<${name}.Portal${rest}>`;
      return `<${name}.Portal container={useBakeoffPortal()}${extra}>`;
    });
    const importLine = 'import { useBakeoffPortal } from "../../../portal";\n';
    if (!next.includes("useBakeoffPortal")) {
      throw new Error("portal patch did not insert the hook call");
    }
    const useClient = next.match(/^["']use client["'];?\r?\n/);
    if (useClient) {
      next = next.replace(useClient[0], `${useClient[0]}${importLine}`);
    } else {
      next = importLine + next;
    }
  }
  return next;
}

function setStyle(style) {
  const config = JSON.parse(fs.readFileSync(componentsJsonPath, "utf8"));
  config.style = style;
  fs.writeFileSync(componentsJsonPath, JSON.stringify(config, null, 2) + "\n");
}

try {
  fs.rmSync(outRoot, { recursive: true, force: true });
  fs.mkdirSync(outRoot, { recursive: true });
  for (const style of STYLES) {
    setStyle(style);
    const info = execFileSync("npx", ["shadcn@latest", "info", "--json"], {
      cwd: frontend,
      encoding: "utf8",
    });
    const base = JSON.parse(info.slice(info.indexOf("{"))).config?.base;
    if (base !== "base") {
      throw new Error(`${style}: shadcn info base is ${base}, expected "base"`);
    }
    execFileSync(
      "npx",
      ["shadcn@latest", "add", ...ITEMS, "--yes", "--overwrite"],
      { cwd: frontend, stdio: "inherit" },
    );
    const dest = path.join(outRoot, style, "ui");
    fs.mkdirSync(dest, { recursive: true });
    const written = [];
    for (const item of ITEMS) {
      const filename = `${item}.tsx`;
      const from = path.resolve(frontend, "src/components/ui", filename);
      if (!fs.existsSync(from)) {
        throw new Error(`${style}: missing ${filename} after shadcn add`);
      }
      const patched = patchSource(fs.readFileSync(from, "utf8"));
      fs.writeFileSync(path.join(dest, filename), patched);
      written.push(filename);
    }
    const barrel = written.map((file) => `export * from "./${file.replace(/\.tsx$/, "")}";`).join("\n");
    fs.writeFileSync(path.join(dest, "index.ts"), `${barrel}\n`);
    console.log(`wrote ${style} (${written.length} files)`);
  }
} finally {
  restore();
}
