/**
 * Alternating volume-perf-bench runs on main vs PR HEAD (same Vite session per rev).
 * Usage: node scripts/bench-alternate-main-pr.mjs [runsPerRev=5]
 * Writes /opt/cursor/artifacts/bench-alternate-raw.jsonl and prints summary.
 */
import { spawnSync } from "node:child_process";
import { appendFileSync, copyFileSync, existsSync, writeFileSync } from "node:fs";

const runsPerRev = Number(process.argv[2] || 5);
const root = new URL("../..", import.meta.url).pathname;
const frontend = `${root}/frontend`;
const cutMode = process.env.BENCH_CUT_MODE === "zcut" ? "zcut" : "uncut";
const out = `/opt/cursor/artifacts/bench-alternate-${cutMode}-raw.jsonl`;
const port = 5173;
const session = "volume-vite-bench-alt";

function sh(cmd, opts = {}) {
  const r = spawnSync(cmd, { shell: true, encoding: "utf8", ...opts });
  if (r.status !== 0) throw new Error(r.stderr || r.stdout || `failed: ${cmd}`);
  return (r.stdout || "").trim();
}

const profile = process.env.BENCH_VOLUME_PROFILE === "small" ? "small" : "toy";
const expectedLabelIdsLen = profile === "small" ? 23320 : 16;
const harnessRel = [
  "frontend/vite.config.ts",
  "frontend/dev/mock-model.ts",
  "frontend/dev/export-landmarks-volume-fixture.py",
];
const harnessBackupDir = `/opt/cursor/artifacts/harness-overlay-${sh(`git -C ${root} rev-parse HEAD`)}`;
for (const rel of harnessRel) {
  const src = `${root}/${rel}`;
  if (!existsSync(src)) throw new Error(`missing harness file ${src}`);
  sh(`mkdir -p ${harnessBackupDir}`);
  copyFileSync(src, `${harnessBackupDir}/${rel.replaceAll("/", "__")}`);
}
const smallFixtureBackup =
  profile === "small" ? `${harnessBackupDir}/landmarks-volume-fixture.small.json` : null;
if (profile === "small") {
  const smallSrc = `${frontend}/dev/landmarks-volume-fixture.small.json`;
  if (!existsSync(smallSrc)) throw new Error(`missing ${smallSrc} (export small fixture first)`);
  copyFileSync(smallSrc, smallFixtureBackup);
}

function overlayHarnessFrom() {
  for (const rel of harnessRel) {
    sh(`cp ${harnessBackupDir}/${rel.replaceAll("/", "__")} ${root}/${rel}`);
  }
  if (smallFixtureBackup) {
    sh(`cp ${smallFixtureBackup} ${root}/frontend/dev/landmarks-volume-fixture.small.json`);
  }
}

function restartVite() {
  sh(`fuser -k ${port}/tcp 2>/dev/null || true`);
  sh(`tmux -f /exec-daemon/tmux.portal.conf kill-session -t ${session} 2>/dev/null || true`);
  sh(`find ${frontend}/node_modules/.vite -maxdepth 1 -name 'landmarks-volume-*' -exec rm -rf {} + 2>/dev/null || true`);
  sh(
    `tmux -f /exec-daemon/tmux.portal.conf new-session -d -s ${session} -c ${frontend} -- bash -lc ` +
      `"npx cross-env DEV_WIDGET=landmarks-volume MILUME_VOLUME_PROFILE=${profile} npx vite --host 127.0.0.1 --port ${port} --strictPort"`,
  );
  for (let i = 0; i < 90; i++) {
    try {
      sh(`curl -sf http://127.0.0.1:${port}/ >/dev/null`);
      const len = JSON.parse(sh(`curl -sf http://127.0.0.1:${port}/fixture.json`)).volume_label_ids.length;
      if (len !== expectedLabelIdsLen) {
        throw new Error(`fixture volume_label_ids length ${len} (expected ${expectedLabelIdsLen})`);
      }
      return;
    } catch {
      /* wait */
    }
    spawnSync("sleep", ["1"]);
  }
  throw new Error("vite did not start");
}

function benchOnce(rev) {
  const json = sh(
    `cd ${frontend} && BENCH_CUT_MODE=${cutMode} BENCH_REV_TAG=${rev} BENCH_ARTIFACT_DIR=/opt/cursor/artifacts node scripts/.volume-perf-bench.validated.mjs`,
  );
  return JSON.parse(json);
}

function median(nums) {
  const a = [...nums].sort((x, y) => x - y);
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

function spread(nums) {
  const a = [...nums].sort((x, y) => x - y);
  const p95 = a[Math.min(a.length - 1, Math.floor(a.length * 0.95))];
  return {
    min: a[0],
    max: a[a.length - 1],
    p25: a[Math.floor(a.length * 0.25)],
    p75: a[Math.floor(a.length * 0.75)],
    p95,
  };
}

const branch = sh(`git -C ${root} rev-parse --abbrev-ref HEAD`);
const prRev = sh(`git -C ${root} rev-parse HEAD`);
const mainRev = sh(`git -C ${root} rev-parse ${process.env.BENCH_MAIN_REF || "origin/main"}`);

/** Untracked copy survives `git checkout` between main and PR revisions. */
const validatedBench = `${frontend}/scripts/.volume-perf-bench.validated.mjs`;
copyFileSync(`${frontend}/scripts/volume-perf-bench.mjs`, validatedBench);

writeFileSync(out, "");
const records = [];

try {
  for (let i = 0; i < runsPerRev; i++) {
    for (const rev of ["main", "pr"]) {
      const sha = rev === "main" ? mainRev : prRev;
      sh(`git -C ${root} checkout -f --quiet ${sha}`);
      if (rev === "main") overlayHarnessFrom();
      restartVite();
      spawnSync("sleep", ["2"]);
      const t0 = Date.now();
      const result = benchOnce(rev);
      const row = { rev, sha, i, wallMs: Date.now() - t0, ...result };
      records.push(row);
      appendFileSync(out, `${JSON.stringify(row)}\n`);
      console.log(JSON.stringify(row));
    }
  }
} finally {
  sh(`git -C ${root} checkout -f --quiet ${branch}`);
}

const byRev = (rev) => records.filter((r) => r.rev === rev);
const summary = {
  cutMode,
  runsPerRev,
  main: {
    hoverMs: { median: median(byRev("main").map((r) => r.hoverMs)), ...spread(byRev("main").map((r) => r.hoverMs)) },
    orbitMs: { median: median(byRev("main").map((r) => r.orbitMs)), ...spread(byRev("main").map((r) => r.orbitMs)) },
  },
  pr: {
    hoverMs: { median: median(byRev("pr").map((r) => r.hoverMs)), ...spread(byRev("pr").map((r) => r.hoverMs)) },
    orbitMs: { median: median(byRev("pr").map((r) => r.orbitMs)), ...spread(byRev("pr").map((r) => r.orbitMs)) },
  },
};
summary.orbitMedianDeltaPct =
  ((summary.pr.orbitMs.median - summary.main.orbitMs.median) / summary.main.orbitMs.median) * 100;
summary.orbitP95DeltaPct =
  ((summary.pr.orbitMs.p95 - summary.main.orbitMs.p95) / summary.main.orbitMs.p95) * 100;

writeFileSync(`/opt/cursor/artifacts/bench-alternate-${cutMode}-summary.json`, JSON.stringify(summary, null, 2));
console.log("\n=== summary ===\n", JSON.stringify(summary, null, 2));
