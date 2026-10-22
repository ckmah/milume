import { matchesGlob } from "node:path";

const UNCONDITIONAL_SKIP_RE =
  /\btest(?:\.describe)?\.(skip|fixme)\(\s*(?:\)|["'`]|true\b|async\b|\(\s*\{|function\b)/g;

const UI_GESTURES = [
  ["page.mouse", /\.mouse\./],
  [".click(", /\.(?:click|dblclick)\(/],
  [".dragTo(", /\.dragTo\(/],
  ["drawLasso*", /\bdrawLasso\w*\(/],
  [".hover(", /\.hover\(/],
  [".tap(", /\.tap\(/],
  ["keyboard input", /\.keyboard\.|\.press\(|\.pressSequentially\(|\.fill\(/],
];

export function unconditionalSkips(source) {
  return [...source.matchAll(UNCONDITIONAL_SKIP_RE)].map((m) => ({
    line: source.slice(0, m.index).split("\n").length,
    call: `test.${m[1]}`,
  }));
}

/** `allow` entries are `{ file, text, reason }`: a line in `file` containing `text` is exempt. */
export function uiGestures(file, source, allow = []) {
  const exempt = allow.filter((a) => a.file === file).map((a) => a.text);
  const hits = [];
  source.split("\n").forEach((text, i) => {
    if (exempt.some((t) => text.includes(t))) return;
    for (const [name, re] of UI_GESTURES) {
      if (re.test(text)) hits.push({ line: i + 1, gesture: name });
    }
  });
  return hits;
}

/** Each molab spec must stay out of the flaky registry unless the entry links an issue. */
export function unlinkedFlakyEntries(registry, specs) {
  return (registry.tests ?? []).filter(
    (t) =>
      specs.some((s) => s.endsWith(t.file)) &&
      !/(?:#\d+|github\.com\/[^/]+\/[^/]+\/issues\/\d+)/.test(String(t.issue ?? "")),
  );
}

export function molabPathsHit(files, scope) {
  return files.filter((f) => scope.molab.paths.some((g) => matchesGlob(f, g)));
}

/** Registered molab paths that no tier running `e2e-landmarks (default)` would pick up. */
export function unroutedMolabPaths(files, scope, tiers) {
  const runGlobs = scope.molab.runTiers.flatMap((t) => tiers[t] ?? []);
  return molabPathsHit(files, scope).filter((f) => !runGlobs.some((g) => matchesGlob(f, g)));
}

export function scopeErrors({ scope, tiers, trackedFiles, read, registry, listedSpecs }) {
  const errors = [];
  const { specs } = scope.molab;
  for (const spec of specs) {
    if (!trackedFiles.includes(spec)) {
      errors.push(`${spec}: molab spec is missing. It must exist and run in e2e-landmarks (default).`);
      continue;
    }
    for (const s of unconditionalSkips(read(spec))) {
      errors.push(`${spec}:${s.line}: unconditional ${s.call} on a molab spec. These specs always run.`);
    }
    if (listedSpecs && !listedSpecs.has(spec)) {
      errors.push(
        `${spec}: not in the e2e-landmarks (default) run (\`playwright test e2e/landmarks --list\`). Check testIgnore in playwright.config.ts.`,
      );
    }
  }
  for (const t of unlinkedFlakyEntries(registry, specs)) {
    errors.push(`flaky-registry.json: "${t.title}" (${t.file}) is a molab spec with no "issue" link.`);
  }
  for (const f of unroutedMolabPaths(trackedFiles, scope, tiers)) {
    errors.push(`${f}: molab path not routed to e2e-landmarks (default) by tiers ${scope.molab.runTiers.join(", ")}.`);
  }
  const dir = `${scope.marimo_api.dir}/`;
  for (const f of trackedFiles.filter((p) => p.startsWith(dir) && /\.[cm]?[jt]s$/.test(p))) {
    for (const g of uiGestures(f, read(f), scope.marimo_api.allow)) {
      errors.push(
        `${f}:${g.line}: UI gesture ${g.gesture} in marimo e2e, which is Python API and kernel only. Move gesture specs to frontend/e2e/landmarks/.`,
      );
    }
  }
  return errors;
}
