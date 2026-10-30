// design-scan: seed a widget state in Chromium (with a local DevTools port), screenshot it, run
// `impeccable detect --cdp` on exactly that page, and write <out>.png + <out>.json (+ <out>.marks.json).
//   node design-scan.mjs '{"out":"/abs/x.png","bin":"<impeccable>","cwd":"<frontend>","port":5173,...}'
//   node design-scan.mjs --ci
//       dark/light × default/populated at 1280×800 on one browser (needs Vite on DESIGN_SCAN_PORT)
//   node design-scan.mjs --ci-parallel
//       the same four cases, each with its own browser and DevTools port
// CI=true or CI=1 selects the parallel path. DESIGN_SCAN_STRICT=1 exits 1 when a primary finding remains.
import { execFile } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(scriptDir, "..", "..");

const CI_CASES = [
  { tag: "default-dark", scheme: "dark" },
  { tag: "populated-dark", scheme: "dark", populate: [6, 4] },
  { tag: "default-light", scheme: "light" },
  { tag: "populated-light", scheme: "light", populate: [6, 4] },
];

function ciParallel(argv, env) {
  return argv.includes("--ci-parallel") || env.CI === "1" || env.CI === "true";
}

// detect --cdp attaches to one browser, so parallel cases cannot share a DevTools port.
export function ciJobs(ctx, argv = process.argv, env = process.env) {
  const parallel = ciParallel(argv, env);
  const jobs = CI_CASES.map((c, i) => {
    const job = {
      out: path.join(ctx.outDir, `${c.tag}-1280.png`),
      bin: ctx.bin,
      cwd: ctx.cwd,
      port: ctx.port,
      size: [1280, 800],
      scheme: c.scheme,
      readyMs: 12000,
      cdp: parallel ? 9333 + i : 9333,
    };
    if (c.populate) job.populate = c.populate;
    return job;
  });
  return { parallel, jobs };
}

export function reportCi(totalPrimary, env = process.env) {
  console.log(`design-scan --ci: total primary findings=${totalPrimary} (warn-only)`);
  if (env.DESIGN_SCAN_STRICT === "1" && totalPrimary > 0) {
    process.exitCode = 1;
    return 1;
  }
  return 0;
}

async function launchScanBrowser(cdp) {
  const { chromium } = await import("playwright");
  return chromium.launch({
    args: [
      "--use-gl=angle",
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
      `--remote-debugging-port=${cdp}`,
      "--remote-debugging-address=127.0.0.1",
    ],
  });
}

async function waitForWidget(page, timeout) {
  const deadline = Date.now() + timeout;
  const remaining = () => {
    const ms = deadline - Date.now();
    if (ms <= 0) throw new Error(`design-scan: widget not ready within ${timeout}ms`);
    return ms;
  };
  await page.locator(".landmarks").first().waitFor({ state: "visible", timeout: remaining() });
  await page.locator("canvas.landmarks__webgl").first().waitFor({
    state: "visible",
    timeout: remaining(),
  });
  await page.waitForFunction(
    () => {
      const vs = window.__landmarksEngine?.getViewState?.();
      return Boolean(vs && Number.isFinite(vs.zoom));
    },
    null,
    { timeout: remaining() },
  );
}

