import { expect, test, type Locator, type Page } from "@playwright/test";

/** Snapshot asserts run only with E2E_SCREENSHOTS=1, as on CI's update and UI evidence runs. */
export function screenshotsEnabled(): boolean {
  return process.env.E2E_SCREENSHOTS === "1";
}

export async function waitForEngine(page: Page, settleMs = 400) {
  await page.locator(".landmarks").first().waitFor({ state: "visible" });
  await page.locator("canvas.landmarks__webgl").first().waitFor({ state: "visible" });
  await page.waitForFunction(() => {
    const eng = (window as any).__landmarksEngine;
    const vs = eng?.getViewState?.();
    return Boolean(vs && Number.isFinite(vs.zoom));
  });
  // Let deck.gl finish a couple frames after first paint.
  await page.waitForTimeout(settleMs);
}

export async function getZoom(page: Page) {
  return page.evaluate(
    () => (window as any).__landmarksEngine.getViewState().zoom as number,
  );
}

/** Landmark tool (Point/Line/Spline/Shape) lives behind a dropdown; open it and pick `name`. */
export async function clickLandmarkTool(page: Page, name: string) {
  const trigger = page.getByRole("button", {
    name: /Right-click for landmark menu/,
  });
  await trigger.click({ button: "right" });
  // Accessible name also carries the shortcut glyph (e.g. "Point 1"), so anchor
  // only the start rather than requiring an exact match.
  await page.getByRole("menuitem", { name: new RegExp(`^${name}\\b`) }).click();
}

export async function getModel(page: Page, key: string) {
  return page.evaluate((k) => (window as any).__landmarksModel.get(k), key);
}

export async function setModel(page: Page, patch: Record<string, unknown>) {
  await page.evaluate((p) => {
    const model = (window as any).__landmarksModel;
    for (const [k, v] of Object.entries(p)) model.set(k, v);
    model.save_changes();
  }, patch);
}

/**
 * cube-motion runs on the Web Animations API, which the CSS reset below cannot stop. Its entrances
 * last 640 ms and lift the element, so Playwright's stability check waits them out on every click.
 * Zero every animation's timing instead; `finished` still resolves, so leave-then-unmount keeps working.
 */
function zeroWebAnimations() {
  const w = window as any;
  if (w.__motionOff) return;
  w.__motionOff = true;
  const animate = Element.prototype.animate;
  Element.prototype.animate = function (keyframes, options) {
    const timing = typeof options === "number" ? { duration: 0 } : { ...options, duration: 0, delay: 0, endDelay: 0 };
    return animate.call(this, keyframes, timing);
  };
}
const motionOffPages = new WeakSet<Page>();

export async function stabilizeUi(page: Page) {
  if (!motionOffPages.has(page)) {
    motionOffPages.add(page);
    await page.addInitScript(zeroWebAnimations);
  }
  await page.evaluate(zeroWebAnimations);
  // Idempotent: a shared worker page can be reloaded between tests, which drops the style.
  await page.evaluate(() => {
    if (document.getElementById("e2e-stabilize-ui")) return;
    const style = document.createElement("style");
    style.id = "e2e-stabilize-ui";
    style.textContent = `
      *, *::before, *::after {
        animation: none !important;
        transition: none !important;
        caret-color: transparent !important;
      }
    `;
    document.head.appendChild(style);
  });
}

/** Visual assert — keep call sites to 2–3 biggest state changes per widget. */
export async function shot(page: Page, name: string, target?: Locator) {
  if (!screenshotsEnabled()) {
    test.info().annotations.push({
      type: "note",
      description: `Skipped screenshot "${name}" (set E2E_SCREENSHOTS=1)`,
    });
    return;
  }
  const locator = target ?? page.locator(".landmarks").first();
  await expect(locator).toHaveScreenshot(`${name}.png`, {
    animations: "disabled",
  });
}

export async function canvasBox(page: Page) {
  const canvas = page.locator("canvas.landmarks__webgl").first();
  const box = await canvas.boundingBox();
  expect(box).toBeTruthy();
  return box!;
}

