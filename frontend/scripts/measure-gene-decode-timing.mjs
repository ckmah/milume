#!/usr/bin/env node
/**
 * Browser timing: harness load through first gene colour (gzip vs raw CSC).
 * Generates ileum fixtures on demand under frontend/dev/.ileum-gene-fixtures-cache (not committed).
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "@playwright/test";

const ROOT = join(import.meta.dirname, "..", "..");
const FIXTURE_DIR =
  process.env.MILUME_ILEUM_FIXTURE_DIR ?? join(ROOT, "frontend", "dev", ".ileum-gene-fixtures-cache");
const harnessBase = process.argv[2] ?? "http://127.0.0.1:5173";

function ensureFixtures() {
  const gzipPath = join(FIXTURE_DIR, "ileum-all-genes-gzip-fixture.json");
  if (existsSync(gzipPath)) return;
  spawnSync(
    "uv",
    [
      "run",
      "--directory",
      ROOT,
      "python",
      join(ROOT, "scripts/export-ileum-all-genes-timing-fixtures.py"),
      "--output-dir",
      FIXTURE_DIR,
    ],
    { stdio: "inherit" },
  );
}

async function measureHarness(page, fixtureName, label) {
  const fixturePath = join(FIXTURE_DIR, fixtureName);
  const url = `${harnessBase}/?fixture=/@fs${fixturePath}&eagerGenes=1`;
  await page.goto(url, { waitUntil: "networkidle", timeout: 180_000 });
  await page.waitForFunction(() => Boolean(window.__landmarksEngine), undefined, {
    timeout: 180_000,
  });
  return page.evaluate(async (tag) => {
    const model = window.__landmarksModel;
    const eng = window.__landmarksEngine;
    const genes = model.get("gene_names").map((g) => g.name);
    const gene = genes.find((n) => n === "Lgr5") ?? genes[0];
    const tLoad = performance.now();
    await new Promise((resolve) => {
      const tick = () => {
        if (eng.getGeneStats().pinnedGenes === genes.length) resolve(undefined);
        else requestAnimationFrame(tick);
      };
      tick();
    });
    const tPinned = performance.now();
    model.set("active_genes", [gene]);
    model.set("color_mode", "continuous");
    model.save_changes?.();
    await new Promise((resolve) => {
      const tick = () => {
        if (eng.getGeneStats().denseColumns >= 1) resolve(undefined);
        else requestAnimationFrame(tick);
      };
      tick();
    });
    return {
      label: tag,
      codec: model.get("gene_csc_codec") || "(raw)",
      nGenes: genes.length,
      loadToPinnedMs: Math.round((tPinned - tLoad) * 10) / 10,
      loadToColourMs: Math.round((performance.now() - tLoad) * 10) / 10,
      gene,
    };
  }, label);
}

ensureFixtures();

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const gzip = await measureHarness(page, "ileum-all-genes-gzip-fixture.json", "gzip");
const raw = await measureHarness(page, "ileum-all-genes-raw-fixture.json", "raw");
await browser.close();
console.log(JSON.stringify({ gzip, raw, fixtureDir: FIXTURE_DIR }, null, 2));
