import assert from "node:assert/strict";
import test from "node:test";
import { ciJobs, reportCi, runCiScans } from "./design-scan.mjs";

const ctx = {
  bin: "/tmp/impeccable",
  cwd: "/tmp/frontend",
  port: 5174,
  outDir: "/tmp/design-scan",
};

const tags = ["default-dark", "populated-dark", "default-light", "populated-light"];

test("local --ci keeps the four 1280x800 cases on one DevTools port", () => {
  const { parallel, jobs } = ciJobs(ctx, ["node", "design-scan.mjs", "--ci"], {});
  assert.equal(parallel, false);
  assert.deepEqual(
    jobs.map((job) => job.out.split("/").pop()),
    tags.map((tag) => `${tag}-1280.png`),
  );
  assert.ok(jobs.every((job) => job.size[0] === 1280 && job.size[1] === 800));
  assert.ok(jobs.every((job) => job.cdp === 9333 && job.readyMs === 12000 && job.boot === undefined));
  assert.deepEqual(
    jobs.map((job) => job.scheme),
    ["dark", "dark", "light", "light"],
  );
  assert.equal(jobs[0].populate, undefined);
  assert.deepEqual(jobs[1].populate, [6, 4]);
  assert.equal(jobs[2].populate, undefined);
  assert.deepEqual(jobs[3].populate, [6, 4]);
  assert.ok(jobs.every((job) => job.port === 5174));
});

test("CI and --ci-parallel assign ports 9333 through 9336", () => {
  const plans = [
    ciJobs(ctx, ["node", "design-scan.mjs", "--ci"], { CI: "true" }),
    ciJobs(ctx, ["node", "design-scan.mjs", "--ci"], { CI: "1" }),
    ciJobs(ctx, ["node", "design-scan.mjs", "--ci-parallel"], {}),
    ciJobs(ctx, ["node", "design-scan.mjs", "--ci", "--ci-parallel"], { CI: "true" }),
  ];
  for (const { parallel, jobs } of plans) {
    assert.equal(parallel, true);
    assert.deepEqual(
      jobs.map((job) => job.cdp),
      [9333, 9334, 9335, 9336],
    );
    assert.deepEqual(
      jobs.map((job) => job.out.split("/").pop()),
      tags.map((tag) => `${tag}-1280.png`),
    );
  }
  assert.equal(ciJobs(ctx, ["node", "design-scan.mjs", "--ci"], { CI: "false" }).parallel, false);
  assert.equal(ciJobs(ctx, ["node", "design-scan.mjs", "--ci"], { CI: "" }).parallel, false);
});

test("parallel scans overlap and do not take the shared browser", async () => {
  let active = 0;
  let max = 0;
  let launches = 0;
  const summaries = await runCiScans(
    true,
    [{ cdp: 9333 }, { cdp: 9334 }, { cdp: 9335 }, { cdp: 9336 }],
    async (scan) => {
      assert.equal(scan.browser, undefined);
      active += 1;
      max = Math.max(max, active);
      await new Promise((resolve) => setTimeout(resolve, 20));
      active -= 1;
      return { primary: scan.cdp === 9334 ? 2 : 0 };
    },
    async () => {
      launches += 1;
    },
  );
  assert.equal(max, 4);
  assert.equal(launches, 0);
  assert.deepEqual(
    summaries.map((summary) => summary.primary),
    [0, 2, 0, 0],
  );
});

test("parallel waits for every scan before surfacing a failure", async () => {
  let finished = 0;
  await assert.rejects(
    () =>
      runCiScans(
        true,
        [{ cdp: 1 }, { cdp: 2 }],
        async (scan) => {
          await new Promise((resolve) => setTimeout(resolve, 15));
          finished += 1;
          if (scan.cdp === 1) throw new Error("no widget");
          return { primary: 0 };
        },
        async () => {
          throw new Error("shared launch");
        },
      ),
    /no widget/,
  );
  assert.equal(finished, 2);
});

test("sequential scans share one browser and close it once", async () => {
  const browsers = [];
  let open = 0;
  const seen = [];
  const summaries = await runCiScans(
    false,
    [{ cdp: 9333, tag: "a" }, { cdp: 9333, tag: "b" }],
    async (scan) => {
      assert.equal(open, 0);
      open += 1;
      seen.push(scan.browser);
      await new Promise((resolve) => setTimeout(resolve, 15));
      open -= 1;
      return { primary: 1 };
    },
    async (cdp) => {
      assert.equal(cdp, 9333);
      const browser = {
        closed: false,
        async close() {
          this.closed = true;
        },
      };
      browsers.push(browser);
      return browser;
    },
  );
  assert.equal(browsers.length, 1);
  assert.equal(browsers[0].closed, true);
  assert.ok(seen.every((browser) => browser === browsers[0]));
  assert.deepEqual(
    summaries.map((summary) => summary.primary),
    [1, 1],
  );
});

test("a sequential failure still closes the shared browser", async () => {
  let calls = 0;
  let closed = false;
  await assert.rejects(
    () =>
      runCiScans(
        false,
        [{ cdp: 9333 }, { cdp: 9333 }],
        async () => {
          calls += 1;
          throw new Error("boot");
        },
        async () => ({
          async close() {
            closed = true;
          },
        }),
      ),
    /boot/,
  );
  assert.equal(calls, 1);
  assert.equal(closed, true);
});

test("strict mode exits 1 only when primary findings remain", () => {
  const prev = process.exitCode;
  process.exitCode = 0;
  const logs = [];
  const orig = console.log;
  console.log = (...args) => logs.push(args.join(" "));
  try {
    assert.equal(reportCi(0, {}), 0);
    assert.equal(process.exitCode, 0);
    assert.equal(reportCi(3, {}), 0);
    assert.equal(process.exitCode, 0);
    assert.equal(reportCi(3, { DESIGN_SCAN_STRICT: "true" }), 0);
    assert.equal(process.exitCode, 0);
    assert.equal(reportCi(0, { DESIGN_SCAN_STRICT: "1" }), 0);
    assert.equal(process.exitCode, 0);
    assert.equal(reportCi(2, { DESIGN_SCAN_STRICT: "1" }), 1);
    assert.equal(process.exitCode, 1);
    assert.equal(reportCi(0, { CI_DESIGN_SCAN_PROVE: "1", DESIGN_SCAN_STRICT: "1" }), 1);
    assert.equal(process.exitCode, 1);
    assert.deepEqual(logs, [
      "design-scan --ci: total primary findings=0 (warn-only)",
      "design-scan --ci: total primary findings=3 (warn-only)",
      "design-scan --ci: total primary findings=3 (warn-only)",
      "design-scan --ci: total primary findings=0 (warn-only)",
      "design-scan --ci: total primary findings=2 (warn-only)",
      "design-scan primary: deliberate ci prove violation",
      "design-scan --ci: total primary findings=1 (warn-only)",
    ]);
  } finally {
    console.log = orig;
    process.exitCode = prev;
  }
});
