import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test } from "@playwright/test";
import { parse as parseYaml } from "yaml";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");

const SITE = process.env.E2E_SITE_URL ?? "http://127.0.0.1:8765";
const SLUG = "squidpy_color";
const RECIPE_PAGE = `${SITE}/docs/how-to/recipes/${SLUG}/index.html`;

type ShotsDoc = {
  shots: Array<{
    id: string;
    theme?: string;
    column: string;
    selection_count: number;
  }>;
};

test.describe("assembled recipe site (squidpy_color)", () => {
  test("marimo cells are not zero-height shells", async ({ page }) => {
    await page.goto(RECIPE_PAGE, { waitUntil: "networkidle", timeout: 120_000 });
    const zeros = await page.locator("marimo-cell").evaluateAll((els) =>
      els.filter((el) => {
        const r = el.getBoundingClientRect();
        return r.height <= 1 && r.width > 0;
      }).length,
    );
    expect(zeros, "empty marimo-cell shells").toBe(0);
  });

  test("recipe page avoids common British spellings in visible copy", async ({ page }) => {
    await page.goto(RECIPE_PAGE, { waitUntil: "networkidle", timeout: 120_000 });
    const prose = page.locator(".milume-recipe-studio-prose");
    await expect(prose.first()).toBeVisible({ timeout: 120_000 });
    const parts = await prose.allInnerTexts();
    const text = parts.join("\n").toLowerCase();
    const banned = ["colour", "colours", "neighbour", "neighbours", "favour", "behaviour"];
    for (const w of banned) {
      expect(text.includes(w), `visible copy should not include "${w}"`).toBe(false);
    }
  });

  test("shot list states match the widget and stills are unique by md5", async ({ page }) => {
    const shotsPath = path.join(REPO_ROOT, "demos", "recipes", SLUG, "shots.yaml");
    const doc = parseYaml(readFileSync(shotsPath, "utf8")) as ShotsDoc;
    const md5s: string[] = [];
    for (const shot of doc.shots) {
      await page.goto(RECIPE_PAGE, { waitUntil: "networkidle", timeout: 120_000 });
      const scheme = shot.theme === "slate" ? "slate" : "default";
      await page.evaluate((s) => {
        document.body.setAttribute("data-md-color-scheme", s);
        document.documentElement.setAttribute("data-md-color-scheme", s);
      }, scheme);
      await page.locator("canvas").first().waitFor({ state: "visible", timeout: 120_000 });
      await page.waitForFunction(
        () =>
          Boolean((window as any).__landmarksModel && (window as any).__landmarksEngine?.getViewState?.()),
        undefined,
        { timeout: 120_000 },
      );
      const state = await page.evaluate(() => {
        const m = (window as any).__landmarksModel;
        return {
          color: String(m.get("color") ?? ""),
          n: (m.get("selections") || []).length,
        };
      });
      expect(state.color, `shot ${shot.id} color`).toBe(shot.column);
      expect(state.n, `shot ${shot.id} selection_count`).toBe(shot.selection_count);
      const png = await page.screenshot({ type: "png", fullPage: true });
      md5s.push(createHash("md5").update(png).digest("hex"));
    }
    expect(new Set(md5s).size).toBe(md5s.length);
  });

  test("recipe payload stays within data and total budgets", () => {
    const measureScript = path.join(REPO_ROOT, "frontend", "scripts", "measure-recipe-payload.mjs");
    const out = execFileSync(
      process.execPath,
      [measureScript, RECIPE_PAGE],
      { cwd: path.join(REPO_ROOT, "frontend"), encoding: "utf8" },
    );
    const report = JSON.parse(out.trim()) as {
      data_transfer_bytes: number;
      total_transfer_bytes: number;
    };
    expect(report.data_transfer_bytes).toBeLessThanOrEqual(10_000_000);
    expect(report.total_transfer_bytes).toBeLessThanOrEqual(16_000_000);
  });
});
