import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";

export const DATASET_ID = "demos/data:ileum";
/** Wide enough for the widget; height matches dev harness shell (~820px at this width). */
export const VIEWPORT = { width: 960, height: 900 };

export function milumeSidecarSha(repoRoot) {
  const r = spawnSync("git", ["-C", repoRoot, "rev-parse", "--short", "HEAD"], {
    encoding: "utf8",
  });
  return (r.stdout || "local").trim();
}

export function writeSidecar(path, body) {
  writeFileSync(path, `${JSON.stringify(body, null, 1)}\n`);
}

/** Docs still captures: hide dev banner; optional cursor ring inside `.landmarks`. */
export async function installDocsCaptureChrome(page, theme) {
  await page.addInitScript((t) => {
    localStorage.setItem("milume-harness-theme", t);
  }, theme);
  await page.addInitScript(() => {
    const style = document.createElement("style");
    style.id = "docs-tool-capture-chrome";
    style.textContent = `
      .harness-toolbar { display: none !important; }
      .dialkit-root, [class*='dialkit'] { display: none !important; }
      .harness-cell-output { padding: 0 !important; }
      .harness-shell { min-height: 0 !important; }
      #docs-capture-cursor {
        position: absolute; width: 14px; height: 14px; margin: -2px 0 0 -2px;
        border: 2px solid rgba(255,255,255,0.95); border-radius: 50%;
        box-shadow: 0 0 0 1px rgba(0,0,0,0.55);
        pointer-events: none; z-index: 99999; display: none;
      }
    `;
    document.documentElement.appendChild(style);

    const hideDialkit = () => {
      document.querySelectorAll(".dialkit-root, [class*='dialkit']").forEach((el) => {
        el.style.setProperty("display", "none", "important");
      });
    };
    hideDialkit();
    new MutationObserver(hideDialkit).observe(document.documentElement, {
      childList: true,
      subtree: true,
    });

    const attachCursor = () => {
      const lm = document.querySelector(".landmarks");
      if (!lm || document.getElementById("docs-capture-cursor")) return;
      const dot = document.createElement("div");
      dot.id = "docs-capture-cursor";
      lm.appendChild(dot);
    };

    attachCursor();
    new MutationObserver(attachCursor).observe(document.documentElement, {
      childList: true,
      subtree: true,
    });

    document.addEventListener(
      "mousemove",
      (e) => {
        const lm = document.querySelector(".landmarks");
        const el = document.getElementById("docs-capture-cursor");
        if (!lm || !el) return;
        const r = lm.getBoundingClientRect();
        el.style.display = "block";
        el.style.left = `${e.clientX - r.left}px`;
        el.style.top = `${e.clientY - r.top}px`;
      },
      true,
    );
  });
}

/** Volume harness mounts under a fixed `.dark` shell; apply light/dark like issue-172 captures. */
export async function applyDocsHarnessTheme(page, theme) {
  const dark = theme === "dark";
  await page.evaluate((isDark) => {
    const root = document.documentElement;
    root.classList.remove("light", "dark", "dark-theme", "light-theme");
    if (isDark) root.classList.add("dark", "dark-theme");
    else root.classList.add("light", "light-theme");
    window.localStorage.setItem("milume-harness-theme", isDark ? "dark" : "light");
    const shell = document.querySelector(".min-h-screen");
    if (shell instanceof HTMLElement) {
      shell.classList.toggle("dark", isDark);
      shell.classList.toggle("bg-neutral-950", isDark);
      shell.classList.toggle("text-neutral-100", isDark);
      shell.classList.toggle("bg-white", !isDark);
      shell.classList.toggle("text-neutral-950", !isDark);
    }
    const widget = document.querySelector(".landmarks");
    if (widget instanceof HTMLElement) {
      widget.classList.toggle("dark", isDark);
      widget.classList.toggle("landmarks--dark", isDark);
      widget.classList.toggle("landmarks--light", !isDark);
    }
  }, dark);
  await page.waitForTimeout(300);
}

export async function waitForLandmarks(page) {
  await page.locator(".landmarks").first().waitFor({ state: "visible" });
  await page.locator("canvas.landmarks__webgl").first().waitFor({ state: "visible" });
  await page.waitForFunction(() => {
    const eng = window.__landmarksEngine;
    const vs = eng?.getViewState?.();
    return Boolean(vs && Number.isFinite(vs.zoom));
  });
  await page.waitForFunction(
    () => window.__landmarksEngine?.getPerfSnapshot?.().spatialIndexBuilt,
    null,
    { timeout: 120_000 },
  );
  await page.waitForTimeout(350);
}

export async function gotoDocsFixture(page, baseUrl, fixturePath) {
  const q = encodeURIComponent(fixturePath);
  await page.goto(`${baseUrl}/?fixture=${q}`, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await waitForLandmarks(page);
}

/** Reset view and pan to the densest spatial bin so the ileum section fills the widget. */
export async function fitDenseTissueView(page) {
  await page.evaluate(() => {
    const eng = window.__landmarksEngine;
    eng.resetZoom();
    const pts = eng.getPoints();
    if (!pts.length) return;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const [x, y] of pts) {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
    const cols = 24;
    const rows = 24;
    const dx = (maxX - minX) / cols || 1;
    const dy = (maxY - minY) / rows || 1;
    const bins = new Int32Array(cols * rows);
    for (const [x, y] of pts) {
      const ix = Math.min(cols - 1, Math.max(0, Math.floor((x - minX) / dx)));
      const iy = Math.min(rows - 1, Math.max(0, Math.floor((y - minY) / dy)));
      bins[iy * cols + ix] += 1;
    }
    let best = 0;
    let bestI = 0;
    for (let i = 0; i < bins.length; i++) {
      if (bins[i] > best) {
        best = bins[i];
        bestI = i;
      }
    }
    const bx = minX + (bestI % cols + 0.5) * dx;
    const by = minY + (Math.floor(bestI / cols) + 0.5) * dy;
    eng.panTo(bx, by, { animate: false });
  });
  await page.waitForTimeout(450);
}

export async function hideDocsHarnessChrome(page) {
  await page.evaluate(() => {
    document.querySelectorAll(".dialkit-root, [class*='dialkit']").forEach((el) => {
      el.style.setProperty("display", "none", "important");
    });
  });
}

export async function screenshotLandmarks(page, path) {
  await hideDocsHarnessChrome(page);
  await page.locator(".landmarks").first().screenshot({ path });
}