function detectOnPort(bin, cwd, cdp) {
  return new Promise((resolve) => {
    execFile(
      bin,
      ["detect", "--json", "--cdp", String(cdp)],
      { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
      (err, stdout, stderr) => {
        if (err && err.code !== 2) {
          console.log("detect err", err.code, String(stderr || "").slice(0, 400));
        }
        resolve(stdout || "");
      },
    );
  });
}

async function runOneScan(o) {
  const [w, h] = o.size || [1280, 800];
  const cdp = o.cdp || 9333;
  const ownsBrowser = !o.browser;
  const browser = o.browser ?? (await launchScanBrowser(cdp));
  let page;
  try {
    page = await browser.newPage({
      viewport: { width: w, height: h },
      colorScheme: o.scheme || "dark",
      deviceScaleFactor: o.dpr || 1,
    });
    page.on("pageerror", (e) => console.log("pageerror", e.message.slice(0, 200)));
    let marks;
    if (o.seed) {
      marks = await (await import(o.seed)).default(page, o);
    } else {
      await page.goto(
        `http://127.0.0.1:${o.port || 5173}/${o.fixture ? `?fixture=/${o.fixture}` : ""}`,
      );
      if (o.readyMs != null) await waitForWidget(page, o.readyMs);
      else await page.waitForTimeout(o.boot || 9000);
      if (o.populate) {
        await page.evaluate(
          ({ n, sel }) => {
            const m = window.__landmarksModel;
            const b = window.__landmarksEngine.getViewportWorldBounds();
            const W = b.xMax - b.xMin,
              H = b.yMax - b.yMin,
              X = (f) => b.xMin + W * f,
              Y = (f) => b.yMin + H * f;
            const cols = ["#00e5ff", "#ff6b9a", "#ffd166", "#7bd88f", "#b48cff", "#ff9f43"];
            const lms = [];
            for (let i = 0; i < n; i++) {
              const t = ["point", "line", "spline", "polygon"][i % 4];
              const v =
                t === "point"
                  ? [[X(0.3 + 0.05 * i), Y(0.4)]]
                  : t === "polygon"
                    ? [
                        [X(0.2 + 0.04 * i), Y(0.6)],
                        [X(0.25 + 0.04 * i), Y(0.7)],
                        [X(0.3 + 0.04 * i), Y(0.62)],
                      ]
                    : [
                        [X(0.15 + 0.05 * i), Y(0.3)],
                        [X(0.25 + 0.05 * i), Y(0.35)],
                        [X(0.3 + 0.05 * i), Y(0.25)],
                      ];
              lms.push({
                id: "lm" + i,
                type: t,
                vertices: v,
                buffer_width: W * 0.03,
                buffer_side: "both",
                line_style: "solid",
                color: cols[i % 6],
              });
            }
            const sels = [];
            for (let i = 0; i < sel; i++) {
              const idx = [];
              for (let k = 0; k < 300; k++) idx.push(i * 400 + k);
              sels.push({ id: "s" + i, type: "points", point_indices: idx, neighborhood: "off" });
            }
            m.set("landmarks", lms);
            m.set("selections", sels);
            m.set("selected_kind", "landmark");
            m.set("selected_index", 1);
            m.save_changes();
          },
          { n: o.populate[0], sel: o.populate[1] },
        );
        await page.waitForTimeout(2500);
      }
      if (o.clicks) {
        for (const c of o.clicks) {
          await page
            .locator(c)
            .first()
            .click({ timeout: 4000 })
            .catch((e) => console.log("click fail", c, e.message.slice(0, 100)));
          await page.waitForTimeout(900);
        }
      }
    }
    await page.screenshot({ path: o.out, timeout: 180000 });
    if (marks) fs.writeFileSync(o.out.replace(/\.png$/, ".marks.json"), JSON.stringify(marks));
    const out = await detectOnPort(o.bin, o.cwd, cdp);
    fs.writeFileSync(o.out.replace(/\.png$/, ".json"), out || "[]");
    const d = JSON.parse(out || "[]");
    const summary = {
      out: o.out,
      primary: d.filter((x) => !x.advisory).length,
      advisory: d.filter((x) => x.advisory).length,
      overlaps: marks?.census?.overlaps ?? null,
      offscreen: marks?.census?.offscreen ?? null,
    };
    console.log(JSON.stringify(summary));
    if (summary.primary > 0) {
      for (const f of d.filter((x) => !x.advisory).slice(0, 8)) {
        console.log(
          `design-scan primary: ${f.rule ?? f.id ?? f.antipattern ?? "?"} ${f.message ?? f.name ?? ""}`.trim(),
        );
      }
    }
    return summary;
  } finally {
    try {
      await page?.close();
    } finally {
      if (ownsBrowser) await browser.close();
    }
  }
}

export async function runCiScans(parallel, scans, run, launch) {
  if (parallel) {
    const results = await Promise.all(
      scans.map((scan) =>
        run(scan).then(
          (summary) => ({ summary }),
          (error) => ({ error }),
        ),
      ),
    );
    const failed = results.find((result) => result.error);
    if (failed) throw failed.error;
    return results.map((result) => result.summary);
  }
  const browser = await launch(scans[0].cdp);
  try {
    const summaries = [];
    for (const scan of scans) summaries.push(await run({ ...scan, browser }));
    return summaries;
  } finally {
    await browser.close();
  }
}

export function mainLegacyJobs(ctx) {
  return CI_CASES.map((c) => {
    const job = {
      out: path.join(ctx.outDir, `${c.tag}-1280.png`),
      bin: ctx.bin,
      cwd: ctx.cwd,
      port: ctx.port,
      size: [1280, 800],
      scheme: c.scheme,
      boot: 12000,
      cdp: 9333,
    };
    if (c.populate) job.populate = c.populate;
    return job;
  });
}

export function findingSummary(jsonPath) {
  const d = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
  const primary = d.filter((x) => !x.advisory);
  return {
    count: primary.length,
    names: primary.map((f) => String(f.rule ?? f.id ?? "?")).sort(),
  };
}

export async function runMainLegacyCi(env = process.env) {
  const bin = path.join(repoRoot, ".cursor/skills/impeccable/scripts/impeccable");
  const cwd = path.join(repoRoot, "frontend");
  const port = Number(env.DESIGN_SCAN_PORT || 5173);
  const outDir = path.join(cwd, "test-results", "design-scan-legacy");
  fs.mkdirSync(outDir, { recursive: true });
  const jobs = mainLegacyJobs({ bin, cwd, port, outDir });
  const summaries = [];
  for (const job of jobs) summaries.push(await runOneScan(job));
  return summaries;
}

export async function runCi(argv = process.argv, env = process.env) {
  const bin = path.join(repoRoot, ".cursor/skills/impeccable/scripts/impeccable");
  const cwd = path.join(repoRoot, "frontend");
  const port = Number(env.DESIGN_SCAN_PORT || 5173);
  const outDir = path.join(cwd, "test-results", "design-scan");
  fs.mkdirSync(outDir, { recursive: true });
  const { parallel, jobs } = ciJobs({ bin, cwd, port, outDir }, argv, env);
  const summaries = await runCiScans(parallel, jobs, runOneScan, launchScanBrowser);
  const totalPrimary = summaries.reduce((total, summary) => total + summary.primary, 0);
  return reportCi(totalPrimary, env);
}

const invokedDirectly =
  process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (invokedDirectly) {
  if (process.argv.includes("--ci-legacy")) await runMainLegacyCi();
  else if (process.argv.includes("--ci") || process.argv.includes("--ci-parallel")) await runCi();
  else await runOneScan(JSON.parse(process.argv[2]));
}
