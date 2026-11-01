/**
 * Dual-channel cube bisect: dump linked fragment shader + GL inset stats per bisect mode.
 * Usage: ISSUE395_BASE_URL=http://127.0.0.1:5180 npx tsx scripts/issue395-dual-bisect.ts
 */
import { writeFile, mkdir } from "node:fs/promises";
import { execSync } from "node:child_process";
import { chromium } from "@playwright/test";

import {
  bootIssue395LandmarksVolume,
  expectDapiVisible,
  expectPanckVisible,
  openIssue395CubeAtInspectCentre,
  setCubeLabels,
  setCubePreset,
  waitCubeRefined,
} from "../e2e/helpers/issue395-cube-flow.ts";
import {
  analyzeIssue395PanckSitesInCubeView,
  cubeGlInkStats,
  CUBE_VOLUME_INSET,
} from "../e2e/helpers/shader-and-pixels.ts";

const outDir = "/opt/cursor/artifacts/issue395";
const base = process.env.ISSUE395_BASE_URL ?? "http://127.0.0.1:5180";
const cubeSel = '[role="dialog"][aria-label="Cube"] .volume-cube__view';
const canvasSel = `${cubeSel} canvas`;

type BisectMode = "merge" | "ch0" | "ch1";

function queryFor(mode: BisectMode) {
  if (mode === "ch0") return "noDialkit=1&cubeDebugDualBisect=ch0";
  if (mode === "ch1") return "noDialkit=1&cubeDebugDualBisect=ch1";
  return "noDialkit=1";
}

async function captureGlProgramDiagnostics(page: import("@playwright/test").Page) {
  return page.evaluate(
    `(() => {
      const sel = ${JSON.stringify(canvasSel)};
      const canvas = document.querySelector(sel);
      if (!canvas) return { error: "no canvas" };
      const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
      if (!gl) return { error: "no gl" };
      const ext = gl.getExtension("WEBGL_debug_shaders");
      const prog = gl.getParameter(gl.CURRENT_PROGRAM);
      if (!prog) return { error: "no current program" };
      const loc0 = gl.getUniformLocation(prog, "volume0");
      const loc1 = gl.getUniformLocation(prog, "volume1");
      const unit0 = loc0 ? gl.getUniform(prog, loc0) : null;
      const unit1 = loc1 ? gl.getUniform(prog, loc1) : null;
      let fragmentSource = "";
      const shaders = gl.getAttachedShaders(prog) || [];
      for (let i = 0; i < shaders.length; i++) {
        const sh = shaders[i];
        if (gl.getShaderParameter(sh, gl.FRAGMENT_SHADER)) {
          fragmentSource = ext ? ext.getTranslatedShaderSource(sh) : gl.getShaderSource(sh) || "";
        }
      }
      const idxIntegrate = fragmentSource.indexOf("void integrateDualChannelStep");
      const idxAddSample = fragmentSource.indexOf("void addSample");
      return {
        hasVolume0Loc: loc0 !== null,
        hasVolume1Loc: loc1 !== null,
        volume0TextureUnit: unit0,
        volume1TextureUnit: unit1,
        fragmentChars: fragmentSource.length,
        fragmentSource,
        integrateBeforeAddSample: idxIntegrate >= 0 && idxAddSample >= 0 && idxIntegrate < idxAddSample,
        callsIntegrateInLoop: /integrateDualChannelStep\\(\\s*accCh0/.test(fragmentSource),
        declaresVolume0: /uniform\\s+highp\\s+sampler3D\\s+volume0/.test(fragmentSource),
        declaresVolume1: /uniform\\s+highp\\s+sampler3D\\s+volume1/.test(fragmentSource),
      };
    })()`,
  );
}

async function runDualOblique(page: import("@playwright/test").Page, mode: BisectMode) {
  const q = queryFor(mode);
  await page.goto(`${base}/?${q}`, { waitUntil: "domcontentloaded" });
  await bootIssue395LandmarksVolume(page, q);
  await openIssue395CubeAtInspectCentre(page);
  await expectDapiVisible(page, true);
  await expectPanckVisible(page, true);
  await setCubeLabels(page, false);
  await setCubePreset(page, "Oblique view");
  await waitCubeRefined(page);
  await page.waitForFunction(
    () => document.querySelector('[role="dialog"][aria-label="Cube"] .volume-cube__view')?.getAttribute("data-settled") === "true",
    null,
    { timeout: 60_000 },
  );
  await page.waitForTimeout(1500);

  const gl = await cubeGlInkStats(page, CUBE_VOLUME_INSET);
  const analysis = await analyzeIssue395PanckSitesInCubeView(page);
  const drawDiag = await page.evaluate(() => (window as unknown as { __issue395CubeDrawDiag?: unknown }).__issue395CubeDrawDiag);
  return {
    mode,
    gl,
    gatePass: (gl?.tissue ?? 0) >= 4000,
    sites: analysis?.sites,
    drawDiag,
  };
}

await mkdir(outDir, { recursive: true });
const head = execSync("git rev-parse HEAD", { cwd: "/workspace" }).toString().trim();

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, baseURL: base });

const mergeFirst = await runDualOblique(page, "merge");
const programDiag = await captureGlProgramDiagnostics(page);
if (programDiag && "fragmentSource" in programDiag && programDiag.fragmentSource) {
  await writeFile(`${outDir}/issue395-dual-linked-fragment.glsl`, programDiag.fragmentSource);
}
const { fragmentSource: _omit, ...programSummary } = programDiag as Record<string, unknown>;
void _omit;
await writeFile(`${outDir}/issue395-dual-program-diag.json`, JSON.stringify(programSummary, null, 2));

const ch0 = await runDualOblique(page, "ch0");
const ch1 = await runDualOblique(page, "ch1");

const results = [ch0, ch1, mergeFirst];
await writeFile(`${outDir}/issue395-dual-bisect-report.json`, JSON.stringify({ head, base, programSummary, results }, null, 2));

console.log(JSON.stringify({ head, programSummary, results }, null, 2));
await browser.close();