export type LassoStrokeOptions = {
  /** Wall-clock duration of the closed circle (default ~3 s, Clarence / molab). */
  durationMs?: number;
  /** Angular samples around the circle (default 96). */
  steps?: number;
  /** Inset from the canvas edge as a fraction of half-width/height (default 0.1). */
  inset?: number;
  /** Step index at which to call `window.__molabPickingLeaveHook` (molab stress). */
  pickingLeaveAtStep?: number;
  /** Runs right after `mousedown`, before tracing (synthetic `mouseleave`, etc.). */
  afterPress?: () => Promise<void>;
  /** Runs after the circle trace, before `mouseup` (mid-stroke probes). */
  beforeRelease?: () => Promise<void>;
};

/**
 * Human-like lasso: press, trace a smooth closed circle in many small moves, release.
 * Caller must already be in lasso mode and use page coordinates (`canvasBox` / picking box).
 */
export async function drawLassoStroke(
  page: Page,
  box: { x: number; y: number; width: number; height: number },
  opts: LassoStrokeOptions = {},
) {
  const durationMs = opts.durationMs ?? 3000;
  const steps = opts.steps ?? 96;
  const inset = opts.inset ?? 0.1;
  const cx = box.x + box.width * 0.5;
  const cy = box.y + box.height * 0.5;
  const rx = box.width * (0.5 - inset);
  const ry = box.height * (0.5 - inset);
  const delayMs = Math.max(1, Math.floor(durationMs / steps));

  await page.mouse.move(cx + rx, cy);
  await page.mouse.down();
  if (opts.afterPress) await opts.afterPress();
  for (let i = 0; i <= steps; i++) {
    if (opts.pickingLeaveAtStep === i) {
      await page.evaluate(() => (window as any).__molabPickingLeaveHook?.());
    }
    const a = (i / steps) * Math.PI * 2;
    await page.mouse.move(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry);
    if (i < steps) await page.waitForTimeout(delayMs);
  }
  if (opts.beforeRelease) await opts.beforeRelease();
  await page.mouse.up();
}

/** Short quick lasso (~300 ms, ~10 moves) for click-vs-drag threshold tests. */
export async function drawLassoStrokeFast(
  page: Page,
  box: { x: number; y: number; width: number; height: number },
  opts: Omit<LassoStrokeOptions, "durationMs" | "steps"> = {},
) {
  await drawLassoStroke(page, box, { ...opts, durationMs: 300, steps: 10 });
}

/** Find the plot canvas through open shadow roots (anywidget / molab). */
export async function queryLandmarksCanvas(page: Page) {
  return page.evaluate(() => {
    const visit = (root: Document | ShadowRoot): HTMLCanvasElement | null => {
      const hit = root.querySelector("canvas.landmarks__webgl");
      if (hit) return hit as HTMLCanvasElement;
      for (const el of root.querySelectorAll("*")) {
        if (el instanceof HTMLElement && el.shadowRoot) {
          const nested = visit(el.shadowRoot);
          if (nested) return nested;
        }
      }
      return null;
    };
    return visit(document);
  });
}

/**
 * Molab-like embed stress: tall scrolled page, CSS scale, picking-canvas leave with a
 * shadow-host `relatedTarget` (anywidget retargeting), without reparenting the widget
 * (reparenting collapses layout before the engine can resize).
 */
