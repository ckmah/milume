// Path -> tier -> CI leg -> job, all from .github/e2e-tiers.json:
//   tiers: path globs (dorny/paths-filter and `npm run verify` both match them)
//   legs:  a leg is on when any of its `tiers` (or derived `legs`) is on; `jobs` are the
//          workflow jobs gated on it; `verify` is the local [cwd, command] list
import { readFileSync } from "node:fs";
import { dirname, join, matchesGlob } from "node:path";
import { fileURLToPath } from "node:url";

export const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

export function loadCiConfig(root = repoRoot) {
  return JSON.parse(readFileSync(join(root, ".github", "e2e-tiers.json"), "utf8"));
}

export function tiersHit(config, files) {
  return new Set(
    Object.entries(config.tiers)
      .filter(([, globs]) => files.some((f) => globs.some((g) => matchesGlob(f, g))))
      .map(([name]) => name),
  );
}

function resolve(config, on) {
  const legs = {};
  for (const [name, leg] of Object.entries(config.legs)) {
    if (!leg.legs) legs[name] = on(name, leg);
  }
  for (const [name, leg] of Object.entries(config.legs)) {
    if (leg.legs) legs[name] = leg.legs.some((l) => legs[l]);
  }
  return legs;
}

export function selectLegs(config, hit) {
  return resolve(config, (_, leg) => leg.tiers.some((t) => hit.has(t)));
}

export function dispatchLegs(config, tier) {
  const on = new Set([...config.dispatch.always, ...(config.dispatch.by_tier[tier] ?? [])]);
  return resolve(config, (name) => on.has(name));
}

/** Ordered, de-duplicated [cwd, command, leg] steps for the legs that are on (first leg wins). */
export function verifyPlan(config, legs, { fullVolume = false } = {}) {
  const seen = new Set();
  const plan = [];
  for (const [name, leg] of Object.entries(config.legs)) {
    if (!legs[name]) continue;
    for (const [cwd, cmd] of leg.verify) {
      const c = fullVolume ? (config.full_volume[cmd] ?? cmd) : cmd;
      const key = `${cwd}\0${c}`;
      if (seen.has(key)) continue;
      seen.add(key);
      plan.push([cwd, c, name]);
    }
  }
  return plan;
}

/** Workflow jobs with their job-level `if:` text, from the two-space `jobs:` block. */
export function workflowJobs(yaml) {
  const jobs = {};
  let inJobs = false;
  let job = null;
  let inIf = false;
  for (const line of yaml.split("\n")) {
    if (/^\S/.test(line)) inJobs = line.startsWith("jobs:");
    if (!inJobs) continue;
    const key = line.match(/^ {2}([\w-]+):\s*$/);
    if (key) {
      job = key[1];
      jobs[job] = "";
      inIf = false;
      continue;
    }
    if (!job) continue;
    const field = line.match(/^ {4}(\w[\w-]*):(.*)$/);
    if (field) {
      inIf = field[1] === "if";
      if (inIf) jobs[job] += field[2];
    } else if (inIf && /^ {5,}\S/.test(line)) {
      jobs[job] += ` ${line.trim()}`;
    } else if (/^ {0,4}\S/.test(line)) {
      inIf = false;
    }
  }
  return jobs;
}

const OUTPUT_RE = /needs\.changes\.outputs\.(\w+)/g;

/** Disagreements between e2e-tiers.json and the workflows; `workflows` maps file name to YAML. */
export function ciLegErrors(config, workflows) {
  const errors = [];
  const legNames = new Set(Object.keys(config.legs));
  const gated = {};
  for (const [file, yaml] of Object.entries(workflows)) {
    const usesDetect = yaml.includes("./.github/workflows/detect-changes.yml");
    if (usesDetect && /^\s+paths(-ignore)?:/m.test(yaml.split(/^jobs:/m)[0])) {
      errors.push(`${file}: has a paths/paths-ignore trigger filter. Route paths through e2e-tiers.json legs instead.`);
    }
    for (const [job, cond] of Object.entries(workflowJobs(yaml))) {
      for (const [, out] of cond.matchAll(OUTPUT_RE)) {
        if (!legNames.has(out)) {
          errors.push(`${file}:${job}: gated on needs.changes.outputs.${out}, which is not a leg in e2e-tiers.json.`);
          continue;
        }
        (gated[out] ??= new Set()).add(`${file}:${job}`);
      }
    }
  }
  for (const [name, leg] of Object.entries(config.legs)) {
    const actual = gated[name] ?? new Set();
    for (const j of leg.jobs) {
      if (!actual.has(j)) errors.push(`legs.${name}.jobs lists ${j}, but that job's if: does not read needs.changes.outputs.${name}.`);
    }
    for (const j of actual) {
      if (!leg.jobs.includes(j)) errors.push(`${j} is gated on needs.changes.outputs.${name}, but legs.${name}.jobs does not list it.`);
    }
    for (const t of leg.tiers ?? []) {
      if (!config.tiers[t]) errors.push(`legs.${name} reads tier "${t}", which e2e-tiers.json does not define.`);
    }
  }
  const detect = workflows["detect-changes.yml"] ?? "";
  const declared = new Set([...detect.matchAll(/^ {6}(\w+):\n {8}value: \$\{\{ jobs\.detect\.outputs\.(\w+) \}\}/gm)].map((m) => m[1]));
  const wired = new Set([...detect.matchAll(/^ {6}(\w+): \$\{\{ steps\.select\.outputs\.\1 \}\}/gm)].map((m) => m[1]));
  for (const n of legNames) {
    if (!wired.has(n)) errors.push(`detect-changes.yml: jobs.detect.outputs.${n} is not wired to steps.select.outputs.${n}.`);
    if (!declared.has(n)) errors.push(`detect-changes.yml: workflow_call output "${n}" is missing for leg ${n}.`);
  }
  for (const n of declared) {
    if (!legNames.has(n)) errors.push(`detect-changes.yml: workflow_call output "${n}" is not a leg in e2e-tiers.json.`);
  }
  return errors;
}
