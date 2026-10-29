// design-scan: seed a widget state in Chromium (with a local DevTools port), screenshot it, run
// `impeccable detect --cdp` on exactly that page, and write <out>.png + <out>.json (+ <out>.marks.json).
//   node design-scan.mjs '{"out":"/abs/x.png","bin":"<impeccable>","cwd":"<frontend>","port":5173,...}'
//   node design-scan.mjs --ci   # dark/light × default/populated at 1280×800 (needs Vite on DESIGN_SCAN_PORT)
import { chromium } from "playwright";
import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(scriptDir, "..", "..");

async function runOneScan(o) {
  const [w, h] = o.size || [1280, 800];
  const cdp = o.cdp || 9333;
  const b = await chromium.launch({
    args: [
      "--use-gl=angle",
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
      `--remote-debugging-port=${cdp}`,
      "--remote-debugging-address=127.0.0.1",
    ],
  });
  const p = await b.newPage({
    viewport: { width: w, height: h },
    colorScheme: o.scheme || "dark",
    deviceScaleFactor: o.dpr || 1,
  });
  p.on("pageerror", (e) => console.log("pageerror", e.message.slice(0, 200)));
  let marks;
  if (o.seed) {
    marks = await (await import(o.seed)).default(p, o);
  } else {
    await p.goto(
      `http://127.0.0.1:${o.port || 5173}/${o.fixture ? `?fixture=/${o.fixture}` : ""}`,
    );
    await p.waitForTimeout(o.boot || 9000);
    if (o.populate) {
      await p.evaluate(
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
      await p.waitForTimeout(2500);
    }
    if (o.clicks) {
      for (const c of o.clicks) {
        await p
          .locator(c)
          .first()
          .click({ timeout: 4000 })
          .catch((e) => console.log("click fail", c, e.message.slice(0, 100)));
        await p.waitForTimeout(900);
      }
    }
  }
  await p.screenshot({ path: o.out, timeout: 180000 });
  if (marks) fs.writeFileSync(o.out.replace(/\.png$/, ".marks.json"), JSON.stringify(marks));
  let out = "";
  try {
    out = execFileSync(o.bin, ["detect", "--json", "--cdp", String(cdp)], {
      cwd: o.cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (e) {
    out = e.stdout || "";
    if (e.status !== 2) console.log("detect err", e.status, (e.stderr || "").slice(0, 400));
  }
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
      console.log(`design-scan primary: ${f.rule ?? f.id ?? "?"} ${f.message ?? ""}`.trim());
    }
  }
  await b.close();
  return summary;
}

async function runCi() {
  const bin = path.join(repoRoot, ".cursor/skills/impeccable/scripts/impeccable");
  const cwd = path.join(repoRoot, "frontend");
  const port = Number(process.env.DESIGN_SCAN_PORT || 5173);
  const outDir = path.join(cwd, "test-results", "design-scan");
  fs.mkdirSync(outDir, { recursive: true });
  const cases = [
    { tag: "default-dark", scheme: "dark" },
    { tag: "populated-dark", scheme: "dark", populate: [6, 4] },
    { tag: "default-light", scheme: "light" },
    { tag: "populated-light", scheme: "light", populate: [6, 4] },
  ];
  let totalPrimary = 0;
  for (const c of cases) {
    const o = {
      out: path.join(outDir, `${c.tag}-1280.png`),
      bin,
      cwd,
      port,
      size: [1280, 800],
      scheme: c.scheme,
      boot: 12000,
      cdp: 9333,
    };
    if (c.populate) o.populate = c.populate;
    const s = await runOneScan(o);
    totalPrimary += s.primary;
  }
  console.log(`design-scan --ci: total primary findings=${totalPrimary} (warn-only)`);
}

if (process.argv[2] === "--ci") {
  await runCi();
} else {
  await runOneScan(JSON.parse(process.argv[2]));
}