export async function applyMolabShadowEmbed(page: Page, opts: { scale?: boolean } = {}) {
  const useScale = opts.scale !== false;
  await page.evaluate(() => {
    let outer = document.getElementById("molab-shadow-outer");
    if (!outer) {
      outer = document.createElement("div");
      outer.id = "molab-shadow-outer";
      outer.style.minHeight = "180vh";
      outer.style.paddingTop = "40vh";
      outer.style.paddingBottom = "40vh";
      document.body.prepend(outer);
      const created = outer;
      ((window as any).__e2eUndo ??= []).push(() => created.remove());
    }
    let host = document.getElementById("molab-anywidget-host");
    if (!host) {
      host = document.createElement("div");
      host.id = "molab-anywidget-host";
      host.className = "milume-widget-host";
      outer.appendChild(host);
    }
    const widget = document.querySelector(".harness-cell-output") as HTMLElement | null;
    widget?.scrollIntoView({ block: "center", inline: "nearest" });
    window.scrollTo(0, Math.max(0, (host as HTMLElement).offsetTop - 48));
  });
  await page.waitForTimeout(150);

  if (useScale) await applyMolabViewportStress(page);

  await page.evaluate(() => {
    const visit = (root: Document | ShadowRoot): HTMLCanvasElement | null => {
      const hit = root.querySelector("canvas.landmarks__webgl");
      if (hit) return hit as HTMLCanvasElement;
      for (const el of root.querySelectorAll("*")) {
        if (el instanceof HTMLElement && el.shadowRoot) {
          const nested = visit(el.shadowRoot);
          if (nested) return nested;
        }
      }
      return null;
    };
    const webgl = visit(document);
    const plot = webgl?.parentElement as HTMLElement | null;
    if (plot && webgl && !plot.querySelector("#deck-picking-stub")) {
      plot.style.position = "relative";
      const pick = document.createElement("canvas");
      pick.id = "deck-picking-stub";
      pick.setAttribute("data-engine", "deck-picking");
      pick.style.cssText =
        "position:absolute;inset:0;width:100%;height:100%;z-index:2;pointer-events:auto";
      pick.width = webgl.width || webgl.clientWidth;
      pick.height = webgl.height || webgl.clientHeight;
      plot.appendChild(pick);
      const prevPosition = plot.style.getPropertyValue("position");
      ((window as any).__e2eUndo ??= []).push(() => {
        pick.remove();
        plot.style.position = prevPosition;
      });
    }
    if (!(window as any).__molabPickingLeaveHook) {
      ((window as any).__e2eUndo ??= []).push(() => {
        delete (window as any).__molabPickingLeaveHook;
      });
    }
    (window as any).__molabPickingLeaveHook = () => {
      const canvas = visit(document);
      const host = document.getElementById("molab-anywidget-host");
      canvas?.dispatchEvent(
        new MouseEvent("mouseleave", {
          bubbles: true,
          relatedTarget: host,
        }),
      );
    };
  });
  await page.evaluate(() => (window as any).__landmarksEngine?.resize?.());
}

/** Deck.gl picking layer (molab) stacked above the WebGL map in shadow harness tests. */
export async function molabPickingCanvasBox(page: Page) {
  const box = await page.locator("canvas#deck-picking-stub").first().boundingBox();
  expect(box).toBeTruthy();
  return box!;
}

/** molab-style CSS scale on the landmarks root (layout size unchanged). */
export async function applyMolabViewportStress(page: Page) {
  await page.evaluate(() => {
    const root = document.querySelector(".landmarks") as HTMLElement | null;
    if (!root) return;
    const prev = [root.style.transform, root.style.transformOrigin];
    ((window as any).__e2eUndo ??= []).push(() => {
      root.style.transform = prev[0];
      root.style.transformOrigin = prev[1];
    });
    root.style.transform = "scale(0.88)";
    root.style.transformOrigin = "center center";
  });
  await page.evaluate(() => (window as any).__landmarksEngine?.resize?.());
}

/** Cell output that mounts at zero height then expands (marimo / iframe layout). */
export async function growLandmarksFromZeroHeight(page: Page, openHeightPx = 560) {
  await page.evaluate(() => {
    const widget = document.querySelector(".landmarks") as HTMLElement | null;
    if (!widget?.parentElement) return;
    let shell = document.getElementById("molab-deferred-shell");
    if (!shell) {
      shell = document.createElement("div");
      shell.id = "molab-deferred-shell";
      const parent = widget.parentElement;
      parent.insertBefore(shell, widget);
      shell.appendChild(widget);
      // React still owns the widget under `parent`: move it back before the next remount,
      // or React's removeChild throws and the harness never renders `.landmarks` again.
      const created = shell;
      ((window as any).__e2eUndo ??= []).push(() => {
        for (const child of Array.from(created.childNodes)) parent.insertBefore(child, created);
        created.remove();
      });
    }
    shell.style.height = "0";
    shell.style.overflow = "hidden";
  });
  await page.waitForTimeout(100);
  await page.evaluate((h) => {
    const shell = document.getElementById("molab-deferred-shell");
    if (shell) shell.style.height = `${h}px`;
  }, openHeightPx);
  await page.waitForTimeout(250);
  await page.evaluate(() => (window as any).__landmarksEngine?.resize?.());
}

