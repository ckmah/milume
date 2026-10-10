import { LOGICAL_H, LOGICAL_W, LOOP_SEC } from "./constants.ts";
import { loadGpuField } from "./field.ts";
import { createGl, drawFrame } from "./gl.ts";

export type HeroHandle = {
  pause: () => void;
  resume: () => void;
  destroy: () => void;
  isLive: () => boolean;
  getFrameId: () => number;
  isPaused: () => boolean;
  getLastFrameMs: () => number;
  getLastSimMs: () => number;
  getLastDrawMs: () => number;
  setTime: (t: number) => void;
  renderOnce: () => void;
  getLoopTime: () => number;
};

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function capDpr(): number {
  return Math.min(2, window.devicePixelRatio || 1);
}

function loopPhase(wallMs: number, start: number, frozenT: number | null): number {
  if (frozenT !== null) return frozenT;
  const elapsed = (wallMs - start) / 1000;
  return elapsed - Math.floor(elapsed / LOOP_SEC) * LOOP_SEC;
}

export async function mountHero(root: HTMLElement): Promise<HeroHandle> {
  const base = root.getAttribute("data-assets-base") ?? "assets/";
  const poster = root.querySelector<HTMLImageElement>(".milume-hero__poster");
  const canvas = root.querySelector<HTMLCanvasElement>(".milume-hero__canvas");
  if (!poster || !canvas) {
    throw new Error("milume-hero: missing poster or canvas");
  }

  let field = null;
  let loadError = false;
  try {
    field = await loadGpuField(`${base}hero-points.bin`);
  } catch {
    loadError = true;
  }

  const reduced = prefersReducedMotion();
  const glBundle = !reduced && !loadError && field ? createGl(canvas, field) : null;
  const live = Boolean(glBundle);

  if (live) {
    poster.hidden = true;
    canvas.hidden = false;
    root.dataset.heroMode = "webgl";
  } else {
    poster.hidden = false;
    canvas.hidden = true;
    root.dataset.heroMode = "poster";
  }

  let running = live;
  let raf = 0;
  let frameId = 0;
  let lastFrameMs = 0;
  let lastSimMs = 0;
  let lastDrawMs = 0;
  let frozenT: number | null = null;
  let start = performance.now();
  let width = 0;
  let height = 0;
  let layout = { scale: 1, offX: 0, offY: 0, dpr: 1 };

  const resize = () => {
    const rect = root.getBoundingClientRect();
    const dpr = capDpr();
    width = Math.max(1, Math.round(rect.width * dpr));
    height = Math.max(1, Math.round(rect.height * dpr));
    canvas.width = width;
    canvas.height = height;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
    const lw = rect.width;
    const lh = rect.height;
    const cover = Math.max(lw / LOGICAL_W, lh / LOGICAL_H);
    layout = {
      scale: cover,
      offX: (lw - LOGICAL_W * cover) / 2,
      offY: (lh - LOGICAL_H * cover) / 2,
      dpr,
    };
  };

  const renderFrame = (wallMs: number) => {
    if (!glBundle) return;
    performance.mark("hero-begin");
    const t = loopPhase(wallMs, start, frozenT);
    lastSimMs = 0;
    const tDraw0 = performance.now();
    drawFrame(glBundle, t, width, height, layout);
    lastDrawMs = performance.now() - tDraw0;
    performance.mark("hero-end");
    const entries = performance.getEntriesByName("hero-frame");
    for (const e of entries) performance.clearMeasures(e.name);
    performance.measure("hero-frame", "hero-begin", "hero-end");
    const m = performance.getEntriesByName("hero-frame").pop();
    if (m) lastFrameMs = m.duration;
    performance.clearMarks("hero-begin");
    performance.clearMarks("hero-end");
    frameId += 1;
  };

  const tick = () => {
    raf = 0;
    if (!running || !glBundle) return;
    renderFrame(performance.now());
    raf = requestAnimationFrame(tick);
  };

  const schedule = () => {
    if (!running || !live) return;
    if (!raf) raf = requestAnimationFrame(tick);
  };

  const pause = () => {
    running = false;
    if (raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
  };

  const resume = () => {
    if (!live) return;
    frozenT = null;
    start = performance.now();
    running = true;
    schedule();
  };

  const io = new IntersectionObserver(
    (entries) => {
      const visible = entries.some((e) => e.isIntersecting);
      if (visible) resume();
      else pause();
    },
    { threshold: 0.05 },
  );
  io.observe(root);

  const onVis = () => {
    if (document.visibilityState === "hidden") pause();
    else if (root.getBoundingClientRect().bottom > 0 && root.getBoundingClientRect().top < window.innerHeight) {
      resume();
    }
  };
  document.addEventListener("visibilitychange", onVis);

  const ro = new ResizeObserver(() => {
    resize();
    schedule();
  });
  ro.observe(root);
  resize();

  if (live) schedule();

  return {
    pause,
    resume,
    destroy: () => {
      pause();
      io.disconnect();
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVis);
    },
    isLive: () => live,
    getFrameId: () => frameId,
    isPaused: () => !running,
    getLastFrameMs: () => lastFrameMs,
    getLastSimMs: () => lastSimMs,
    getLastDrawMs: () => lastDrawMs,
    setTime: (t: number) => {
      frozenT = t;
      pause();
      renderFrame(performance.now());
    },
    getLoopTime: () => loopPhase(performance.now(), start, frozenT),
    renderOnce: () => renderFrame(performance.now()),
  };
}
