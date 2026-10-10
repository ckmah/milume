import { LOGICAL_H, LOGICAL_W, LOOP_SEC } from "./constants.ts";
import { loadField } from "./field.ts";
import { createGl, drawPoints } from "./gl.ts";
import { framePoints } from "./simulate.ts";
import type { CellPoint } from "./types.ts";

export type HeroHandle = {
  pause: () => void;
  resume: () => void;
  destroy: () => void;
  isLive: () => boolean;
  getFrameId: () => number;
  isPaused: () => boolean;
};

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function capDpr(): number {
  return Math.min(2, window.devicePixelRatio || 1);
}

export async function mountHero(root: HTMLElement): Promise<HeroHandle> {
  const base = root.getAttribute("data-assets-base") ?? "assets/";
  const poster = root.querySelector<HTMLImageElement>(".milume-hero__poster");
  const canvas = root.querySelector<HTMLCanvasElement>(".milume-hero__canvas");
  if (!poster || !canvas) {
    throw new Error("milume-hero: missing poster or canvas");
  }

  let cells: CellPoint[] | null = null;
  let loadError = false;
  try {
    cells = await loadField(`${base}hero-points.bin`);
  } catch {
    loadError = true;
  }

  const reduced = prefersReducedMotion();
  const glBundle = reduced || loadError ? null : createGl(canvas);
  const live = Boolean(glBundle && cells);

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
  let start = performance.now();
  let width = 0;
  let height = 0;
  let dpr = 1;
  let layout = { scale: 1, offX: 0, offY: 0 };

  const resize = () => {
    const rect = root.getBoundingClientRect();
    dpr = capDpr();
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
    };
  };

  const tick = () => {
    raf = 0;
    if (!running || !glBundle || !cells) return;
    const t = ((performance.now() - start) / 1000) % LOOP_SEC;
    const pts = framePoints(cells, t);
    drawPoints(glBundle, pts, width, height, dpr, layout);
    frameId += 1;
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
  };
}
