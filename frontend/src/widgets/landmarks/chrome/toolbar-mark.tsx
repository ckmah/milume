import { useEffect } from "react";

const ACTIVE = "[aria-pressed='true'], [data-state='on'], [aria-checked='true'], .landmarks-hit--on";

type MarkState = { x: number; v: number; node: HTMLSpanElement };

/**
 * One ink line per active toolbar item, as wide as that button. A new active item springs
 * from the item it replaced. Top and side toolbars draw the line under the
 * item. A toolbar in the lower part of the widget draws it over the item,
 * on the edge that faces the canvas.
 */
export function ToolbarMarks({ root }: { root: HTMLElement | null }) {
  useEffect(() => {
    if (!root) return;
    const attached = new Map<HTMLElement, () => void>();

    const attach = (bar: HTMLElement) => {
      if (attached.has(bar)) return;
      const host = document.createElement("div");
      host.className = "tact-toolbar-marks";
      host.setAttribute("aria-hidden", "true");
      bar.appendChild(host);
      attached.set(bar, runMarks(bar, host));
    };

    const scan = () => {
      root.querySelectorAll<HTMLElement>(".landmarks-toolbar").forEach(attach);
      for (const [bar, stop] of attached) {
        if (!bar.isConnected) {
          stop();
          attached.delete(bar);
        }
      }
    };
    const mo = new MutationObserver(scan);
    mo.observe(root, { childList: true, subtree: true });
    scan();
    return () => {
      mo.disconnect();
      attached.forEach((stop) => stop());
    };
  }, [root]);
  return null;
}

function edgeOf(bar: HTMLElement): "over" | "under" {
  const widget = bar.closest(".landmarks");
  if (!(widget instanceof HTMLElement)) return "under";
  const widgetBox = widget.getBoundingClientRect();
  const barBox = bar.getBoundingClientRect();
  const mid = barBox.top + barBox.height / 2;
  return mid > widgetBox.top + widgetBox.height * 0.62 ? "over" : "under";
}

function actives(bar: HTMLElement, host: HTMLElement): HTMLElement[] {
  return [...bar.querySelectorAll<HTMLElement>(ACTIVE)].filter((el) => {
    if (host.contains(el)) return false;
    if (el.closest(".landmarks-toolbar") !== bar) return false;
    const box = el.getBoundingClientRect();
    return box.width > 0 && box.height > 0;
  });
}

function markBox(bar: HTMLElement, el: HTMLElement): { x: number; w: number } {
  const barBox = bar.getBoundingClientRect();
  const box = el.getBoundingClientRect();
  return { x: box.left - barBox.left, w: box.width };
}

function edgeY(bar: HTMLElement, el: HTMLElement, edge: "over" | "under"): number {
  const barBox = bar.getBoundingClientRect();
  const box = el.getBoundingClientRect();
  return edge === "over" ? box.top - barBox.top - 2 : box.bottom - barBox.top;
}

function runMarks(bar: HTMLElement, host: HTMLElement): () => void {
  const states = new Map<HTMLElement, MarkState>();
  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let raf = 0;
  let running = false;
  let last = 0;

  const kick = () => {
    if (running) return;
    running = true;
    last = 0;
    raf = requestAnimationFrame(frame);
  };

  const frame = (now: number) => {
    if (!bar.isConnected) {
      running = false;
      return;
    }
    const dt = last === 0 ? 0.016 : Math.min(0.032, (now - last) / 1000);
    last = now;
    const reduce = motion.matches;
    const edge = edgeOf(bar);
    host.dataset.edge = edge;
    const next = actives(bar, host);
    const nextSet = new Set(next);
    const leaving = [...states.keys()].filter((el) => !nextSet.has(el));

    for (const el of next) {
      if (states.has(el)) continue;
      const target = markBox(bar, el);
      let from = target.x;
      if (!reduce && leaving.length) {
        let best = 0;
        let bestDist = Infinity;
        leaving.forEach((old, index) => {
          const dist = Math.abs(states.get(old)!.x - target.x);
          if (dist < bestDist) {
            bestDist = dist;
            best = index;
          }
        });
        const old = leaving.splice(best, 1)[0]!;
        from = states.get(old)!.x;
        states.get(old)!.node.remove();
        states.delete(old);
      }
      const node = document.createElement("span");
      node.className = "tact-toolbar-mark";
      host.appendChild(node);
      states.set(el, { x: from, v: 0, node });
    }

    for (const old of leaving) {
      states.get(old)!.node.remove();
      states.delete(old);
    }

    let moving = false;
    for (const el of next) {
      const state = states.get(el);
      if (!state) continue;
      const target = markBox(bar, el);
      if (reduce || dt === 0) {
        state.x = target.x;
        state.v = 0;
      } else {
        const stiffness = 380;
        const damping = 28;
        const accel = -stiffness * (state.x - target.x) - damping * state.v;
        state.v += accel * dt;
        state.x += state.v * dt;
        if (Math.abs(state.x - target.x) > 0.4 || Math.abs(state.v) > 8) moving = true;
        else {
          state.x = target.x;
          state.v = 0;
        }
      }
      state.node.style.width = `${target.w}px`;
      state.node.style.transform = `translateX(${state.x}px)`;
      state.node.style.top = `${edgeY(bar, el, edge)}px`;
    }

    if (moving) raf = requestAnimationFrame(frame);
    else running = false;
  };

  const watch = new MutationObserver(kick);
  watch.observe(bar, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["aria-pressed", "data-state", "aria-checked", "class"],
  });
  const resize = new ResizeObserver(kick);
  resize.observe(bar);
  const onMotion = () => kick();
  motion.addEventListener("change", onMotion);
  kick();

  return () => {
    running = false;
    cancelAnimationFrame(raf);
    watch.disconnect();
    resize.disconnect();
    motion.removeEventListener("change", onMotion);
    host.remove();
    states.clear();
  };
}
