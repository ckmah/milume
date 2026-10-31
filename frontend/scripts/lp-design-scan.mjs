/**
 * Panel-layout design scan for #400 frames (impeccable detect via CDP).
 * Requires `npm run dev:landmarks -- --host 127.0.0.1 --port 5173`.
 *
 *   DESIGN_SCAN_STRICT=1 node scripts/lp-design-scan.mjs
 */
import { execFile } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";

const scriptDir = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = join(scriptDir, "..", "..");
const bin = join(repoRoot, ".cursor/skills/impeccable/scripts/impeccable");
const cwd = join(repoRoot, "frontend");
const port = Number(process.env.DESIGN_SCAN_PORT || 5173);
const outDir = join(cwd, "test-results", "lp-design-scan");
mkdirSync(outDir, { recursive: true });

function detectOnPort(cdp) {
  return new Promise((resolve) => {
    execFile(
      bin,
      ["detect", "--json", "--cdp", String(cdp)],
      { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
      (_err, stdout) => resolve(stdout || "[]"),
    );
  });
}

async function waitEngine(page) {
  await page.waitForFunction(
    () => Boolean(window.__landmarksEngine?.getViewState?.()),
    null,
    { timeout: 120_000 },
  );
}

async function setModel(page, patch) {
  await page.evaluate((p) => {
    const model = window.__landmarksModel;
    for (const [k, v] of Object.entries(p)) model.set(k, v);
    model.save_changes();
  }, patch);
}

const FRAMES = [
  {
    tag: "minimise-landmark",
    file: "minimise-landmark.png",
    async prep(page) {
      await setModel(page, { selected_kind: "landmark", selected_index: 0 });
      await page.getByTestId("toggle-minimise-panels").click();
    },
  },
  {
    tag: "minimise-chip",
    file: "minimise-chip.png",
    async prep(page) {
      await page.getByTestId("toggle-minimise-panels").click();
    },
  },
  {
    tag: "cat-selection",
    file: "cat-selection.png",
    async prep(page) {
      await setModel(page, { selected_kind: "selection", selected_index: 0 });
      await page.getByRole("tab", { name: "cat" }).click();
    },
  },
  {
    tag: "cat-plain",
    file: "cat-plain.png",
    async prep(page) {
      await setModel(page, { selected_kind: "", selected_index: -1 });
      await page.getByRole("tab", { name: "cat" }).click();
    },
  },
];

async function scanFrame(frame, cdp) {
  const out = join(outDir, frame.file);
  const browser = await chromium.launch({
    args: [
      "--use-gl=angle",
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
      `--remote-debugging-port=${cdp}`,
      "--remote-debugging-address=127.0.0.1",
    ],
  });
  try {
    const page = await browser.newPage({
      viewport: { width: 1280, height: 800 },
      deviceScaleFactor: 2,
      colorScheme: "dark",
    });
    await page.addStyleTag({
      content: `[data-testid="harness-banner"], .harness-banner { display: none !important; }`,
    });
    await page.goto(`http://127.0.0.1:${port}/?fixture=/fixture.json`, {
      waitUntil: "networkidle",
    });
    await waitEngine(page);
    await frame.prep(page);
    await page.waitForTimeout(600);
    await page.screenshot({ path: out, timeout: 180_000 });
    const raw = await detectOnPort(cdp);
    writeFileSync(out.replace(/\.png$/, ".json"), raw);
    const findings = JSON.parse(raw || "[]");
    return {
      tag: frame.tag,
      out,
      primary: findings.filter((x) => !x.advisory).length,
      advisory: findings.filter((x) => x.advisory).length,
    };
  } finally {
    await browser.close();
  }
}

async function main() {
  let totalPrimary = 0;
  let totalAdvisory = 0;
  for (let i = 0; i < FRAMES.length; i++) {
    const summary = await scanFrame(FRAMES[i], 9350 + i);
    console.log(JSON.stringify(summary));
    totalPrimary += summary.primary;
    totalAdvisory += summary.advisory;
  }
  console.log(
    `lp-design-scan: total primary=${totalPrimary} advisory=${totalAdvisory}`,
  );
  if (process.env.DESIGN_SCAN_STRICT === "1" && totalPrimary > 0) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