export async function bootLandmarksHarness(page: Page) {
  const isWarm = await page
    .evaluate(() => typeof (window as any).__harnessReset === "function")
    .catch(() => false);
  if (isWarm) {
    // Shared worker page: remount the widget on a fresh model, no page load.
    await page.evaluate(() => (window as any).__harnessReset());
    await waitForEngine(page, 150);
    await stabilizeUi(page);
    return;
  }
  await page.addInitScript(() => {
    window.localStorage.setItem("milume-harness-theme", "dark");
  });
  await page.goto("/", { waitUntil: "networkidle" });
  await waitForEngine(page);
  await stabilizeUi(page);
}

/**
 * Landmarks over the toy SpatialData (`E2E_HARNESS=landmarks-volume`); the cube opens from Inspect.
 * `query` sets harness-only options (`window=<µm>`, `budgets=<preview>,<dock>`); a warm page remounts with them
 * instead of reloading, and the next boot without a query puts the defaults back.
 */
export async function bootLandmarksVolumeHarness(page: Page, query = "") {
  const isWarm = await page
    .evaluate(() => typeof (window as any).__harnessReset === "function")
    .catch(() => false);
  if (isWarm) {
    await page.evaluate((q) => (window as any).__harnessReset(q), query);
    await waitForEngine(page, 150);
    await stabilizeUi(page);
    return;
  }
  await page.goto(query ? `/?${query}` : "/", { waitUntil: "networkidle" });
  await waitForEngine(page);
  await stabilizeUi(page);
}

export async function toyInspectBox(page: Page) {
  const panel = page
    .locator("p")
    .filter({ hasText: "Toy inspect. Drag the 100 µm square." })
    .locator("..")
    .locator(".cursor-crosshair")
    .first();
  const box = await panel.boundingBox();
  expect(box).toBeTruthy();
  return { panel, box: box! };
}

/** `.volume-cube__view` inside the immersive Cube dialog (Inspect). */
export function cubeViewInDialog(page: Page) {
  return page.getByRole("dialog", { name: "Cube" }).locator(".volume-cube__view");
}

export async function resetCubeRenderCount(page: Page) {
  await page.evaluate(() => {
    (window as { __volumeCubeRenderCount?: number }).__volumeCubeRenderCount = 0;
  });
}

export async function readCubeRenderCount(page: Page) {
  return page.evaluate(() => (window as { __volumeCubeRenderCount?: number }).__volumeCubeRenderCount ?? 0);
}

/**
 * Cube has finished refining and label geometry is stable — `data-settled="true"` when
 * VolumeCube exposes it; otherwise refining off, labels on, and stable `data-label-cells`.
 */
export async function waitForCubeSettled(page: Page, { timeout = 120_000 } = {}) {
  const view = cubeViewInDialog(page);
  await expect(view).toHaveAttribute("data-refining", "false", { timeout });

  const usesSettledAttr = await view.evaluate((el) => el.hasAttribute("data-settled"));
  if (usesSettledAttr) {
    await expect(view).toHaveAttribute("data-settled", "true", { timeout });
    return;
  }

  await expect(view).toHaveAttribute("data-labels", "on", { timeout });
  await page.waitForFunction(
    () => {
      const el = document.querySelector('[role="dialog"][aria-label="Cube"] .volume-cube__view');
      if (!el) return false;
      return Number(el.getAttribute("data-label-cells") ?? 0) > 0;
    },
    null,
    { timeout },
  );
  let last = -1;
  let stable = 0;
  while (stable < 3) {
    await page.waitForTimeout(200);
    const cells = await page.evaluate(
      () =>
        Number(
          document.querySelector('[role="dialog"][aria-label="Cube"] .volume-cube__view')?.getAttribute(
            "data-label-cells",
          ) ?? 0,
        ),
    );
    if (cells === last) stable += 1;
    else {
      last = cells;
      stable = 0;
    }
  }
}
